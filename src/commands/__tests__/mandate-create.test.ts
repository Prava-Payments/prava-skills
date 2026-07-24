import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      return { status: 201, data: { session_id: 'sess_1', order_id: 'ord_1', iframe_url: 'https://collect.prava.space/s/sess_1' }, headers: {} };
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
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-mandate-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
    logs = []; origLog = console.log;
    console.log = (m?: unknown) => { if (m !== undefined) logs.push(String(m)); };
    captured.req = null;
  });
  afterEach(() => {
    console.log = origLog;
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
    expect(captured.req.path).toBe('/v1/sessions');
    expect(captured.req.body.total_amount).toBe('120.00');
    expect(captured.req.body.currency).toBe('USD');
    expect(captured.req.body.purchase_context[0].merchant_details).toEqual({ name: 'Nike', url: 'https://nike.com', country_code_iso2: 'US' });
    expect(captured.req.body.mandate_setup).toMatchObject({ intent: 'mandate_setup', recurring_frequency: 'one_time', merchant_scope: 'listed' });
    expect(captured.req.agentId).toBe('aa_1');
    expect(logs.some((l) => l.includes('collect.prava.space/s/sess_1'))).toBe(true);
  });

  it('fills inert placeholder merchant/product for --scope any', async () => {
    const { mandateCreateCommand } = await import('../mandate');
    await mandateCreateCommand({ amount: '200.00', currency: 'USD', frequency: 'one_time', scope: 'any', yes: true });
    expect(captured.req.body.mandate_setup.merchant_scope).toBe('any');
    expect(captured.req.body.purchase_context[0].merchant_details.name).toBe('Any merchant');
    expect(captured.req.body.purchase_context[0].product_details[0].unit_price).toBe('200.00');
  });
});
