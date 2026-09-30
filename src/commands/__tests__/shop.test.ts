import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured = vi.hoisted(() => ({ req: null as any, responses: [] as any[] }));

vi.mock('../../http/client.js', () => ({
  PravaClient: class {
    async request(opts: any) {
      captured.req = opts;
      const responses = captured.responses;
      if (responses.length > 0) {
        return responses.shift();
      }
      return { status: 200, data: { success: true, data: {} }, headers: {} };
    }
  },
  getInstalledSkillVersion: () => '1.7.0',
}));
vi.mock('../../config', () => ({
  config: {
    apiServerUrl: 'https://api.prava.space',
    dashboardUrl: 'https://pay.prava.space',
    walletApiUrl: 'https://pay-api.prava.space',
    requestTimeoutMs: 30_000,
  },
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

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'prava-shop-'));
  process.env.PRAVA_STATE_DIR = dir;
  seedAgent(dir);
  return dir;
}

function captureIO() {
  const logs: string[] = [];
  const errs: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (m?: unknown) => {
    if (m !== undefined) logs.push(String(m));
  };
  console.error = (m?: unknown) => {
    if (m !== undefined) errs.push(String(m));
  };
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(
    ((code?: number) => {
      throw new Error(`EXIT_${code}`);
    }) as never,
  );
  return {
    logs,
    errs,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
      exitSpy.mockRestore();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────────────────────

describe('shopSearchCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies search sends an authenticated request and renders the key fields needed to choose a product.
  it('POSTs to /v1/wallet/shop/search and prints curated results', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: {
            results: [
              {
                product_id: 'prod_1',
                merchant: 'bluebottle.com',
                title: 'Ethiopia Yirgacheffe',
                price_estimate: { amount: '24.00', currency: 'USD' },
                image_url: null,
              },
            ],
            next_cursor: null,
            has_more: false,
          },
        },
        headers: {},
      },
    ];

    const { shopSearchCommand } = await import('../shop');
    await shopSearchCommand({ query: 'coffee' });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/search');
    expect(captured.req.body.query).toBe('coffee');
    expect(captured.req.agentId).toBe('aa_1');

    const out = io.logs.join('\n');
    expect(out).toContain('Ethiopia Yirgacheffe');
    expect(out).toContain('$24.00 USD');
    expect(out).toContain('prod_1');
  });

  // Ensures an empty search response produces clear user-facing feedback.
  it('prints "No results" when the search returns empty', async () => {
    captured.responses = [
      {
        status: 200,
        data: { success: true, data: { results: [], next_cursor: null, has_more: false } },
        headers: {},
      },
    ];

    const { shopSearchCommand } = await import('../shop');
    await shopSearchCommand({ query: 'nonexistent' });

    expect(io.logs.join('\n')).toContain('No results');
  });

  // Confirms JSON mode emits machine-readable search data without curated formatting.
  it('--json outputs the raw data envelope', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: {
            results: [
              { product_id: 'p1', merchant: 'm.com', title: 'Item', price_estimate: { amount: '5.00', currency: 'USD' }, image_url: null },
            ],
            next_cursor: 'cur_1',
            has_more: true,
          },
        },
        headers: {},
      },
    ];

    const { shopSearchCommand } = await import('../shop');
    await shopSearchCommand({ query: 'item', json: true });

    const raw = JSON.parse(io.logs.join('\n'));
    expect(raw.results[0].product_id).toBe('p1');
    expect(raw.has_more).toBe(true);
  });

  // Ensures HTTP-level search failures preserve the server message and return an error exit.
  it('exits 1 on a non-200 status', async () => {
    captured.responses = [
      { status: 401, data: { success: false, error: { message: 'Invalid signature' } }, headers: {} },
    ];

    const { shopSearchCommand } = await import('../shop');
    await expect(shopSearchCommand({ query: 'test' })).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Invalid signature');
  });

  // Ensures application-level search failures are rejected even when HTTP status is successful.
  it('exits 1 when success:false in the envelope', async () => {
    captured.responses = [
      { status: 200, data: { success: false, error: { message: 'Merchant unavailable' } }, headers: {} },
    ];

    const { shopSearchCommand } = await import('../shop');
    await expect(shopSearchCommand({ query: 'test' })).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Merchant unavailable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// product
// ─────────────────────────────────────────────────────────────────────────────

describe('shopProductCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies product offers are requested correctly and ordered by availability before price.
  it('POSTs to /v1/wallet/shop/product and prints offers sorted by available-first then cheapest', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: {
            product: {
              id: 'prod_1',
              merchant: 'store.com',
              description: 'A great product',
              variants: [
                { id: 'v1', label: 'Red', priceAmount: 2000, currency: 'USD', available: false, options: ['M'], merchantDomain: 'store.com' },
                { id: 'v2', label: 'Blue', priceAmount: 1500, currency: 'USD', available: true, options: ['M'], merchantDomain: 'store.com' },
                { id: 'v3', label: 'Green', priceAmount: 1800, currency: 'USD', available: true, options: ['L'], merchantDomain: 'store.com' },
              ],
            },
          },
        },
        headers: {},
      },
    ];

    const { shopProductCommand } = await import('../shop');
    await shopProductCommand({ productId: 'prod_1', merchant: 'store.com' });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/product');
    expect(captured.req.body.product_id).toBe('prod_1');

    const out = io.logs.join('\n');
    // Available offers should come first (Blue $15.00, Green $18.00), then unavailable (Red $20.00)
    const blueIdx = out.indexOf('Blue');
    const greenIdx = out.indexOf('Green');
    const redIdx = out.indexOf('Red');
    expect(blueIdx).toBeGreaterThan(-1);
    expect(greenIdx).toBeGreaterThan(blueIdx);
    expect(redIdx).toBeGreaterThan(greenIdx);
    expect(out).toContain('out of stock');
    expect(out).toContain('$15.00 USD');
  });

  // Confirms JSON mode returns the product payload for programmatic offer selection.
  it('--json outputs the raw product data', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: {
            product: {
              id: 'p1',
              merchant: 'm.com',
              variants: [{ id: 'v1', label: 'L', priceAmount: 1000, currency: 'USD', available: true, options: [], merchantDomain: 'm.com' }],
            },
          },
        },
        headers: {},
      },
    ];

    const { shopProductCommand } = await import('../shop');
    await shopProductCommand({ productId: 'p1', json: true });

    const raw = JSON.parse(io.logs.join('\n'));
    expect(raw.product.id).toBe('p1');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// quote
