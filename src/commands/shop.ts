/**
 * prava shop — product discovery + checkout through the wallet.
 *
 * Flow:  search → product → quote → checkout.  Every request is agent-signed and
 * sent to the wallet BACKEND API (config.walletApiUrl), which proxies to the merchant shop API.
 *
 * Output is curated by default — only the fields needed to decide and to chain the
 * next call (product_id → variant_id → checkout_session_id). Pass --json for the
 * raw passthrough when you need to capture an id/cursor programmatically.
 *
 * Exit codes: 0 = success, 1 = error/declined, 2 = agent not linked.
 */

import { createInterface } from 'node:readline/promises';
import { AgentStore } from '../storage/agent-store.js';
import { PravaClient, getInstalledSkillVersion } from '../http/client.js';
import { config } from '../config.js';

type Identity = { agentId: string; privateKey: string };

/**
 * The `prava shop` commands live in the CLI, so they run whether or not the prava-shopping
 * *skill* is installed. If it's missing, the agent lacks the guided flow (pacing, masking,
 * confirmations) — nudge once (stderr, so --json stdout stays clean) to install it.
 */
let nudgedMissingSkill = false;
function nudgeIfShoppingSkillMissing(): void {
  if (nudgedMissingSkill) return;
  nudgedMissingSkill = true;
  if (getInstalledSkillVersion('prava-shopping')) return;
  console.error(
    'ℹ️  For the full guided shopping flow (search → compare → quote → checkout with confirmations),\n' +
      '   install the prava-shopping skill:\n' +
      '   npx --yes skills add https://github.com/Prava-Payments/prava-skills --skill prava-shopping --global --yes --full-depth',
  );
}

/** The wallet wraps every shop response as { success, data } | { success:false, error }. */
interface ShopEnvelope<T> {
  success?: boolean;
  error?: unknown;
  data?: T;
  replayed?: boolean;
}

function shopClient(): PravaClient {
  nudgeIfShoppingSkillMissing();
  return new PravaClient(config.walletApiUrl, 'prava-shopping');
}

/** Load the onboarded agent; if the local link flag is stale, confirm with the server. */
async function requireAgent(): Promise<Identity> {
  const store = new AgentStore();
  const data = store.load();
  if (!data) {
    console.error('No agent configured. Run: prava setup --name "<name>"');
    process.exit(2);
  }
  if (!data.linked || !data.agentId) {
    try {
      const r = await new PravaClient(undefined, 'prava-shopping').request<{ status: string; agent_id?: string }>({
        method: 'GET',
        path: `/v1/agents/link/status?lid=${data.linkId}`,
      });
      if (r.data.status === 'approved' && r.data.agent_id) {
        data.linked = true;
        data.agentId = r.data.agent_id;
        data.linkedAt = new Date().toISOString();
        store.save(data);
      } else {
        console.error('Agent not linked. Run: prava setup --name "<name>"');
        process.exit(2);
      }
    } catch {
      console.error('Agent not linked. Run: prava setup --name "<name>"');
      process.exit(2);
    }
  }
  return { agentId: data.agentId!, privateKey: data.privateKey };
}

function pickError(env: ShopEnvelope<unknown> | undefined): string | undefined {
  const e = (env as { error?: unknown } | undefined)?.error;
  if (!e) return undefined;
  if (typeof e === 'string') return e;
  return (e as { message?: string }).message;
}

/** Bail on a non-success shop response with the safe message the wallet gave us. */
function fail(res: { status: number; data: ShopEnvelope<unknown> }): never {
  console.error(`\nrequest failed: ${pickError(res.data) ?? `HTTP ${res.status}`}`);
  process.exit(1);
}

