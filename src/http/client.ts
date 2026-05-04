/**
 * Prava HTTP Client
 *
 * Makes signed API requests to the Prava backend.
 * Auto-attaches Ed25519 signature headers when agent credentials provided.
 * Checks X-Min-CLI-Version and X-Min-Skill-Version response headers for update notifications.
 */

import { signRequest } from '../crypto/keys.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  agentId?: string;
  privateKey?: string;
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

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

export class PravaClient {
  private serverUrl: string;
  private cliVersion: string;

  constructor(serverUrl?: string) {
    this.serverUrl = serverUrl ?? config.apiServerUrl;
    this.cliVersion = getCliVersion();
  }

  async request<T>(opts: RequestOptions): Promise<ApiResponse<T>> {
    const url = `${this.serverUrl}${opts.path}`;
    const bodyStr = opts.body ? JSON.stringify(opts.body) : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add signature headers if agent credentials provided
    if (opts.agentId && opts.privateKey) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signRequest(opts.privateKey, timestamp, bodyStr);

      headers['X-Agent-Id'] = opts.agentId;
      headers['X-Timestamp'] = timestamp;
      headers['X-Signature'] = signature;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

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
    const cmp = compareSemver(this.cliVersion, minVersion);
    if (cmp < 0) {
      // Check if major version mismatch (critical — block)
      const currentMajor = parseInt(this.cliVersion.split('.')[0] || '0', 10);
      const requiredMajor = parseInt(minVersion.split('.')[0] || '0', 10);

      if (requiredMajor > currentMajor) {
        console.error(
          `\nCritical update required. Current: ${this.cliVersion}, Required: ${minVersion}` +
          `\nRun: npm update -g @prava-sdk/cli\n`,
        );
        process.exit(1);
      }

      // Minor/patch — warn but continue
      console.warn(
        `\nUpdate available: npm update -g @prava-sdk/cli (current: ${this.cliVersion}, latest: ${minVersion})\n`,
      );
    }
  }

  private checkSkillVersion(minSkillVersion: string): void {
    console.warn(
      `\nSkill update required (minimum: ${minSkillVersion}).` +
      `\nRun: npx skills update prava-agent-payments -g\n`,
    );
  }
}
