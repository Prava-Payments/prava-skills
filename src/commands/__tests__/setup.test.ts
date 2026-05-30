import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verify, createPublicKey } from 'node:crypto';
import { AgentStore } from '../../storage/agent-store';
import { canonicalLinkMessage } from '../../crypto/link-sig';

vi.mock('../../config', () => ({ config: { dashboardUrl: 'https://pay.prava.space' } }));

describe('setupCommand', () => {
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
  });

  afterEach(() => {
    console.log = origLog;
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('prints a URL with iat and sig, persists linkCreatedAt + linkUrl, and the sig verifies', async () => {
    const { setupCommand } = await import('../setup');
    await setupCommand({ name: 'Claude Code', platform: 'claude-code' });

    const printedUrl = logs.find((l) => l.includes('?lid='));
    expect(printedUrl).toBeDefined();
    expect(printedUrl!).toMatch(/&iat=\d+/);
    expect(printedUrl!).toMatch(/&sig=[A-Za-z0-9_-]+/);

    const stored = new AgentStore(dir).load();
    expect(stored).not.toBeNull();
    expect(stored!.linkCreatedAt).toBeTypeOf('string');
    expect(stored!.linkUrl).toBe(printedUrl);

    // Reconstruct + verify the signature against the canonical message.
    const u = new URL(printedUrl!);
    const params = {
      lid: u.searchParams.get('lid')!,
      pk: u.searchParams.get('pk')!,
      name: u.searchParams.get('n')!,
      platform: u.searchParams.get('p') ?? '',
      description: u.searchParams.get('d') ?? '',
      iat: Number(u.searchParams.get('iat')),
    };
    const sig = u.searchParams.get('sig')!;
    const pub = createPublicKey({
      key: Buffer.from(params.pk, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const ok = verify(
      null,
      Buffer.from(canonicalLinkMessage(params), 'utf-8'),
      pub,
      Buffer.from(sig, 'base64url'),
    );
    expect(ok).toBe(true);
  });
});
