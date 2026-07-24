import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      return { status: 200, data: { status: 'completed' }, headers: {} };
    }
  },
}));

function seedAgent(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent.json'), JSON.stringify({
    privateKey: 'priv', publicKey: 'pub', linkId: 'lk_1', name: 'Test', linked: true, agentId: 'aa_1',
  }), { mode: 0o600 });
}

describe('mandateReportCommand / mandateCancelCommand', () => {
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

  it('report POSTs txn_status + txn_type to the report endpoint', async () => {
    const { mandateReportCommand } = await import('../mandate');
    await mandateReportCommand({ mandateId: 'mdt_1', txnId: 'txn_1', status: 'approved' });
    expect(captured.req.path).toBe('/v1/mandates/mdt_1/charges/txn_1/report');
    expect(captured.req.body).toEqual({ txn_status: 'APPROVED', txn_type: 'PURCHASE' });
    expect(logs.join('\n')).toContain('✓');
  });

  it('cancel POSTs to the cancel endpoint when confirmed', async () => {
    const { mandateCancelCommand } = await import('../mandate');
    await mandateCancelCommand({ mandateId: 'mdt_1', yes: true });
    expect(captured.req.path).toBe('/v1/mandates/mdt_1/cancel');
    expect(logs.join('\n')).toContain('cancelled');
  });
});