// ─────────────────────────────────────────────────────────────────────────────

describe('shopQuoteCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies quote creation sends the selected offer and prints the total and checkout handoff ID.
  it('POSTs to /v1/wallet/shop/quote with variant and merchant, prints total + checkout-session-id', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: {
            checkout_session_id: 'cs_1',
            merchant: 'store.com',
            final_price: { amount: '25.00', currency: 'USD' },
            price_breakdown: { subtotal_cents: 2000, shipping_cents: 300, tax_cents: 200, currency: 'USD' },
            selected_shipping: { title: 'Standard' },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          },
        },
        headers: {},
      },
    ];

    const { shopQuoteCommand } = await import('../shop');
    await shopQuoteCommand({ variantId: 'v1', merchant: 'store.com', yes: true });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/quote');
    expect(captured.req.body.variant_id).toBe('v1');
    expect(captured.req.body.merchantDomain).toBe('store.com');
    expect(captured.req.body.quantity).toBe(1);

    const out = io.logs.join('\n');
    expect(out).toContain('cs_1');
    expect(out).toContain('$25.00 USD');
    expect(out).toContain('Standard');
  });

  // Ensures automated quote creation requires explicit confirmation through the --yes flag.
  it('refuses without --yes in non-TTY mode and exits 2', async () => {
    const { shopQuoteCommand } = await import('../shop');
    await expect(
      shopQuoteCommand({ variantId: 'v1', merchant: 'store.com' }),
    ).rejects.toThrow('EXIT_2');
    expect(io.errs.join('\n')).toContain('quote not confirmed');
  });

  // Confirms quote errors in a successful HTTP response still fail with the wallet message.
  it('exits 1 on a failed envelope', async () => {
    captured.responses = [
      { status: 200, data: { success: false, error: { message: 'Out of stock' } }, headers: {} },
    ];

    const { shopQuoteCommand } = await import('../shop');
    await expect(
      shopQuoteCommand({ variantId: 'v1', merchant: 'store.com', yes: true }),
    ).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Out of stock');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkout
// ─────────────────────────────────────────────────────────────────────────────

describe('shopCheckoutCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies checkout submits card credentials and renders payment confirmation details.
  it('POSTs to /v1/wallet/shop/checkout and prints "Paid" with amount + order id on success', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: true,
          data: { status: 'paid', order_id: 'ord_123', amount: { amount: '25.00', currency: 'USD' } },
        },
        headers: {},
      },
    ];

    const { shopCheckoutCommand } = await import('../shop');
    await shopCheckoutCommand({
      checkoutSessionId: 'cs_1',
      token: 'TKN',
      cryptogram: 'CRYPT',
      yes: true,
    });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/checkout');
    expect(captured.req.body.checkout_session_id).toBe('cs_1');
    expect(captured.req.body.credentials).toEqual({ token: 'TKN', cryptogram: 'CRYPT' });

    const out = io.logs.join('\n');
    expect(out).toContain('Paid');
    expect(out).toContain('ord_123');
    expect(out).toContain('$25.00 USD');
  });

  // Ensures optional card metadata is forwarded using the wallet API credential schema.
  it('includes expiry and cardholder name in credentials when provided', async () => {
    captured.responses = [
      {
        status: 200,
        data: { success: true, data: { status: 'paid', order_id: 'ord_x', amount: { amount: '10.00', currency: 'USD' } } },
        headers: {},
      },
    ];

    const { shopCheckoutCommand } = await import('../shop');
    await shopCheckoutCommand({
      checkoutSessionId: 'cs_1',
      token: 'TKN',
      cryptogram: 'CRYPT',
      expiryMonth: '12',
      expiryYear: '2027',
      cardholderName: 'John Doe',
      yes: true,
    });

    expect(captured.req.body.credentials).toEqual({
      token: 'TKN',
      cryptogram: 'CRYPT',
      expiry_month: '12',
      expiry_year: '2027',
      cardholder_name: 'John Doe',
    });
  });

  // Confirms declined payments surface their failure reason and return an error exit.
  it('exits 1 on a declined checkout', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          success: false,
          data: { status: 'declined', failure_reason: 'Insufficient funds' },
        },
        headers: {},
      },
    ];

    const { shopCheckoutCommand } = await import('../shop');
    await expect(
      shopCheckoutCommand({ checkoutSessionId: 'cs_1', token: 'TKN', cryptogram: 'CRYPT', yes: true }),
    ).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('declined');
    expect(io.errs.join('\n')).toContain('Insufficient funds');
  });

  // Ensures automated checkout cannot charge a card without explicit confirmation.
  it('refuses without --yes in non-TTY mode and exits 2', async () => {
    const { shopCheckoutCommand } = await import('../shop');
    await expect(
      shopCheckoutCommand({ checkoutSessionId: 'cs_1', token: 'TKN', cryptogram: 'CRYPT' }),
    ).rejects.toThrow('EXIT_2');
    expect(io.errs.join('\n')).toContain('checkout not confirmed');
  });

  // Verifies an unknown server-side checkout failure is reported without claiming payment success.
  it('exits 1 on a 5xx HTTP error', async () => {
    captured.responses = [
      { status: 503, data: { success: false, error: { message: 'Server unavailable' } }, headers: {} },
    ];

    const { shopCheckoutCommand } = await import('../shop');
    await expect(
      shopCheckoutCommand({ checkoutSessionId: 'cs_1', token: 'TKN', cryptogram: 'CRYPT', yes: true }),
    ).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Server unavailable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addresses
// ─────────────────────────────────────────────────────────────────────────────

describe('shopAddressListCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies saved addresses are requested and displayed using the wallet's masked summaries.
  it('POSTs to /v1/wallet/shop/addresses/list and prints masked addresses', async () => {
    captured.responses = [
      {
        status: 200,
        data: {
          addresses: [
            { id: 'addr_1', label: 'Home', summary: '123 Main St, San Francisco, CA 94101', isDefault: true },
            { id: 'addr_2', label: 'Work', summary: '456 Market St, San Francisco, CA 94105', isDefault: false },
          ],
          has_phone: true,
        },
        headers: {},
      },
    ];

    const { shopAddressListCommand } = await import('../shop');
    await shopAddressListCommand({});

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/addresses/list');

    const out = io.logs.join('\n');
    expect(out).toContain('Home');
    expect(out).toContain('[default]');
    expect(out).toContain('123 Main St');
    expect(out).toContain('addr_1');
  });

  // Ensures users receive actionable guidance when they have no saved delivery addresses.
  it('prints "No delivery addresses" when the list is empty', async () => {
    captured.responses = [
      { status: 200, data: { addresses: [], has_phone: true }, headers: {} },
    ];

    const { shopAddressListCommand } = await import('../shop');
    await shopAddressListCommand({});

    expect(io.logs.join('\n')).toContain('No delivery addresses');
  });

  // Confirms the CLI warns when checkout cannot use a saved contact phone.
  it('warns when has_phone is false', async () => {
    captured.responses = [
      { status: 200, data: { addresses: [], has_phone: false }, headers: {} },
    ];

    const { shopAddressListCommand } = await import('../shop');
    await shopAddressListCommand({});

    expect(io.logs.join('\n')).toContain('No contact phone');
  });

  // Ensures address-list API failures surface the server error and stop the command.
  it('exits 1 on a non-200 status', async () => {
    captured.responses = [
      { status: 401, data: { error: { message: 'Unauthorized' } }, headers: {} },
    ];

    const { shopAddressListCommand } = await import('../shop');
    await expect(shopAddressListCommand({})).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Unauthorized');
  });
});

describe('shopAddressAddCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies address input is mapped to the wallet schema and the saved record is confirmed.
  it('POSTs to /v1/wallet/shop/addresses and prints the saved confirmation', async () => {
    captured.responses = [
      {
        status: 201,
        data: { address: { id: 'addr_new', label: 'Office', summary: '1 Market St, SF, CA 94105', isDefault: true } },
        headers: {},
      },
    ];

    const { shopAddressAddCommand } = await import('../shop');
    await shopAddressAddCommand({
      firstName: 'John',
      lastName: 'Doe',
      line1: '1 Market St',
      city: 'SF',
      region: 'CA',
      postal: '94105',
      country: 'US',
      default: true,
      label: 'Office',
    });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/addresses');
    expect(captured.req.body.firstName).toBe('John');
    expect(captured.req.body.street).toBe('1 Market St');
    expect(captured.req.body.locality).toBe('SF');
    expect(captured.req.body.isDefault).toBe(true);

    const out = io.logs.join('\n');
    expect(out).toContain('Address saved');
    expect(out).toContain('addr_new');
  });

  // Confirms address validation failures are shown to the user and return an error exit.
  it('exits 1 on a non-2xx status', async () => {
    captured.responses = [
      { status: 400, data: { error: { message: 'Invalid postal code' } }, headers: {} },
    ];

    const { shopAddressAddCommand } = await import('../shop');
    await expect(
      shopAddressAddCommand({
        firstName: 'John',
        lastName: 'Doe',
        line1: '1 Market St',
        city: 'SF',
        region: 'CA',
        postal: 'bad',
        country: 'US',
      }),
    ).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Invalid postal code');
  });
});