// quote/checkout drive a real merchant browser on the harness — they routinely take
// 20–40s, past the default 30s client timeout. 45s matches the server-side budget.
const SHOP_BROWSER_TIMEOUT_MS = 45_000;
const RETRY_DELAY_MS = 2_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Confirmation speed-bump before a spend-adjacent action (quote opens a session; checkout pays).
 * - TTY (human at a terminal): interactive [y/N] prompt.
 * - Non-TTY (agent): require --yes; without it, refuse with guidance and exit 2.
 * Honest limit: an autonomous agent CAN pass --yes — the skill is the real pacing driver. This
 * just makes skipping the user's confirmation a deliberate, visible act rather than a silent one.
 */
async function confirmOrExit(o: { yes?: boolean; tty: string; refuse: string }): Promise<void> {
  if (o.yes) return;
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`${o.tty} [y/N]: `)).trim().toLowerCase();
    rl.close();
    if (ans === 'y' || ans === 'yes') return;
    console.error('Aborted — not confirmed.');
    process.exit(1);
  }
  console.error(`\nRefusing without confirmation: ${o.refuse}`);
  process.exit(2);
}

/**
 * POST to a shop endpoint, turning transport errors (incl. timeouts) into a clean exit.
 * Retries on transport/timeout errors and 5xx responses up to `retries` times (the harness
 * is occasionally slow) — never on 4xx/429, which won't fix on a retry. The CALLER decides:
 * quote is safe to retry; checkout is NOT (a timed-out charge may have gone through, and the
 * wallet would block the re-claim anyway).
 */
async function shopPost<T>(
  path: string,
  body: Record<string, unknown>,
  id: Identity,
  opts: { timeoutMs?: number; retries?: number } = {},
): Promise<{ status: number; data: ShopEnvelope<T> }> {
  const retries = opts.retries ?? 0;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await shopClient().request<ShopEnvelope<T>>({
        method: 'POST',
        path,
        body,
        timeoutMs: opts.timeoutMs,
        ...id,
      });
      if (res.status >= 500 && attempt < retries) {
        console.error(`  (server error ${res.status} — retrying ${attempt + 1}/${retries}…)`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const timedOut = /abort|timed out/i.test(msg);
      if (attempt < retries) {
        console.error(`  (${timedOut ? 'timed out' : 'request error'} — retrying ${attempt + 1}/${retries}…)`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.error(`\nrequest failed: ${timedOut ? 'timed out — the merchant checkout can be slow; try again' : msg}`);
      process.exit(1);
    }
  }
}

function money(amount: string | null | undefined, currency: string | undefined): string {
  return amount != null ? `$${amount} ${currency ?? ''}`.trim() : 'price n/a';
}

function centsToDollars(cents: number | null | undefined): string {
  return cents != null ? (cents / 100).toFixed(2) : '0.00';
}

// ─────────────────────────────────────────────────────────────────────────────
// addresses (PII-safe: the agent only ever sees MASKED summaries; full address is
// hydrated server-side at quote time and never returned here)
// ─────────────────────────────────────────────────────────────────────────────

interface MaskedAddress {
  id: string;
  label: string | null;
  summary: string;
  isDefault: boolean;
}

export async function shopAddressListCommand(opts: { json?: boolean }): Promise<void> {
  const id = await requireAgent();
  const res = await shopClient().request<{ addresses?: MaskedAddress[]; has_phone?: boolean; error?: unknown }>({
    method: 'POST',
    path: '/v1/wallet/shop/addresses/list',
    body: {},
    ...id,
  });
  if (res.status !== 200) {
    console.error(`\nrequest failed: ${pickError(res.data) ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  const addresses = res.data.addresses ?? [];
  if (addresses.length === 0) {
    console.log('No delivery addresses on file. Add one in the Prava dashboard, or `prava shop address add`.');
  } else {
    console.log(`\n${addresses.length} saved address${addresses.length === 1 ? '' : 'es'} (masked):\n`);
    addresses.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.label ?? '(no label)'}${a.isDefault ? '  [default]' : ''}`);
      console.log(`     ${a.summary}`);
      console.log(`     address-id: ${a.id}`);
    });
  }
  if (res.data.has_phone === false) console.log('\n⚠ No contact phone on file — add one (dashboard, or `--phone` on `address add`).');
}

