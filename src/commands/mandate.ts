/**
 * prava mandate — Authorize a card once (passkey), then charge it later within caps.
 *
 * All mandate endpoints live on the CORE API (not the wallet): `POST /v1/sessions/agent` with
 * `mandate_setup` for create; `GET /v1/mandates` for list/poll; `POST /v1/mandates/:id/{charge,
 * charges/:txn/report,cancel}`. The skill (not this file) drives UX — offer vs. autonomous,
 * which mandate matches, and never surfacing raw ids to the user.
 *
 * Exit codes: 0 = success, 1 = error/declined, 2 = agent not linked / not confirmed non-interactively.
 */

import { createInterface } from 'node:readline/promises';
import { PravaClient } from '../http/client.js';
import { AgentStore } from '../storage/agent-store.js';
import { decryptTokenPayload, type EncryptedPayload } from '../crypto/decrypt.js';

// All mandate endpoints live on the core API; default client = core + skill tag 'prava-pay'.
export function mandateClient(): PravaClient {
  return new PravaClient();
}

interface MandateRequestOpts {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  agentId?: string;
  privateKey?: string;
}

/**
 * Wraps client.request, converting a thrown transport error (network blip, DNS failure, abort/
 * timeout) into the SAME `{status, data}` shape every caller already branches on — a synthetic
 * 5xx-range status (599, the conventional "network connect timeout" code) so:
 *   - poll's loop, which already treats a real 5xx as transient and keeps polling, does the same
 *     for a blip with no extra branching (mirrors sessions.ts's poll try/catch, but DRY);
 *   - every one-shot command's existing `res.status >= 400` guard turns it into a clean `✗ ...` +
 *     exit 1 instead of an unhandled rejection / raw stack trace.
 * Not a retry — callers decide what "continue" or "exit" means for their own loop, if any.
 */
async function mandateRequest<T>(client: PravaClient, opts: MandateRequestOpts): Promise<{ status: number; data: T }> {
  try {
    return await client.request<T>(opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 599, data: { error: { message: `request failed: ${msg}` } } as T };
  }
}

export interface AgentIds { agentId: string; privateKey: string; publicKey: string; }

export async function requireAgent(): Promise<AgentIds> {
  const data = new AgentStore().load();
  if (!data || !data.linked || !data.agentId) {
    console.error('No linked agent. Run `prava setup` first.');
    process.exit(2);
  }
  return { agentId: data.agentId, privateKey: data.privateKey, publicKey: data.publicKey };
}