describe('shopAddressDefaultCommand', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Verifies the selected address ID is submitted and successful default changes are acknowledged.
  it('POSTs to /v1/wallet/shop/addresses/default and prints confirmation', async () => {
    captured.responses = [
      { status: 200, data: { success: true }, headers: {} },
    ];

    const { shopAddressDefaultCommand } = await import('../shop');
    await shopAddressDefaultCommand({ addressId: 'addr_2' });

    expect(captured.req.method).toBe('POST');
    expect(captured.req.path).toBe('/v1/wallet/shop/addresses/default');
    expect(captured.req.body.addressId).toBe('addr_2');

    expect(io.logs.join('\n')).toContain('Default address updated');
  });

  // Ensures a failed default-address update preserves the wallet's error message.
  it('exits 1 on a non-200 status', async () => {
    captured.responses = [
      { status: 404, data: { error: { message: 'Address not found' } }, headers: {} },
    ];

    const { shopAddressDefaultCommand } = await import('../shop');
    await expect(shopAddressDefaultCommand({ addressId: 'bad' })).rejects.toThrow('EXIT_1');
    expect(io.errs.join('\n')).toContain('Address not found');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireAgent / linking edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('shop requireAgent edge cases', () => {
  let dir: string;
  let io: ReturnType<typeof captureIO>;

  beforeEach(() => {
    dir = setup();
    io = captureIO();
    captured.req = null;
    captured.responses = [];
  });

  afterEach(() => {
    io.restore();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PRAVA_STATE_DIR;
  });

  // Confirms shopping commands stop with setup guidance when no local agent exists.
  it('exits 2 when no agent is configured', async () => {
    rmSync(join(dir, 'agent.json'), { force: true });
    const { shopSearchCommand } = await import('../shop');
    await expect(shopSearchCommand({ query: 'test' })).rejects.toThrow('EXIT_2');
    expect(io.errs.join('\n')).toContain('No agent configured');
  });

  // Verifies a pending server link cannot bypass the shopping command's linked-agent requirement.
  it('exits 2 when the agent is not linked and the server does not approve', async () => {
    rmSync(join(dir, 'agent.json'), { force: true });
    seedAgent(dir, false);
    captured.responses = [
      { status: 200, data: { status: 'pending' }, headers: {} },
    ];

    const { shopSearchCommand } = await import('../shop');
    await expect(shopSearchCommand({ query: 'test' })).rejects.toThrow('EXIT_2');
    expect(io.errs.join('\n')).toContain('Agent not linked');
  });
});