export async function shopAddressAddCommand(opts: {
  label?: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;
  phone?: string;
  default?: boolean;
  json?: boolean;
}): Promise<void> {
  const id = await requireAgent();
  const res = await shopClient().request<{ address?: MaskedAddress; error?: unknown }>({
    method: 'POST',
    path: '/v1/wallet/shop/addresses',
    body: {
      label: opts.label,
      firstName: opts.firstName,
      lastName: opts.lastName,
      street: opts.line1,
      ...(opts.line2 ? { street2: opts.line2 } : {}),
      locality: opts.city,
      region: opts.region,
      postalCode: opts.postal,
      country: opts.country,
      ...(opts.phone ? { phone: opts.phone } : {}),
      isDefault: opts.default,
    },
    ...id,
  });
  if (res.status !== 201 && res.status !== 200) {
    console.error(`\nrequest failed: ${pickError(res.data) ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }
  if (opts.json) {
    console.log(JSON.stringify(res.data, null, 2));
    return;
  }
  const a = res.data.address;
  console.log(`\n✓ Address saved${a?.isDefault ? ' (default)' : ''}.`);
  if (a) console.log(`  ${a.label ?? '(no label)'} — ${a.summary}\n  address-id: ${a.id}`);
}

export async function shopAddressDefaultCommand(opts: { addressId: string }): Promise<void> {
  const id = await requireAgent();
  const res = await shopClient().request<{ success?: boolean; error?: unknown }>({
    method: 'POST',
    path: '/v1/wallet/shop/addresses/default',
    body: { addressId: opts.addressId },
    ...id,
  });
  if (res.status !== 200) {
    console.error(`\nrequest failed: ${pickError(res.data) ?? `HTTP ${res.status}`}`);
    process.exit(1);
  }
  console.log('✓ Default address updated.');
}

// ─────────────────────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────────────────────

interface SearchResult {
  product_id: string;
  merchant: string;
  title: string;
  price_estimate: { amount: string | null; currency: string };
  image_url: string | null;
}
interface SearchData {
  results: SearchResult[];
  next_cursor: string | null;
  has_more: boolean;
}

export async function shopSearchCommand(opts: {
  query: string;
  intent?: string;
  limit?: number;
  cursor?: string;
  merchant?: string;
  shipsTo?: string;
  json?: boolean;
}): Promise<void> {
  const id = await requireAgent();
  const body: Record<string, unknown> = { query: opts.query };
  if (opts.intent) body.intent = opts.intent;
  if (opts.limit) body.limit = opts.limit;
  if (opts.cursor) body.cursor = opts.cursor;
  if (opts.merchant) body.merchantDomain = opts.merchant;
  if (opts.shipsTo) body.shipsTo = opts.shipsTo;

  const res = await shopPost<SearchData>('/v1/wallet/shop/search', body, id);
  if (res.status !== 200 || res.data?.success === false) fail(res);

  const d = res.data.data!;
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    return;
  }

  const results = d.results ?? [];
  if (results.length === 0) {
    console.log(`No results for "${opts.query}".`);
    return;
  }
  console.log(
    `\n${results.length} result${results.length === 1 ? '' : 's'} for "${opts.query}"${d.has_more ? ' (more available)' : ''}:\n`,
  );
  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.title}`);
    console.log(`     ${money(r.price_estimate?.amount, r.price_estimate?.currency)}  ·  ${r.merchant}`);
    console.log(`     product-id: ${r.product_id}`);
  });
  if (d.has_more && d.next_cursor) {
    console.log(`\nMore results — next page:`);
    console.log(`  prava shop search --query "${opts.query}" --cursor ${d.next_cursor}`);
  }
  console.log(`\nNext: prava shop product --product-id <id> --merchant <merchant>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// product
// ─────────────────────────────────────────────────────────────────────────────

interface Variant {
  id: string;
  label: string;
  priceAmount: number | null;
  currency: string;
  available: boolean;
  options: string[];
  merchantDomain: string;
}
interface ProductData {
  product: {
    id: string;
    merchant: string;
    description?: string;
    variants: Variant[];
  };
}

export async function shopProductCommand(opts: {
  productId: string;
  merchant?: string;
  json?: boolean;
}): Promise<void> {
  const id = await requireAgent();
  const body: Record<string, unknown> = { product_id: opts.productId };
  if (opts.merchant) body.merchantDomain = opts.merchant;

  const res = await shopPost<ProductData>('/v1/wallet/shop/product', body, id);
  if (res.status !== 200 || res.data?.success === false) fail(res);

  if (opts.json) {
    console.log(JSON.stringify(res.data.data, null, 2));
    return;
  }

  const p = res.data.data!.product;
  // The same product is usually listed by several merchants — present each as an
  // "offer" (merchant + price + options) so the user can compare sellers and choose
  // explicitly (instead of being silently switched between them).
  // Sort AVAILABLE offers first, then cheapest — otherwise a cheaper-but-not-orderable
  // listing leads and an auto-pick lands on a dead offer. (available:false from UCP can
  // also mean "unknown", so we sink those rather than hide them.)
  const offers = (p.variants ?? [])
    .slice()
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        (a.priceAmount ?? Infinity) - (b.priceAmount ?? Infinity),
    );
  const availCount = offers.filter((v) => v.available).length;
  if (p.description) {
    const desc = p.description.length > 200 ? `${p.description.slice(0, 200)}…` : p.description;
    console.log(`\n${desc}`);
  }
  const sellers = new Set(offers.map((v) => v.merchantDomain)).size;
  console.log(
    `\n${offers.length} offer${offers.length === 1 ? '' : 's'} from ${sellers} seller${sellers === 1 ? '' : 's'}, ` +
      `${availCount} orderable (orderable first, then cheapest) — prices are item-only; shipping is added at quote:\n`,
  );
  offers.forEach((v, i) => {
    const price = v.priceAmount != null ? `$${centsToDollars(v.priceAmount)} ${v.currency}` : 'price n/a';
    const tags = v.options?.length ? `  [${v.options.join(', ')}]` : '';
    console.log(`  ${i + 1}. ${v.label}  —  ${price}${v.available === false ? '  (out of stock)' : ''}${tags}  ·  ${v.merchantDomain}`);
    console.log(`     variant-id: ${v.id}`);
  });
  console.log(`\nNext: prava shop quote --variant-id <id> --merchant <that offer's merchant above>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// quote
// ─────────────────────────────────────────────────────────────────────────────

interface QuoteData {
  checkout_session_id: string;
  merchant: string;
  final_price: { amount: string; currency: string };
  price_breakdown?: {
    subtotal_cents: number | null;
    shipping_cents: number | null;
    tax_cents: number | null;
    currency: string;
  };
  selected_shipping?: { title: string } | null;
  shipping_options?: unknown[];
  expires_at: string;
}

export async function shopQuoteCommand(opts: {
  variantId: string;
  merchant: string;
  quantity?: number;
  email?: string;
  addressId?: string;
  retries?: number;
  yes?: boolean;
  json?: boolean;
}): Promise<void> {
  const id = await requireAgent();
  await confirmOrExit({
    yes: opts.yes,
    tty: `Get a live quote for ${opts.variantId} from ${opts.merchant} (qty ${opts.quantity ?? 1})? This opens a checkout session.`,
    refuse: `quote not confirmed — confirm the seller/variant with the user, then re-run with --yes.`,
  });
  const body: Record<string, unknown> = {
    variant_id: opts.variantId,
    merchantDomain: opts.merchant,
    quantity: opts.quantity ?? 1,
    // address is resolved server-side by the wallet (PII never travels via the agent); we only
    // optionally select WHICH saved address by id. Default address is used when omitted.
    ...(opts.addressId ? { address_id: opts.addressId } : {}),
  };
  if (opts.email) body.email = opts.email;

  const res = await shopPost<QuoteData>('/v1/wallet/shop/quote', body, id, {
    timeoutMs: SHOP_BROWSER_TIMEOUT_MS,
    retries: opts.retries ?? 1,
  });
  if (res.status !== 200 || res.data?.success === false) fail(res);

  if (opts.json) {
    console.log(JSON.stringify(res.data.data, null, 2));
    return;
  }

  const q = res.data.data!;
  const b = q.price_breakdown;
  console.log(`\nQuote for ${q.merchant}`);
  console.log(`  Total: ${money(q.final_price?.amount, q.final_price?.currency)}`);
  if (b) {
    console.log(
      `  (subtotal $${centsToDollars(b.subtotal_cents)} + shipping $${centsToDollars(b.shipping_cents)} + tax $${centsToDollars(b.tax_cents)})`,
    );
  }
  if (q.selected_shipping?.title) console.log(`  Shipping: ${q.selected_shipping.title}`);
  const mins = Math.round((new Date(q.expires_at).getTime() - Date.now()) / 60_000);
  console.log(`  Expires: in ~${mins}m`);
  console.log(`  checkout-session-id: ${q.checkout_session_id}`);
  console.log(
    `\nNext: mint a card session for ${money(q.final_price?.amount, q.final_price?.currency)} ` +
      `(prava sessions create … → approve → prava sessions poll), then:`,
  );
  console.log(
    `  prava shop checkout --checkout-session-id ${q.checkout_session_id} --token <t> --cryptogram <c> --expiry-month <mm> --expiry-year <yyyy>`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// checkout
// ─────────────────────────────────────────────────────────────────────────────

interface CheckoutData {
  status?: string;
  order_id?: string | null;
  amount?: { amount: string; currency: string };
  failure_reason?: string;
}

export async function shopCheckoutCommand(opts: {
  checkoutSessionId: string;
  token: string;
  cryptogram: string;
  expiryMonth?: string;
  expiryYear?: string;
  cardholderName?: string;
  yes?: boolean;
  json?: boolean;
}): Promise<void> {
  const id = await requireAgent();
  await confirmOrExit({
    yes: opts.yes,
    tty: `Pay the quoted total for ${opts.checkoutSessionId} with the provided card?`,
    refuse: `checkout not confirmed — confirm the final total with the user, then re-run with --yes.`,
  });
  const credentials: Record<string, unknown> = { token: opts.token, cryptogram: opts.cryptogram };
  if (opts.expiryMonth) credentials.expiry_month = opts.expiryMonth;
  if (opts.expiryYear) credentials.expiry_year = opts.expiryYear;
  if (opts.cardholderName) credentials.cardholder_name = opts.cardholderName;

  const res = await shopPost<CheckoutData>(
    '/v1/wallet/shop/checkout',
    { checkout_session_id: opts.checkoutSessionId, credentials },
    id,
    { timeoutMs: SHOP_BROWSER_TIMEOUT_MS }, // no retries — a timed-out charge may have gone through
  );

  const env = res.data;
  if (opts.json) {
    console.log(JSON.stringify(env, null, 2));
    return;
  }

  const d = env?.data ?? {};
  const paid = res.status === 200 && env?.success === true && d.status === 'paid';
  if (paid) {
    console.log(`\n✓ Paid.`);
    if (d.amount) console.log(`  Amount: ${money(d.amount.amount, d.amount.currency)}`);
    if (d.order_id) console.log(`  Order:  ${d.order_id}`);
    return;
  }

  // Not paid: declined / failed / expired-or-replayed / 5xx-unknown.
  const reason = d.failure_reason ?? pickError(env) ?? 'Payment not completed';
  console.error(
    `\n✗ Checkout ${d.status ?? 'failed'}${env?.replayed ? ' (already processed — no new charge)' : ''}: ${reason}`,
  );
  process.exit(1);
}
