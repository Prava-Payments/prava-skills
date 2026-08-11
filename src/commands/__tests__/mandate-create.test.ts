import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any, response: null as any }));
const DEFAULT_RESPONSE = { status: 201, data: { session_id: 'sess_1', payment_url: 'https://collect.prava.space/s/sess_1', expires_at: '2026-08-11T12:00:00.000Z' }, headers: {} };
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

describe('mandateCreateCommand', () => {
  let dir: string; let logs: string[]; let origLog: typeof console.log;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-mandate-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
    logs = []; origLog = console.log;
    console.log = (m?: unknown) => { if (m !== undefined) logs.push(String(m)); };
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never);
    captured.req = null;
    captured.response = DEFAULT_RESPONSE;
  });
  afterEach(() => {
    console.log = origLog;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('POSTs a merchant-scoped mandate_setup session and prints the approval URL', async () => {
    const { mandateCreateCommand } = await import('../mandate');
    await mandateCreateCommand({
      merchantName: 'Nike', merchantUrl: 'https://nike.com', merchantCountry: 'us',
      amount: '120.00', currency: 'usd', frequency: 'one_time', scope: 'listed', yes: true,
    });
    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/sessions/agent');
    expect(captured.req.body).toEqual({
      total_amount: '120.00',
      currency: 'USD',
      merchant_name: 'Nike',
      merchant_url: 'https://nike.com',
      merchant_country: 'US',
      products: [{ description: 'Nike purchase', unit_price: '120.00', quantity: 1 }],
      mandate_setup: {
        intent: 'mandate_setup',
        recurring_frequency: 'one_time',
        merchant_scope: 'listed',
      },
    });
    expect(captured.req.agentId).toBe('aa_1');
    expect(logs.some((l) => l.includes('collect.prava.space/s/sess_1'))).toBe(true);
  });

  it('fills inert placeholder merchant/product for --scope any', async () => {
    const { mandateCreateCommand } = await import('../mandate');
    await mandateCreateCommand({ amount: '200.00', currency: 'USD', frequency: 'one_time', scope: 'any', yes: true });
    expect(captured.req.body.mandate_setup.merchant_scope).toBe('any');
    expect(captured.req.body.merchant_name).toBe('Any merchant');
    expect(captured.req.body.merchant_url).toBe('https://prava.space');
    expect(captured.req.body.merchant_country).toBe('US');
    expect(captured.req.body.products[0].unit_price).toBe('200.00');
  });

  it('--json still prints the body but exits 1 on a res.status >= 400 response', async () => {
    captured.response = {
      status: 401,
      data: { error: { message: 'Invalid signature' } },
      headers: {},
    };
    const { mandateCreateCommand } = await import('../mandate');
    await expect(mandateCreateCommand({
      amount: '200.00', currency: 'USD', frequency: 'one_time', scope: 'any', yes: true, json: true,
    })).rejects.toThrow('EXIT_1');
    expect(logs.join('\n')).toContain('Invalid signature');
  });
});
