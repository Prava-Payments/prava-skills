/**
 * Prava HTTP Client
 *
 * Makes signed API requests to the Prava backend.
 * Auto-attaches Ed25519 signature headers when agent credentials provided.
 * Checks X-Min-CLI-Version and X-Min-Skill-Version response headers for update notifications.
 */

import { signRequest } from '../crypto/keys.js';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  agentId?: string;
  privateKey?: string;
  /** Per-request timeout override (ms). Defaults to config.requestTimeoutMs. */
  timeoutMs?: number;
}

interface ApiResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

function getCliVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.1';
  } catch {
    return '0.0.1';
  }
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/**
 * Decide what to do when the CLI is at `current` and the server requires at
 * least `minVersion`:
 *   - 'ok'    — current >= minimum, nothing to do
 *   - 'warn'  — only the PATCH digit is behind → optional bug-fix update
 *   - 'block' — MAJOR or MINOR is behind → mandatory (server contract changed)
 *
 * Pure + exported for unit testing.
 */
export function cliVersionVerdict(
  current: string,
  minVersion: string,
): 'ok' | 'warn' | 'block' {
  if (compareSemver(current, minVersion) >= 0) return 'ok';

  const parse = (v: string) => {
    const parts = v.split('.');
    return {
      major: parseInt(parts[0] || '0', 10) || 0,
      minor: parseInt(parts[1] || '0', 10) || 0,
    };
  };
  const cur = parse(current);
  const req = parse(minVersion);

  // Below minimum. If major+minor match, the only gap is patch → warn.
  // Any difference in major or minor is mandatory → block.
  return cur.major === req.major && cur.minor === req.minor ? 'warn' : 'block';
}

/**
 * Decide whether to warn about the skill version. The CLI cannot read the
 * agent's LOADED skill version on its own, so the agent passes it via the
 * PRAVA_SKILL_VERSION env var (sourced from its SKILL.md frontmatter).
 *   - 'ok'      — agent reported a version >= the server minimum → stay silent
 *   - 'behind'  — agent reported a version and it's below the minimum → genuinely outdated
 *   - 'unknown' — no version supplied → we cannot tell; do NOT claim "update required"
 *
 * Splitting 'behind' from 'unknown' matters: it lets the CLI print an accurate
 * message the skill can trust literally, instead of a blanket "update required"
 * that also fires whenever the agent merely forgot the PRAVA_SKILL_VERSION prefix.
 *
 * Pure + exported for unit testing.
 */
export function skillVersionVerdict(
  loadedVersion: string | undefined,
  minVersion: string,
): 'ok' | 'behind' | 'unknown' {
  if (!loadedVersion) return 'unknown';
  return compareSemver(loadedVersion, minVersion) >= 0 ? 'ok' : 'behind';
}

// Per-process de-dupe so poll loops (many requests in one command) don't repeat
// the same warning on every tick. Keyed by warning type.
const warnedOnce = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(message);
}

/**
 * Read the USER'S INSTALLED skill version from its SKILL.md (NOT the CLI's bundle — the whole
 * point is to reflect what the user actually has). Checks the standard skill install dirs; returns
 * undefined if not found, so the caller falls back to PRAVA_SKILL_VERSION or skips (never false-warns).
 */
