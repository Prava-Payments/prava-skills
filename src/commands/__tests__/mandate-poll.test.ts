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

  it('returns the only strict usable mandate match', async () => {
    const { mandatePollCommand } = await import('../mandate');
    await mandatePollCommand({ scope: 'listed', merchant: 'Nike', amount: '120.00', currency: 'USD' });
    expect(logs.join('\n')).toContain('Mandate active');
    expect(logs.join('\n')).toContain('Nike');
    expect(captured.req.path).toBe('/v1/mandates?standing_only=true');
  });

  it('rejects the reported expired generic HKD collision and selects the exact INR Zepto mandate', async () => {
    const { selectMandatePollMatch } = await import('../mandate');
    const criteria = { scope: 'listed', merchant: 'Zepto', amount: '100.00', currency: 'INR' };
    const expiredGeneric = {
      id: 'mdt_old', state: 'expired', status: 'active', recurringFrequency: 'one_time',
      merchantScope: 'any' as const, merchantName: null, approvedAmount: '100.00', remaining: '100.00',
      currency: 'HKD', validUntil: '2025-01-02T00:00:00Z', renewsAt: null, createdAt: '2024-12-26T00:00:00Z',
    };
    const pendingZepto = {
      ...expiredGeneric,
      id: 'mdt_pending', state: 'pending', status: 'pending', merchantScope: 'listed' as const,
      merchantName: 'Zepto', currency: 'INR', validUntil: '2026-08-18T00:00:00Z',
      createdAt: '2026-08-11T10:00:00Z',
    };
    expect(selectMandatePollMatch([expiredGeneric, pendingZepto], criteria)).toBeUndefined();

    const availableZepto = { ...pendingZepto, state: 'available', status: 'active' };
    expect(selectMandatePollMatch([expiredGeneric, availableZepto], criteria)?.id).toBe('mdt_pending');
  });

  it('requires usable state, exact scope, amount, currency, and merchant identity', async () => {
    const { mandateMatchesPoll } = await import('../mandate');
    const criteria = { scope: 'listed', merchant: 'Zepto', amount: '100', currency: 'inr' };
    const row = {
      id: 'mdt_zepto', state: 'available', status: 'active', recurringFrequency: 'one_time',
      merchantScope: 'listed' as const, merchantName: 'Zepto', approvedAmount: '100.00', remaining: '100.00',
      currency: 'INR', validUntil: '2026-08-18T00:00:00Z', renewsAt: null, createdAt: '2026-08-11T10:00:00Z',
    };
    expect(mandateMatchesPoll(row, criteria)).toBe(true);
    expect(mandateMatchesPoll({ ...row, state: 'expired' }, criteria)).toBe(false);
    expect(mandateMatchesPoll({ ...row, state: 'consumed' }, criteria)).toBe(false);
    expect(mandateMatchesPoll({ ...row, merchantScope: 'any', merchantName: null }, criteria)).toBe(false);
    expect(mandateMatchesPoll({ ...row, currency: 'HKD' }, criteria)).toBe(false);
    expect(mandateMatchesPoll({ ...row, approvedAmount: '101.00' }, criteria)).toBe(false);
    expect(mandateMatchesPoll({ ...row, merchantName: 'Not Zepto' }, criteria)).toBe(false);
    expect(mandateMatchesPoll(row, { ...criteria, merchant: 'zepto' })).toBe(true);
    expect(mandateMatchesPoll(row, { ...criteria, merchant: 'https://notzepto.com' })).toBe(false);
    expect(mandateMatchesPoll(row, { ...criteria, merchant: 'https://www.zepto.com/path' })).toBe(false);
    expect(mandateMatchesPoll(row, { ...criteria, merchant: 'https://zepto.evil.com' })).toBe(false);
    expect(mandateMatchesPoll(row, { ...criteria, merchant: 'https://www.zepto.evil.com' })).toBe(false);
    expect(mandateMatchesPoll({ ...row, merchantName: 'AB' }, { ...criteria, merchant: 'A&B' })).toBe(false);
    expect(mandateMatchesPoll({ ...row, merchantName: 'Caf' }, { ...criteria, merchant: 'Café' })).toBe(false);
    expect(mandateMatchesPoll({ ...row, merchantName: 'Café' }, { ...criteria, merchant: 'Cafe\u0301' })).toBe(true);
  });

  it('matches generic polls only to a single available any-scope mandate', async () => {
    const { selectMandatePollMatch } = await import('../mandate');
    const base = {
      id: 'mdt_any', state: 'available', status: 'active', recurringFrequency: 'one_time',
      merchantScope: 'any' as const, merchantName: null, approvedAmount: '200.00', remaining: '200.00',
      currency: 'USD', validUntil: '2026-08-18T00:00:00Z', renewsAt: null, createdAt: '2026-08-11T10:00:00Z',
    };
    const criteria = { scope: 'any', amount: '200.00', currency: 'USD' };
    expect(selectMandatePollMatch([base], criteria)?.id).toBe('mdt_any');
    expect(selectMandatePollMatch([{ ...base, merchantScope: 'listed', merchantName: 'Nike' }], criteria)).toBeUndefined();
    expect(selectMandatePollMatch([base, { ...base, id: 'mdt_any_2' }], criteria)).toBeUndefined();
  });

  it('rejects incomplete or contradictory poll criteria', async () => {
    const { mandatePollCriteriaProblem } = await import('../mandate');
    expect(mandatePollCriteriaProblem({ scope: 'listed', amount: '120.00', currency: 'USD' }))
      .toContain('--merchant');
    expect(mandatePollCriteriaProblem({ scope: 'listed', merchant: 'https://nike.com', amount: '120.00', currency: 'USD' }))
      .toContain('exact merchant name');
    expect(mandatePollCriteriaProblem({ scope: 'any', merchant: 'Nike', amount: '120.00', currency: 'USD' }))
      .toContain('omitted');
    expect(mandatePollCriteriaProblem({ scope: 'all', amount: '120.00', currency: 'USD' }))
      .toContain('--scope');
    expect(mandatePollCriteriaProblem({ scope: 'any', amount: '-1.00', currency: 'USD' }))
      .toContain('--amount');
    expect(mandatePollCriteriaProblem({ scope: 'any', amount: '120.00', currency: 'US' }))
      .toContain('--currency');
    expect(mandatePollCriteriaProblem({ scope: 'any', amount: '120', currency: 'usd' })).toBeNull();
  });
});