// ponytail: local confirm speed-bump (same shape as shop.ts); extract to a shared util if a 3rd consumer appears.
export async function confirmOrExit(o: { yes?: boolean; tty: string; refuse: string }): Promise<void> {
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

export interface MandateRow {
  id: string;
  state: string;
  status: string;
  recurringFrequency: string;
  merchantScope: 'any' | 'listed';
  merchantName: string | null;
  approvedAmount: string | null;
  remaining: string | null;
  currency: string | null;
  validUntil: string | null;
  renewsAt: string | null;
  createdAt: string;
}

export interface MandatePollCriteria {
  scope: string;
  merchant?: string;
  amount: string;
  currency: string;
}

function canonicalAmount(value: string | null): string | null {
  if (value == null) return null;
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = BigInt(match[1]!).toString();
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${whole}.${fraction}`;
}

function normalizeExactMerchantName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isUrlLike(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
}

export function mandatePollCriteriaProblem(criteria: MandatePollCriteria): string | null {
  const scope = criteria.scope.toLowerCase();
  if (scope !== 'listed' && scope !== 'any') return '--scope must be either listed or any.';
  if (!canonicalAmount(criteria.amount)) return '--amount must be a non-negative amount with at most two decimal places.';
  if (!/^[a-z]{3}$/i.test(criteria.currency.trim())) return '--currency must be a three-letter ISO 4217 code.';
  if (scope === 'listed' && !criteria.merchant?.trim()) {
    return '--merchant is required for --scope listed and must identify the exact merchant used at creation.';
  }
  if (scope === 'listed' && isUrlLike(criteria.merchant ?? '')) {
    return '--merchant must be the exact merchant name used at creation, not a URL.';
  }
  if (scope === 'any' && criteria.merchant?.trim()) {
    return '--merchant must be omitted for --scope any.';
  }
  return null;
}

export function mandateMatchesPoll(row: MandateRow, criteria: MandatePollCriteria): boolean {
  const scope = criteria.scope.toLowerCase();
  if (row.status !== 'active' || row.state !== 'available') return false;
  if (row.merchantScope !== scope) return false;
  if (canonicalAmount(row.approvedAmount) !== canonicalAmount(criteria.amount)) return false;
  if ((row.currency ?? '').toUpperCase() !== criteria.currency.trim().toUpperCase()) return false;
  if (scope === 'any') return !criteria.merchant?.trim();

  if (isUrlLike(criteria.merchant ?? '')) return false;
  const expectedMerchant = normalizeExactMerchantName(criteria.merchant ?? '');
  const actualMerchant = normalizeExactMerchantName(row.merchantName ?? '');
  return expectedMerchant.length > 0 && actualMerchant === expectedMerchant;
}

/**
 * Fail closed when multiple standing mandates satisfy the strict tuple. "Newest" is not proof that
 * a mandate belongs to this setup session; exact session correlation is the durable follow-up.
 */
export function selectMandatePollMatch(
  rows: MandateRow[],
  criteria: MandatePollCriteria,
): MandateRow | undefined {
  const matches = rows.filter((row) => mandateMatchesPoll(row, criteria));
  return matches.length === 1 ? matches[0] : undefined;
}

function shellQuote(value: string): string {
  return "'" + value.split("'").join("'\\''") + "'";
}

export async function mandateCreateCommand(opts: {
  merchantName?: string; merchantUrl?: string; merchantCountry?: string;
  amount: string; currency: string;
  frequency?: string; scope?: string;
  product?: string[]; validUntil?: string; maxCharges?: string;
  yes?: boolean; json?: boolean;
}): Promise<void> {
  const { agentId, privateKey } = await requireAgent();
  const frequency = (opts.frequency ?? 'one_time').toLowerCase();
  // Core forces recurring to be merchant-locked; only one_time may be 'any'.
  const scope = frequency === 'one_time' ? (opts.scope ?? 'listed').toLowerCase() : 'listed';

  let merchant: { name: string; url: string; country_code_iso2: string };
  if (scope === 'any') {
    // Inert placeholders — required by core's schema but dropped for an open mandate.
    merchant = { name: 'Any merchant', url: 'https://prava.space', country_code_iso2: (opts.merchantCountry ?? 'US').toUpperCase() };
  } else {
    if (!opts.merchantName || !opts.merchantUrl || !opts.merchantCountry) {
      console.error('A merchant-locked mandate needs --merchant-name, --merchant-url and --merchant-country (or use --scope any).');
      process.exit(1);
    }
    merchant = { name: opts.merchantName, url: opts.merchantUrl, country_code_iso2: opts.merchantCountry.toUpperCase() };
  }

  const products = (opts.product ?? []).map((p) => JSON.parse(p) as Record<string, unknown>);
  const productDetails = products.length ? products : [{
    description: scope === 'any' ? 'Standing mandate budget' : `${merchant.name} purchase`,
    unit_price: opts.amount,
    quantity: 1,
  }];

  await confirmOrExit({
    yes: opts.yes,
    tty: `Set up a mandate authorizing up to ${opts.amount} ${opts.currency.toUpperCase()} at ${scope === 'any' ? 'any merchant' : merchant.name} (${frequency})?`,
    refuse: 'mandate setup not confirmed — confirm the merchant, cap and period with the user, then re-run with --yes.',
  });

  const res = await mandateRequest<any>(mandateClient(), {
    method: 'POST',
    path: '/v1/sessions/agent',
    body: {
      total_amount: opts.amount,
      currency: opts.currency.toUpperCase(),
      merchant_name: merchant.name,
      merchant_url: merchant.url,
      merchant_country: merchant.country_code_iso2,
      products: productDetails,
      mandate_setup: {
        intent: 'mandate_setup',
        recurring_frequency: frequency,
        merchant_scope: scope,
        ...(opts.validUntil ? { valid_until: opts.validUntil } : {}),
        ...(opts.maxCharges ? { max_charges: parseInt(opts.maxCharges, 10) } : {}),
      },
    },
    agentId, privateKey,
  });

  const d: any = res.data ?? {};
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    if (res.status >= 400) process.exit(1);
    return;
  }
  if (res.status >= 400 || !d.payment_url) {
    console.error(`\n✗ Could not start mandate setup: ${d?.error?.message ?? JSON.stringify(d)}`);
    process.exit(1);
  }
  console.log(`\nMandate setup started. Ask the user to approve with their passkey:`);
  console.log(`  ${d.payment_url}`);
  console.log(`\nOne-time mandates are valid up to 7 days. After the user approves, run:`);
  const merchantArg = scope === 'any' ? '' : ` --merchant ${shellQuote(merchant.name)}`;
  console.log(
    `  prava mandate poll --scope ${scope}${merchantArg} --amount ${opts.amount} --currency ${opts.currency.toUpperCase()}`,
  );
}

export async function mandateListCommand(opts: { merchant?: string; json?: boolean }): Promise<void> {
  const { agentId, privateKey } = await requireAgent();
  const res = await mandateRequest<{ mandates?: MandateRow[]; error?: { message?: string } }>(mandateClient(), {
    method: 'GET', path: '/v1/mandates', agentId, privateKey,
  });
  if (res.status >= 400) {
    console.error(`\n✗ Could not list mandates: ${res.data?.error?.message ?? JSON.stringify(res.data)}`);
    process.exit(1);
  }
  // List keeps broad discovery semantics. Poll deliberately uses a separate fail-closed matcher.
  const mandates = (res.data?.mandates ?? []).filter((x) => merchantMatches(x, opts.merchant));
  if (opts.json) { console.log(JSON.stringify(mandates, null, 2)); return; }
  if (!mandates.length) { console.log('No mandates.'); return; }
  for (const x of mandates) {
    const who = x.merchantScope === 'any' ? 'Any store' : (x.merchantName ?? 'Unknown');
    const bal = x.remaining != null && x.approvedAmount != null ? `${x.remaining}/${x.approvedAmount} ${x.currency ?? ''}`.trim() : '';
    const when = x.validUntil ? `expires ${x.validUntil.slice(0, 10)}` : (x.renewsAt ? `renews ${x.renewsAt.slice(0, 10)}` : '');
    console.log(`• ${who} — ${bal}${when ? `, ${when}` : ''} [${x.state}]`);
  }
}

function merchantMatches(row: MandateRow, filter?: string): boolean {
  if (!filter) return true;
  if (row.merchantScope === 'any') return true;
  const name = (row.merchantName ?? '').toLowerCase();
  const f = filter.toLowerCase();
  return name.includes(f) || (f.includes(name) && name.length > 0);
}

export async function mandatePollCommand(opts: {
  scope: string;
  merchant?: string;
  amount: string;
  currency: string;
  json?: boolean;
}): Promise<void> {
  const problem = mandatePollCriteriaProblem(opts);
  if (problem) {
    console.error(`Invalid mandate poll: ${problem}`);
    process.exit(1);
  }
  const { agentId, privateKey } = await requireAgent();
  const deadline = Date.now() + 10 * 60 * 1000;
  let delay = 3000;
  // Strict tuple matching is defense in depth. Exact setup-session correlation remains the durable fix.
  while (Date.now() < deadline) {
    const res = await mandateRequest<{ mandates?: MandateRow[]; error?: { message?: string } }>(mandateClient(), {
      method: 'GET', path: '/v1/mandates?standing_only=true', agentId, privateKey,
    });
    if (res.status >= 400) {
      if (res.status < 500) {
        // 4xx (auth/permissions/etc.) won't fix itself on the next tick — surface it now instead
        // of silently retrying for the full 10 minutes and reporting a misleading "timed out".
        console.error(`\n✗ Could not check mandates: ${res.data?.error?.message ?? JSON.stringify(res.data)}`);
        process.exit(1);
      }
      // 5xx — including a transport blip that mandateRequest mapped to 599 — is transient; keep polling.
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(Math.floor(delay * 1.5), 20000);
      continue;
    }
    const match = selectMandatePollMatch(res.data?.mandates ?? [], opts);
    if (match) {
      if (opts.json) { console.log(JSON.stringify(match, null, 2)); return; }
      const who = match.merchantScope === 'any' ? 'Any store' : (match.merchantName ?? 'Unknown');
      console.log(`\n✓ Mandate active — ${who}, ${match.approvedAmount ?? ''} ${match.currency ?? ''}`.trimEnd() + (match.validUntil ? `, expires ${match.validUntil.slice(0, 10)}.` : '.'));
      return;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(Math.floor(delay * 1.5), 20000);
  }
  console.error('Timed out waiting for the mandate to become active. The user may not have completed the passkey — check `prava mandate list`.');
  process.exit(1);
}

export async function mandateChargeCommand(opts: {
  mandateId: string; amount: string; reference?: string; product?: string[];
  yes?: boolean; json?: boolean;
}): Promise<void> {
  const { agentId, privateKey, publicKey } = await requireAgent();
  await confirmOrExit({
    yes: opts.yes,
    tty: `Charge ${opts.amount} against this mandate?`,
    refuse: 'charge not confirmed — offer the mandate to the user (or act on their standing instruction), then re-run with --yes.',
  });

  const products = (opts.product ?? []).map((p) => JSON.parse(p) as Record<string, unknown>);
  const body: Record<string, unknown> = { amount: opts.amount };
  if (opts.reference) body.reference = opts.reference;
  if (products.length) body.purchase_context = [{ product_details: products }];

  const res = await mandateRequest<any>(mandateClient(), {
    method: 'POST', path: `/v1/mandates/${opts.mandateId}/charge`, body, agentId, privateKey,
  });
  const d: any = res.data ?? {};
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    if (res.status >= 400 || d.status === 'failed' || d.fetchStatus === 'FAILURE') process.exit(1);
    return;
  }

  if (res.status >= 400) {
    console.error(`\n✗ Charge failed: ${d.error?.message ?? d.errorMessage ?? 'request failed'}`);
    process.exit(1);
  }

  if (d.status === 'failed' || d.fetchStatus === 'FAILURE') {
    console.error(`\n✗ Charge declined: ${d.errorMessage ?? d.errorCode ?? 'unknown reason'}`);
    process.exit(1);
  }

  // Preferred: encrypted_payload (core §7.1). Transitional fallback: plaintext credentials.
  let creds: { token: string; cryptogram: string; expiry_month: string; expiry_year: string } | null = null;
  if (d.encrypted_payload) {
    try {
      creds = decryptTokenPayload(d.encrypted_payload as EncryptedPayload, publicKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n✗ Could not decrypt the mandate charge credentials: ${msg}`);
      process.exit(1);
    }
  } else if (d.credentials) {
    creds = {
      token: d.credentials.token, cryptogram: d.credentials.dynamicCvv,
      expiry_month: d.credentials.expiryMonth, expiry_year: d.credentials.expiryYear,
    };
  }
  if (!creds || !creds.token) {
    console.error(`\n✗ Charge returned no usable credentials: ${JSON.stringify(d)}`);
    process.exit(1);
  }

  console.log(`\nCard tokenized from mandate.`);
  console.log(`Token:        ${creds.token}`);
  console.log(`Cryptogram:   ${creds.cryptogram}`);
  console.log(`Expiry:       ${creds.expiry_month}/${creds.expiry_year}`);
  if (d.transactionId) console.log(`Transaction:  ${d.transactionId}`);
  console.log(`\nUse these to check out at the merchant, then run:`);
  console.log(`  prava mandate report --mandate-id ${opts.mandateId} --txn-id ${d.transactionId ?? '<transactionId>'} --status APPROVED`);
}

