import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any, response: null as any }));
vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      return captured.response;
    }
  },
}));
vi.mock('../../crypto/decrypt.js', () => ({
  decryptTokenPayload: () => ({ token: 'TKN', cryptogram: 'CRYPT', expiry_month: '12', expiry_year: '2027' }),
}));

function seedAgent(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agent.json'), JSON.stringify({
    privateKey: 'priv', publicKey: 'pub', linkId: 'lk_1', name: 'Test', linked: true, agentId: 'aa_1',
  }), { mode: 0o600 });
}

describe('mandateChargeCommand', () => {
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
    captured.response = null;
  });
  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('charges, decrypts the payload and prints token + cryptogram + txn id', async () => {
    captured.response = {
      status: 200,
      data: {
        status: 'awaiting_result', transactionId: 'txn_1',
        encrypted_payload: { ephemeral_public_key: 'e', iv: 'i', auth_tag: 'a', data: 'd' },
      },
      headers: {},
    };
    const { mandateChargeCommand } = await import('../mandate');
    await mandateChargeCommand({ mandateId: 'mdt_1', amount: '40.00', yes: true });
    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/mandates/mdt_1/charge');
    expect(captured.req.body).toEqual({ amount: '40.00' });
    const out = logs.join('\n');
    expect(out).toContain('TKN');
    expect(out).toContain('CRYPT');
    expect(out).toContain('txn_1');
  });

  it('falls back to plaintext credentials (dynamicCvv → cryptogram) when there is no encrypted_payload', async () => {
    captured.response = {
      status: 200,
      data: {
        status: 'awaiting_result', transactionId: 'txn_2',
        credentials: {
          token: 'PLAIN_TKN', dynamicCvv: 'PLAIN_CVV', expiryMonth: '09', expiryYear: '2028',
        },
      },
      headers: {},
    };
    const { mandateChargeCommand } = await import('../mandate');
    await mandateChargeCommand({ mandateId: 'mdt_1', amount: '40.00', yes: true });
    const out = logs.join('\n');
    expect(out).toContain('PLAIN_TKN');
    expect(out).toContain('PLAIN_CVV');
    expect(out).toContain('09/2028');
  });

  it('relays a decline as exit 1 without crashing', async () => {
    captured.response = {
      status: 200,
      data: { status: 'failed', errorMessage: 'THRESHOLD_EXCEEDED' },
      headers: {},
    };
    const { mandateChargeCommand } = await import('../mandate');
    await expect(mandateChargeCommand({ mandateId: 'mdt_1', amount: '999.00', yes: true })).rejects.toThrow('EXIT_1');
    expect(errs.join('\n')).toContain('THRESHOLD_EXCEEDED');
  });
});
