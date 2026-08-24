/**
 * Prava Session Server Action — Next.js App Router
 *
 * This server action creates a Prava session by calling the Prava backend.
 * It uses the MERCHANT_SECRET_KEY which is ONLY available server-side.
 *
 * Usage:
 *   import { createPravaSession } from '@/app/actions';  // or wherever you place this
 *   const session = await createPravaSession({ checkoutRef: 'demo-purchase' });
 *
 * Place this file in: src/app/actions.ts (or src/lib/prava.ts)
 */
'use server';

// ── Configuration ─────────────────────────────────────────
// These come from your .env.local file. The API base URL is server-only; the
// browser only needs the publishable key and the iframe_url returned per session.
// Falls back to sandbox — set PRAVA_BACKEND_URL=https://api.prava.space for production.
const BACKEND_URL = process.env.PRAVA_BACKEND_URL || 'https://sandbox.api.prava.space';
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

// ── Types ──────────────────────────────────────────────────

export interface SessionResponse {
  session_id: string;
  session_token: string;
  expires_at: string;
  iframe_url: string;
  order_id: string;
}

export interface PaymentLineItem {
  txn_ref_id: string;
  merchant_name: string;
  merchant_url: string;
  total_amount: string;
  status: string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  products: Array<{
    product_ref_id: string;
    external_product_id: string | null;
    name: string;
    unit_price: string;
    quantity: number;
  }>;
}

export interface PravaApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ShopPayState {
  status: string;
  [key: string]: unknown;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_result'
  | 'completed'
  | 'failed'
  | string;

export interface PaymentTransaction {
  txn_id: string;
  status: PaymentStatus;
  line_items: PaymentLineItem[];
  error?: PravaApiError;
}

export interface PaymentResultResponse {
  session_id: string;
  order_id: string | null;
  status: PaymentStatus;
  /** Empty or omitted for quote-backed terminal results handled by Shop Pay. */
  transactions?: PaymentTransaction[];
  error?: PravaApiError;
  shop_pay?: ShopPayState | null;
}

export interface PaymentStatusResponse {
  session_id: string;
  order_id: string | null;
  status: PaymentStatus;
  /** True only when a custom checkout has a complete one-time credential server-side. */
  credential_ready: boolean;
  error?: Pick<PravaApiError, 'code' | 'message'>;
  /** Credential-free merchant checkout state only; the full shop_pay object stays server-side. */
  shop_pay_status?: string;
}

export interface PurchaseContextEntry {
  merchant_details: {
    name: string;
    url: string;
    country_code_iso2: string;
    category_code?: string;
    category?: string;
  };
  product_details: Array<{
    product_id?: string;
    description: string;
    unit_price: string;
    quantity?: number;
  }>;
  effective_until_minutes?: number;
}

export type PurchaseContext =
  | {
      quote?: false;
      custom: PurchaseContextEntry[];
      quote_id?: never;
      access_grant?: never;
    }
  | {
      quote: true;
      quote_id: string;
      access_grant?: string;
      custom?: never;
    };

interface CreateSessionParams {
  /** Opaque reference resolved against trusted server-side cart/catalog data. */
  checkoutRef: string;
  /** `embedding` for PravaSDK.collectPAN; `full_checkout` for iframe_url/new-tab flows. */
  integrationType?: 'embedding' | 'full_checkout';
}

interface AuthenticatedUser {
  id: string;
  email: string;
}

interface ServerCheckout {
  totalAmount: string;
  currency: string;
  description: string;
  callbackUrl?: string;
  purchaseContext: PurchaseContext;
}

// ADAPT: replace with your app's auth provider (Auth.js, Clerk, custom session, etc.).
// This deliberately fails closed until authentication is wired.
async function requireAuthenticatedUser(): Promise<AuthenticatedUser> {
  // Example with Auth.js:
  // const session = await auth();
  // if (!session?.user?.id || !session.user.email) throw new Error('Authentication required');
  // return { id: session.user.id, email: session.user.email };
  throw new Error('Configure requireAuthenticatedUser() with your server-side auth provider.');
}

// ADAPT: replace this demo catalog lookup with your trusted cart/order service.
// Never accept amount, currency, merchant, products, user ID, or email from the browser.
const SERVER_CHECKOUTS = new Map<string, ServerCheckout>([
  ['demo-purchase', {
    totalAmount: '49.99',
    currency: 'USD',
    description: 'Demo purchase',
    purchaseContext: {
      custom: [
        {
          merchant_details: {
            name: 'Zara',
            url: 'https://www.zara.com',
            country_code_iso2: 'US',
            category_code: '5651',
            category: 'Apparel',
          },
          product_details: [
            {
              product_id: 'purchase-1',
              description: 'Demo purchase',
              unit_price: '49.99',
              quantity: 1,
            },
          ],
          effective_until_minutes: 15,
        },
      ],
    },
  }],
]);

interface SessionOwnerBinding {
  userId: string;
  expiresAtMs: number;
}

// Sandbox/local reference only. Replace this process-local map with a durable
// checkout/session table before deploying across multiple instances. A missing
// binding fails closed, so an authenticated user cannot query another user's
// Prava session by supplying an arbitrary session_id.
const SESSION_OWNERS = new Map<string, SessionOwnerBinding>();

function rememberSessionOwner(userId: string, session: SessionResponse): void {
  const parsedExpiry = Date.parse(session.expires_at);
  SESSION_OWNERS.set(session.session_id, {
    userId,
    expiresAtMs: Number.isFinite(parsedExpiry)
      ? parsedExpiry
      : Date.now() + 15 * 60 * 1000,
  });
}

function assertSessionOwner(userId: string, sessionId: string): void {
  const binding = SESSION_OWNERS.get(sessionId);
  if (!binding || binding.userId !== userId || binding.expiresAtMs <= Date.now()) {
    if (binding?.expiresAtMs && binding.expiresAtMs <= Date.now()) {
      SESSION_OWNERS.delete(sessionId);
    }
    throw new Error('Session not found.');
  }
}

// ── Server Action ──────────────────────────────────────────

/**
 * Creates a Prava session for card enrollment / payment.
 *
 * This runs on the server, authenticates the user, and resolves trusted order
 * data by checkoutRef — the secret key and authoritative order fields never
 * reach or originate from the browser.
 * Returns session_token + iframe_url that the frontend needs.
 */
export async function createPravaSession({
  checkoutRef,
  integrationType = 'embedding',
}: CreateSessionParams): Promise<SessionResponse> {
  // Validate secret key is configured
  if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
    throw new Error(
      'MERCHANT_SECRET_KEY not configured. Add it to .env.local:\n' +
      'MERCHANT_SECRET_KEY=sk_test_your_key_here'
    );
  }
  if (integrationType !== 'embedding' && integrationType !== 'full_checkout') {
    throw new Error('integrationType must be "embedding" or "full_checkout".');
  }
  const user = await requireAuthenticatedUser();
  const checkout = SERVER_CHECKOUTS.get(checkoutRef);
  if (!checkout) throw new Error('Checkout not found.');

