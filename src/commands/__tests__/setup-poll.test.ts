import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Auto-hoisted: applies to all imports below.
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request() {
      return { status: 200, data: { status: 'expired' } };
    }
  },
}));

import { AgentStore } from '../../storage/agent-store';
import { setupPollCommand } from '../setup';

describe('setupPollCommand', () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;
  let origWrite: typeof process.stdout.write;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-poll-'));
    process.env.PRAVA_STATE_DIR = dir;
    logs = [];
    errs = [];
    origLog = console.log;
    origErr = console.error;
    origWrite = process.stdout.write;
    console.log = (m?: unknown) => {
      if (m !== undefined) logs.push(String(m));
    };
    console.error = (m?: unknown) => {
      if (m !== undefined) errs.push(String(m));
    };
    process.stdout.write = (() => true) as typeof process.stdout.write;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
      throw new Error(`EXIT_${c}`);
    }) as never);
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    process.stdout.write = origWrite;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('exits 2 with "Link expired" when local linkCreatedAt is past TTL', async () => {
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_old',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_old',
    });
    await expect(setupPollCommand()).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toMatch(/Link expired\. Run `prava setup` again\./);
  });

  it('exits 2 with "Link expired" when server returns expired', async () => {
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_x',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      linkUrl:
        'https://pay.prava.space/link-agent?lid=lk_x&pk=pk&n=Claude%20Code&p=claude-code&iat=1&sig=abc',
    });
    await expect(setupPollCommand()).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toMatch(/Link expired\. Run `prava setup` again\./);
  }, 15_000);
});
