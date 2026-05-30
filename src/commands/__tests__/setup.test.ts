import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verify, createPublicKey } from 'node:crypto';
import { AgentStore } from '../../storage/agent-store';
import { canonicalCreateMessage } from '../../crypto/link-sig';

vi.mock('../../config', () => ({ config: { dashboardUrl: 'https://pay.prava.space' } }));

// Capture the request the CLI makes to /create, and control the response.
const captured = vi.hoisted(() => ({ req: null as any }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      return {
        status: 201,
        data: { lid: 'lk_srv123456789', expires_at: '2026-05-30T22:45:00.000Z' },
        headers: {},
      };
    }
  },
}));

describe('setupCommand (short-URL create flow)', () => {
  let dir: string;
  let logs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-setup-'));
    process.env.PRAVA_STATE_DIR = dir;
    logs = [];
    origLog = console.log;
    console.log = (msg?: unknown) => {
      if (msg !== undefined) logs.push(String(msg));
    };
    captured.req = null;
  });

  afterEach(() => {
    console.log = origLog;
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('POSTs a valid create request and prints the short server-issued URL', async () => {
    const { setupCommand } = await import('../setup');
    await setupCommand({ name: 'Claude Code', platform: 'claude-code' });

    // 1. The printed URL is the short form — only ?lid=, nothing else.
    const printedUrl = logs.find((l) => l.includes('?lid='));
    expect(printedUrl).toBe('https://pay.prava.space/link-agent?lid=lk_srv123456789');
    expect(printedUrl!).not.toMatch(/&/); // no extra query params

    // 2. The create request hit the right endpoint with the expected body shape.
    expect(captured.req).not.toBeNull();
    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/agents/link/create');
    expect(captured.req.body.name).toBe('Claude Code');
    expect(captured.req.body.platform).toBe('claude-code');
    expect(typeof captured.req.body.iat).toBe('number');
    expect(typeof captured.req.body.public_key).toBe('string');
    expect(typeof captured.req.body.sig).toBe('string');

    // 3. The sig in the body verifies against the lid-less create canonical.
    const body = captured.req.body;
    const pub = createPublicKey({
      key: Buffer.from(body.public_key, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const canonical = canonicalCreateMessage({
      pk: body.public_key,
      name: body.name,
      platform: body.platform ?? '',
      description: body.description ?? '',
      iat: body.iat,
    });
    const ok = verify(
      null,
      Buffer.from(canonical, 'utf-8'),
      pub,
      Buffer.from(body.sig, 'base64url'),
    );
    expect(ok).toBe(true);

    // 4. Local state persists the server-issued lid + short URL.
    const stored = new AgentStore(dir).load();
    expect(stored).not.toBeNull();
    expect(stored!.linkId).toBe('lk_srv123456789');
    expect(stored!.linkUrl).toBe('https://pay.prava.space/link-agent?lid=lk_srv123456789');
    expect(stored!.linkCreatedAt).toBeTypeOf('string');
  });
});
