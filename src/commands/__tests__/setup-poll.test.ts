import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Controllable mock response — set per test before calling setupPollCommand.
const mockState = vi.hoisted(() => ({ status: 'expired' as string }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request() {
      return { status: 200, data: { status: mockState.status } };
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
    mockState.status = 'expired';
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
    mockState.status = 'expired';
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_xxxxxxxxxxx',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_xxxxxxxxxxx',
    });
    await expect(setupPollCommand()).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toMatch(/Link expired\. Run `prava setup` again\./);
  }, 15_000);

  it('exits 2 with "Setup denied by user." when server returns denied', async () => {
    mockState.status = 'denied';
    new AgentStore(dir).save({
      privateKey: 'p',
      publicKey: 'pk',
      linkId: 'lk_denied12345',
      name: 'Claude Code',
      linked: false,
      linkCreatedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      linkUrl: 'https://pay.prava.space/link-agent?lid=lk_denied12345',
    });
    await expect(setupPollCommand()).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toMatch(/Setup denied by user\./);
  }, 15_000);
});
