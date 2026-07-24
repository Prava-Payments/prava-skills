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

describe('mandatePollCommand', () => {
  let dir: string; let logs: string[]; let origLog: typeof console.log;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-mandate-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
    logs = []; origLog = console.log;
    console.log = (m?: unknown) => { if (m !== undefined) logs.push(String(m)); };
    captured.req = null;
    captured.response = DEFAULT_RESPONSE;
  });
  afterEach(() => {
    console.log = origLog;
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('returns the newest active mandate matching the merchant filter', async () => {
    const { mandatePollCommand } = await import('../mandate');
    await mandatePollCommand({ merchant: 'nike.com', amount: '120.00' });
    expect(logs.join('\n')).toContain('Mandate active');
    expect(logs.join('\n')).toContain('Nike');
  });

  it('picks the NEWEST of two active mandates that both match the filter', async () => {
    captured.response = {
      status: 200,
      data: {
        mandates: [
          {
            id: 'mdt_old', state: 'available', status: 'active', recurringFrequency: 'one_time',
            merchantScope: 'listed', merchantName: 'Nike', approvedAmount: '50.00', remaining: '50.00',
            currency: 'USD', validUntil: '2026-07-26T00:00:00Z', renewsAt: null, createdAt: '2026-07-01T10:00:00Z',
          },
          {
            id: 'mdt_new', state: 'available', status: 'active', recurringFrequency: 'one_time',
            merchantScope: 'listed', merchantName: 'Nike', approvedAmount: '50.00', remaining: '50.00',
            currency: 'USD', validUntil: '2026-07-26T00:00:00Z', renewsAt: null, createdAt: '2026-07-19T10:00:00Z',
          },
        ],
      },
      headers: {},
    };
    const { mandatePollCommand } = await import('../mandate');
    await mandatePollCommand({ merchant: 'nike.com', amount: '50.00', json: true });
    const out = logs.join('\n');
    expect(out).toContain('mdt_new');
    expect(out).not.toContain('mdt_old');
  });
});