  // Call Prava backend to create session
  const res = await fetch(`${BACKEND_URL}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({
      user_id: user.id,
      user_email: user.email,
      total_amount: checkout.totalAmount,
      currency: checkout.currency,
      description: checkout.description,
      integration_type: integrationType,
      ...(checkout.callbackUrl && { callback_url: checkout.callbackUrl }),
      purchase_context: checkout.purchaseContext,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to create session (HTTP ${res.status})`);
  }

  const session = await res.json() as SessionResponse;
  if (!session.session_id || !session.session_token || !session.iframe_url || !session.expires_at) {
    throw new Error('Prava returned an invalid session response.');
  }
  rememberSessionOwner(user.id, session);
  return session;
}

/**
 * Polls for the payment result after the user completes the card flow.
 *
 * Use session_id (NOT session_token) and authenticate with your secret key.
 * Credentials become actionable at `awaiting_result`. `completed` means the
 * merchant already reported an APPROVED outcome. Keep this function server-side:
 * its response can contain a network token and dynamic CVV.
 *
 * After charging the credential, report the outcome (required — APPROVED or DECLINED):
 *   POST ${BACKEND_URL}/v1/sessions/{session_id}/report-status
 *   Body: { txn_ref_id: lineItem.txn_ref_id, txn_status: 'APPROVED' }
 *
 * Before the processor call, atomically claim txn_ref_id in durable storage and
 * use a stable processor idempotency key derived from it. Persist the processor
 * operation/result so a worker crash resumes the same charge before reporting.
 *
 * This is intentionally NOT exported. In a `use server` module, exporting it
 * would create a browser-callable Server Action that could return credentials.
 */
