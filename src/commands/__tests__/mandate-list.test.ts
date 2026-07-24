import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_RESPONSE = {
  status: 200,
  data: {
    mandates: [
      {
        id: 'mdt_1', state: 'available', status: 'active', recurringFrequency: 'one_time',
        merchantScope: 'listed', merchantName: 'Nike', approvedAmount: '120.00', remaining: '120.00',
        currency: 'USD', validUntil: '2026-07-26T00:00:00Z', renewsAt: null, createdAt: '2026-07-19T10:00:00Z',
      },
      {
        id: 'mdt_2', state: 'available', status: 'active', recurringFrequency: 'one_time',
        merchantScope: 'any', merchantName: null, approvedAmount: '200.00', remaining: '150.00',
        currency: 'USD', validUntil: '2026-07-25T00:00:00Z', renewsAt: null, createdAt: '2026-07-18T10:00:00Z',
      },
    ],
  },
  headers: {},
};

const captured = vi.hoisted(() => ({ req: null as any, response: null as any }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      return captured.response;
    }
  },
}));

function seedAgent(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent.json'), JSON.stringify({
    privateKey: 'priv', publicKey: 'pub', linkId: 'lk_1', name: 'Test', linked: true, agentId: 'aa_1',
  }), { mode: 0o600 });
}

describe('mandateListCommand', () => {
  let dir: string; let logs: string[]; let errs: string[];
  let origLog: typeof console.log; let origErr: typeof console.error;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-mandate-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
    logs = []; errs = [];
    origLog = console.log; origErr = console.error;
    console.log = (m?: unknown) => { if (m !== undefined) logs.push(String(m)); };
    console.error = (m?: unknown) => { if (m !== undefined) errs.push(String(m)); };
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never);
    captured.req = null;
    captured.response = DEFAULT_RESPONSE;
  });
  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('prints human lines by merchant/remaining/expiry and never shows raw ids', async () => {
    const { mandateListCommand } = await import('../mandate');
    await mandateListCommand({});
    const out = logs.join('\n');
    expect(out).toContain('Nike');
    expect(out).toContain('Any store');
    expect(out).toContain('120.00/120.00 USD');
    expect(out).not.toContain('mdt_1');   // no raw ids in human output
  });

  it('--json includes ids for the skill', async () => {
    const { mandateListCommand } = await import('../mandate');
    await mandateListCommand({ json: true });
    expect(logs.join('\n')).toContain('mdt_1');
  });

  it('a 401 response is a clean error + exit 1, not "No mandates."', async () => {
    captured.response = {
      status: 401,
      data: { error: { message: 'Invalid signature' } },
      headers: {},
    };
    const { mandateListCommand } = await import('../mandate');
    await expect(mandateListCommand({})).rejects.toThrow('EXIT_1');
    expect(errs.join('\n')).toContain('Invalid signature');
    expect(logs.join('\n')).not.toContain('No mandates.');
  });
});
