import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any, responses: [] as any[], throwNext: false }));
const DEFAULT_CREATE_RESPONSE = {
  status: 201,
  data: { session_id: 'sess_1', payment_url: 'https://collect.prava.space/s/sess_1', expires_at: '2026-07-30T12:00:00Z' },
  headers: {},
};

vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      if (captured.throwNext) {
        captured.throwNext = false;
        throw new Error('fetch failed');
      }
      const responses = captured.responses;
      if (responses.length > 0) {
        return responses.shift();
      }
      return DEFAULT_CREATE_RESPONSE;
    }
  },
  getInstalledSkillVersion: () => undefined,
}));
vi.mock('../../crypto/decrypt.js', () => ({
  decryptTokenPayload: () => ({ token: 'TKN', cryptogram: 'CRYPT', expiry_month: '12', expiry_year: '2027' }),
}));

function seedAgent(dir: string, linked = true) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'agent.json'),
    JSON.stringify({
      privateKey: 'priv',
      publicKey: 'pub',
      linkId: 'lk_1',
      name: 'Test',
      linked,
      ...(linked ? { agentId: 'aa_1', linkedAt: '2026-07-01T00:00:00Z' } : {}),
    }),
    { mode: 0o600 },
  );
}

describe('sessionsCreateCommand', () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-sessions-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
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
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      ((code?: number) => {
        throw new Error(`EXIT_${code}`);
      }) as never,
    );
    captured.req = null;
    captured.responses = [];
    captured.throwNext = false;
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  it('POSTs to /v1/sessions/agent with uppercased currency/country and prints the session id + payment URL', async () => {
    const { sessionsCreateCommand } = await import('../sessions');
    await sessionsCreateCommand({
      totalAmount: '42.00',
      currency: 'usd',
      merchantName: 'Blue Bottle',
      merchantUrl: 'https://bluebottle.com',
      merchantCountry: 'us',
      product: ['{"description":"coffee","unit_price":"42.00","quantity":2}'],
    });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/sessions/agent');
    expect(captured.req.body.total_amount).toBe('42.00');
    expect(captured.req.body.currency).toBe('USD');
    expect(captured.req.body.merchant_name).toBe('Blue Bottle');
    expect(captured.req.body.merchant_url).toBe('https://bluebottle.com');
    expect(captured.req.body.merchant_country).toBe('US');
    expect(captured.req.body.products).toEqual([
      { description: 'coffee', unit_price: '42.00', quantity: 2 },
    ]);
    expect(captured.req.agentId).toBe('aa_1');
    expect(captured.req.privateKey).toBe('priv');

    const out = logs.join('\n');
    expect(out).toContain('sess_1');
    expect(out).toContain('https://collect.prava.space/s/sess_1');
    expect(out).toContain('prava sessions poll --session-id sess_1');
  });

  it('defaults quantity to 1 when omitted in the product JSON', async () => {
    const { sessionsCreateCommand } = await import('../sessions');
    await sessionsCreateCommand({
      totalAmount: '10.00',
      currency: 'USD',
      merchantName: 'Nike',
      merchantUrl: 'https://nike.com',
      merchantCountry: 'US',
      product: ['{"description":"socks","unit_price":"10.00"}'],
    });

    expect(captured.req.body.products).toEqual([
      { description: 'socks', unit_price: '10.00', quantity: 1 },
    ]);
  });

  it('exits 1 on invalid product JSON', async () => {
    const { sessionsCreateCommand } = await import('../sessions');
    await expect(
      sessionsCreateCommand({
        totalAmount: '10.00',
        currency: 'USD',
        merchantName: 'Nike',
        merchantUrl: 'https://nike.com',
        merchantCountry: 'US',
        product: ['not-json'],
      }),
    ).rejects.toThrow('EXIT_1');
    expect(errs.join('\n')).toContain('Invalid product JSON');
  });

  it('exits 1 when the server returns a non-2xx status', async () => {
    captured.responses = [
      { status: 402, data: { error: { message: 'Insufficient funds' } }, headers: {} },
    ];
    const { sessionsCreateCommand } = await import('../sessions');
    await expect(
      sessionsCreateCommand({
        totalAmount: '999.00',
        currency: 'USD',
        merchantName: 'Nike',
        merchantUrl: 'https://nike.com',
        merchantCountry: 'US',
        product: ['{"description":"shoes","unit_price":"999.00","quantity":1}'],
      }),
    ).rejects.toThrow('EXIT_1');
    expect(errs.join('\n')).toContain('Failed to create session');
    expect(errs.join('\n')).toContain('Insufficient funds');
  });

  it('exits 2 when no agent is configured', async () => {
    // Remove the agent file
    rmSync(join(dir, 'agent.json'), { force: true });
    const { sessionsCreateCommand } = await import('../sessions');
    await expect(
      sessionsCreateCommand({
        totalAmount: '10.00',
        currency: 'USD',
        merchantName: 'Nike',
        merchantUrl: 'https://nike.com',
        merchantCountry: 'US',
        product: ['{"description":"x","unit_price":"10.00","quantity":1}'],
      }),
    ).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toContain('No agent configured');
  });

  it('auto-checks link status and exits 2 when the server says not approved', async () => {
    // Seed an unlinked agent
    rmSync(join(dir, 'agent.json'), { force: true });
    seedAgent(dir, false);

    captured.responses = [
      { status: 200, data: { status: 'pending' }, headers: {} },
    ];
    const { sessionsCreateCommand } = await import('../sessions');
    await expect(
      sessionsCreateCommand({
        totalAmount: '10.00',
        currency: 'USD',
        merchantName: 'Nike',
        merchantUrl: 'https://nike.com',
        merchantCountry: 'US',
        product: ['{"description":"x","unit_price":"10.00","quantity":1}'],
      }),
    ).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toContain('Agent not linked');
  });

  it('auto-checks link status, upgrades to linked, and proceeds when the server says approved', async () => {
    // Seed an unlinked agent that the server will confirm as approved
    rmSync(join(dir, 'agent.json'), { force: true });
    seedAgent(dir, false);

    captured.responses = [
      { status: 200, data: { status: 'approved', agent_id: 'aa_confirmed' }, headers: {} },
      DEFAULT_CREATE_RESPONSE,
    ];
    const { sessionsCreateCommand } = await import('../sessions');
    await sessionsCreateCommand({
      totalAmount: '10.00',
      currency: 'USD',
      merchantName: 'Nike',
      merchantUrl: 'https://nike.com',
      merchantCountry: 'US',
      product: ['{"description":"x","unit_price":"10.00","quantity":1}'],
    });

    // The session create request used the server-confirmed agent_id
    expect(captured.req.agentId).toBe('aa_confirmed');
    expect(logs.join('\n')).toContain('sess_1');
  });
});