export async function mandateReportCommand(opts: {
  mandateId: string; txnId: string; status: string;
  authorizationCode?: string; responseCode?: string; amountPaid?: string; json?: boolean;
}): Promise<void> {
  const { agentId, privateKey } = await requireAgent();
  const body: Record<string, unknown> = { txn_status: opts.status.toUpperCase(), txn_type: 'PURCHASE' };
  if (opts.authorizationCode) body.authorization_code = opts.authorizationCode;
  if (opts.responseCode) body.response_code = opts.responseCode;
  if (opts.amountPaid) body.amount_paid = opts.amountPaid;
  const res = await mandateRequest<any>(mandateClient(), {
    method: 'POST', path: `/v1/mandates/${opts.mandateId}/charges/${opts.txnId}/report`, body, agentId, privateKey,
  });
  const d: any = res.data ?? {};
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    if (res.status >= 400) process.exit(1);
    return;
  }
  if (res.status >= 400) { console.error(`\n✗ Report failed: ${d?.error?.message ?? JSON.stringify(d)}`); process.exit(1); }
  console.log(`\n✓ Charge ${d.status ?? 'reported'}.`);
}

export async function mandateCancelCommand(opts: { mandateId: string; yes?: boolean; json?: boolean }): Promise<void> {
  const { agentId, privateKey } = await requireAgent();
  await confirmOrExit({
    yes: opts.yes,
    tty: `Cancel this mandate? This revokes the authorization.`,
    refuse: 'cancel not confirmed — confirm with the user, then re-run with --yes.',
  });
  const res = await mandateRequest<any>(mandateClient(), {
    method: 'POST', path: `/v1/mandates/${opts.mandateId}/cancel`, agentId, privateKey,
  });
  const d: any = res.data ?? {};
  if (opts.json) {
    console.log(JSON.stringify(d, null, 2));
    if (res.status >= 400) process.exit(1);
    return;
  }
  if (res.status >= 400) { console.error(`\n✗ Cancel failed: ${d?.error?.message ?? JSON.stringify(d)}`); process.exit(1); }
  console.log(`\n✓ Mandate cancelled.`);
}