async function pollPaymentResult(sessionId: string): Promise<PaymentResultResponse> {
  if (!MERCHANT_SECRET_KEY) {
    throw new Error('MERCHANT_SECRET_KEY not configured.');
  }

  // Cache-buster + no-store prevent stale or deduplicated polling responses.
  const res = await fetch(
    `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MERCHANT_SECRET_KEY}` },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error('Session not found');
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to poll result (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Browser-safe polling view. It deliberately strips transactions and payment
 * credentials. Use this from client components; keep `pollPaymentResult` inside
 * your trusted server-side payment worker.
 */
export async function pollPaymentStatus(sessionId: string): Promise<PaymentStatusResponse> {
  const user = await requireAuthenticatedUser();
  assertSessionOwner(user.id, sessionId);
  const result = await pollPaymentResult(sessionId);
  const transactions = result.transactions ?? [];
  const credentialReady =
    result.status === 'awaiting_result' &&
    transactions.some((transaction) =>
      transaction.line_items.some(
        (lineItem) =>
          Boolean(lineItem.token) &&
          Boolean(lineItem.dynamic_cvv) &&
          Boolean(lineItem.expiry_month) &&
          Boolean(lineItem.expiry_year)
      )
    );
  const safeError =
    result.error ?? transactions.find((transaction) => transaction.error)?.error;

  return {
    session_id: result.session_id,
    order_id: result.order_id,
    status: result.status,
    credential_ready: credentialReady,
    ...(safeError
      ? { error: { code: safeError.code, message: safeError.message } }
      : {}),
    ...(result.shop_pay?.status ? { shop_pay_status: result.shop_pay.status } : {}),
  };
}

/**
 * Revokes an active session when the authenticated owner cancels checkout.
 * Keep the ownership check: session IDs are browser-visible but must not be
 * accepted as authorization to revoke another user's flow.
 */
export async function revokePravaSession(sessionId: string): Promise<{ success: true }> {
  if (!MERCHANT_SECRET_KEY) {
    throw new Error('MERCHANT_SECRET_KEY not configured.');
  }
  const user = await requireAuthenticatedUser();
  assertSessionOwner(user.id, sessionId);

  const res = await fetch(
    `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/revoke`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${MERCHANT_SECRET_KEY}` },
      cache: 'no-store',
    }
  );
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to revoke session (HTTP ${res.status})`);
  }

  SESSION_OWNERS.delete(sessionId);
  return { success: true };
}

export interface ProductStatusInput {
  productId?: string;
  productRefId?: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELED' | 'INPROGRESS' | 'PENDING' | 'ONHOLD';
  amountPaid?: string;
}

export interface ReportPaymentStatusParams {
  sessionId: string;
  txnRefId: string;
  txnStatus: 'APPROVED' | 'DECLINED';
  authorizationCode?: string;
  responseCode?: string;
  amountPaid?: string;
  productStatuses?: ProductStatusInput[];
}

export interface ReportPaymentStatusResponse {
  status: 'confirmed';
  txn_ref_id: string;
  txn_status: 'APPROVED' | 'DECLINED';
  visa_confirmation: string;
}

/**
 * Reports the real processor outcome after your server uses a credential from
 * an `awaiting_result` response. Report DECLINED outcomes too. Never derive this
 * value from an unauthenticated browser assertion. This helper is deliberately
 * NOT exported from the Server Action module; call it from a trusted payment
 * worker here, or move it unchanged into a `server-only` module.
 */
async function reportPaymentStatus({
  sessionId,
  txnRefId,
  txnStatus,
  authorizationCode,
  responseCode,
  amountPaid,
  productStatuses,
}: ReportPaymentStatusParams): Promise<ReportPaymentStatusResponse> {
  if (!MERCHANT_SECRET_KEY) {
    throw new Error('MERCHANT_SECRET_KEY not configured.');
  }
  if (productStatuses?.some((product) => !product.productId && !product.productRefId)) {
    throw new Error('Each product status requires productId or productRefId.');
  }

  const res = await fetch(`${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/report-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({
      txn_ref_id: txnRefId,
      txn_status: txnStatus,
      txn_type: 'PURCHASE',
      ...(authorizationCode && { authorization_code: authorizationCode }),
      ...(responseCode && { response_code: responseCode }),
      ...(amountPaid && { amount_paid: amountPaid }),
      ...(productStatuses && {
        product_statuses: productStatuses.map((product) => ({
          ...(product.productId && { product_id: product.productId }),
          ...(product.productRefId && { product_ref_id: product.productRefId }),
          status: product.status,
          ...(product.amountPaid && { amount_paid: product.amountPaid }),
        })),
      }),
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to report payment status (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Server-side health check for the Prava backend.
 * Use this to show a connectivity indicator in your UI.
 */
export async function checkPravaHealth(): Promise<{ healthy: boolean }> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { cache: 'no-store' });
    return { healthy: res.ok };
  } catch {
    return { healthy: false };
  }
}