export function getInstalledSkillVersion(skillName: string): string | undefined {
  const candidates = [
    join(homedir(), '.claude', 'skills', skillName, 'SKILL.md'),
    join(homedir(), '.agents', 'skills', skillName, 'SKILL.md'),
    join(process.cwd(), '.claude', 'skills', skillName, 'SKILL.md'),
  ];
  for (const p of candidates) {
    try {
      const m = readFileSync(p, 'utf-8').match(/^version:\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch {
      // not here — try the next location
    }
  }
  return undefined;
}

export class PravaClient {
  private serverUrl: string;
  private cliVersion: string;
  private skillName: string;

  // skillName is inferred from the command group (shop → prava-shopping; setup/sessions/status →
  // prava-pay), so the server returns that skill's minimum version — no env prefix needed.
  constructor(serverUrl?: string, skillName: string = 'prava-pay') {
    this.serverUrl = serverUrl ?? config.apiServerUrl;
    this.cliVersion = getCliVersion();
    this.skillName = skillName;
  }

  async request<T>(opts: RequestOptions): Promise<ApiResponse<T>> {
    const url = `${this.serverUrl}${opts.path}`;
    const bodyStr = opts.body ? JSON.stringify(opts.body) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // The skill is inferred from the command group (see constructor), so the server returns that
    // skill's minimum version — no PRAVA_SKILL_NAME env needed.
    headers['X-Skill-Name'] = this.skillName;

    // Add signature headers if agent credentials provided
    if (opts.agentId && opts.privateKey) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signRequest(opts.privateKey, timestamp, bodyStr);

      headers['X-Agent-Id'] = opts.agentId;
      headers['X-Timestamp'] = timestamp;
      headers['X-Signature'] = signature;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? config.requestTimeoutMs);

    try {
      const response = await fetch(url, {
        method: opts.method,
        headers,
        body: opts.method === 'POST' ? bodyStr : undefined,
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({})) as T;

      // Check version headers
      const minVersion = response.headers.get('x-min-cli-version');
      if (minVersion) {
        this.checkCliVersion(minVersion);
      }

      const minSkillVersion = response.headers.get('x-min-skill-version');
      if (minSkillVersion) {
        this.checkSkillVersion(minSkillVersion);
      }

      return {
        status: response.status,
        data,
        headers: Object.fromEntries(response.headers.entries()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private checkCliVersion(minVersion: string): void {
    const verdict = cliVersionVerdict(this.cliVersion, minVersion);

    if (verdict === 'block') {
      // MAJOR or MINOR behind the server's minimum — the request/response
      // contract changed in a way this CLI cannot speak. Mandatory update.
      console.error(
        `\nCritical update required. Current: ${this.cliVersion}, Required: ${minVersion}` +
        `\nRun: npm update -g @prava-sdk/cli\n`,
      );
      process.exit(1);
    }

    if (verdict === 'warn') {
      // Only the PATCH digit is behind — backward-compatible bug fix, optional.
      warnOnce(
        'cli-version',
        `\nUpdate available: npm update -g @prava-sdk/cli (current: ${this.cliVersion}, latest: ${minVersion})\n`,
      );
    }
  }

  private checkSkillVersion(minSkillVersion: string): void {
    // Resolve the user's ACTUAL skill version: read the installed SKILL.md first (zero-friction on
    // hosts we know, e.g. Claude Code's ~/.claude/skills), fall back to PRAVA_SKILL_VERSION (host-
    // agnostic, set by the loaded skill). Neither → 'unknown' (soft note, never false-"required").
    const skillName = this.skillName;
    const loadedVersion =
      getInstalledSkillVersion(skillName) ?? process.env['PRAVA_SKILL_VERSION'];
    const verdict = skillVersionVerdict(loadedVersion, minSkillVersion);
    if (verdict === 'ok') return;

    if (verdict === 'behind') {
      // We verified the reported version is actually below the minimum.
      warnOnce(
        'skill-version',
        `\nSkill update required (minimum: ${minSkillVersion}).` +
        `\nRun: npx skills update ${skillName} -g\n`,
      );
      return;
    }
    // 'unknown' — couldn't read the installed skill version (non-standard host skill dir) and no
    // PRAVA_SKILL_VERSION override. Don't cry "required"; just flag it softly.
    warnOnce(
      'skill-version',
      `\nCould not verify ${skillName} version (server minimum: ${minSkillVersion}).` +
      `\nIf it's outdated, run: npx skills update ${skillName} -g\n`,
    );
  }
}