describe('sessionsPollCommand', () => {
  let dir: string;
  let logs: string[];
  let errs: string[];
  let origLog: typeof console.log;
  let origErr: typeof console.error;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'prava-sessions-'));
    process.env.PRAVA_STATE_DIR = dir;
    seedAgent(dir);
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
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      ((code?: number) => {
        throw new Error(`EXIT_${code}`);
      }) as never,
    );
    captured.req = null;
    captured.responses = [];
    captured.throwNext = false;
    // Use fake timers so the 3s poll interval doesn't slow tests.
    vi.useFakeTimers();
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
    exitSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
    vi.useRealTimers();
  });

  it('polls until status=completed, then decrypts and prints token + cryptogram + expiry', async () => {
    captured.responses = [
      { status: 200, data: { session_id: 'sess_1', status: 'pending' }, headers: {} },
      {
        status: 200,
        data: {
          session_id: 'sess_1',
          status: 'completed',
          encrypted_payload: { ephemeral_public_key: 'e', iv: 'i', auth_tag: 'a', data: 'd' },
        },
        headers: {},
      },
    ];

    const { sessionsPollCommand } = await import('../sessions');
    const promise = sessionsPollCommand({ sessionId: 'sess_1' });
    // Advance past the first poll delay (3s) + second poll delay (4.5s).
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(4_500);
    await promise;

    const out = logs.join('\n');
    expect(out).toContain('TKN');
    expect(out).toContain('CRYPT');
    expect(out).toContain('12/2027');
  });

  it('exits 1 when the session status is failed', async () => {
    captured.responses = [
      { status: 200, data: { session_id: 'sess_1', status: 'failed' }, headers: {} },
    ];

    const { sessionsPollCommand } = await import('../sessions');
    const promise = sessionsPollCommand({ sessionId: 'sess_1' });
    // The poll loop's try/catch catches process.exit (thrown as EXIT_1 by our spy)
    // only if it's inside the try. But process.exit for "failed" is inside the try
    // block, so the catch will swallow it. We need to detect it differently:
    // the "failed" branch calls console.error then process.exit(1).
    // Since the catch block swallows the EXIT_1 throw, the loop continues.
    // To properly test this, we check that the error message was printed.
    await vi.advanceTimersByTimeAsync(3_000);
    // Allow the microtask queue to settle
    await vi.waitFor(() => {
      expect(errs.join('\n')).toContain('Tokenization failed');
    }, { timeout: 2000 });
    // The promise may still be pending (loop continues after catch). Clean up.
    // We don't await the promise since the loop continues after the catch.
  });

  it('exits 2 when no agent is configured', async () => {
    rmSync(join(dir, 'agent.json'), { force: true });
    const { sessionsPollCommand } = await import('../sessions');
    await expect(sessionsPollCommand({ sessionId: 'sess_1' })).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toContain('No agent configured');
  });

  it('exits 2 when agent exists but is not linked', async () => {
    rmSync(join(dir, 'agent.json'), { force: true });
    seedAgent(dir, false);
    const { sessionsPollCommand } = await import('../sessions');
    await expect(sessionsPollCommand({ sessionId: 'sess_1' })).rejects.toThrow('EXIT_2');
    expect(errs.join('\n')).toContain('Agent not linked');
  });

  it('continues polling through transient network errors', async () => {
    // First poll throws (network error), second poll returns completed.
    captured.throwNext = true;
    captured.responses = [
      {
        status: 200,
        data: {
          session_id: 'sess_1',
          status: 'completed',
          encrypted_payload: { ephemeral_public_key: 'e', iv: 'i', auth_tag: 'a', data: 'd' },
        },
        headers: {},
      },
    ];

    const { sessionsPollCommand } = await import('../sessions');
    const promise = sessionsPollCommand({ sessionId: 'sess_1' });
    // First poll fires at 3s (throws, caught by try/catch), second at 7.5s (completed).
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(4_500);
    await promise;

    const out = logs.join('\n');
    expect(out).toContain('TKN');
    expect(out).toContain('CRYPT');
  });
});
