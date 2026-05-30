import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentStore } from '../../storage/agent-store';

describe('statusCommand — local expiry detection', () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-status-'));
    process.env.PRAVA_STATE_DIR = dir;
    logs = [];
    errs = [];
    origLog = console.log;
    origErr = console.error;
    console.log = (m?: unknown) => {
      if (m !== undefined) logs.push(String(m));
    };
    console.error = (m?: unknown) => {
      if (m !== undefined) errs.push(String(m));
    };
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never);
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    exitSpy.mockRestore();
    vi.resetModules();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('prints "Link expired" and exits 2 when linkCreatedAt is older than 15 minutes', async () => {
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_old',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_old',
    });
    const { statusCommand } = await import('../status');
    await expect(statusCommand()).rejects.toThrow('EXIT_2');
    expect([...logs, ...errs].join('\n')).toMatch(/Link expired\. Run `prava setup` again\./);
  });

  it('re-prints the linkUrl when pending and not yet expired', async () => {
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_fresh',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_fresh&iat=1&sig=x',
    });
    // Mock the HTTP client so the network call returns pending.
    vi.doMock('../../http/client.js', () => ({
      PravaClient: class {
        async request() {
          return { status: 200, data: { status: 'pending' } };
        }
      },
    }));
    const { statusCommand } = await import('../status');
    await expect(statusCommand()).rejects.toThrow('EXIT_2');
    const out = logs.join('\n');
    expect(out).toMatch(/Status:\s*pending/);
    expect(out).toMatch(/Link:\s*https:\/\/pay\.prava\.space\/link-agent\?lid=lk_fresh/);
  });

  it('exits 2 with Link expired when server returns expired status', async () => {
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_skew',
      name: 'Claude Code',
      linked: false,
      // Locally still in window, but server disagrees due to clock skew
      linkCreatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_skew&iat=1&sig=x',
    });
    vi.doMock('../../http/client.js', () => ({
      PravaClient: class {
        async request() {
          return { status: 200, data: { status: 'expired' } };
        }
      },
    }));
    const { statusCommand } = await import('../status');
    await expect(statusCommand()).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toMatch(/Link expired\. Run `prava setup` again\./);
  });
});
