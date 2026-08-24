/**
 * Prava Session Route — Express.js
 *
 * Mount behind your application's authentication middleware:
 *   app.use('/api/prava', requireUser, pravaRouter)
 *
 * All calls to Prava use MERCHANT_SECRET_KEY on this trusted server. The
 * browser receives only session bootstrap data and a credential-free status
 * projection. Integrate your payment processor beside
 * `fetchPravaPaymentResult`: atomically claim txn_ref_id in durable storage,
 * reuse it as the processor idempotency anchor, persist the operation/result,
 * then call `reportPravaPaymentStatus` with the real APPROVED or DECLINED
 * outcome. A worker retry must never create a second processor charge.
 */

import { Router, Request, Response } from 'express';

const router = Router();

// Falls back to sandbox — set PRAVA_BACKEND_URL=https://api.prava.space for production.
const BACKEND_URL = process.env.PRAVA_BACKEND_URL || 'https://sandbox.api.prava.space';
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

type IntegrationType = 'embedding' | 'full_checkout';
type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_result'
  | 'completed'
  | 'failed'
  | string;

interface PravaApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

interface ShopPayState {
  status: string;
  [key: string]: unknown;
}

interface PurchaseContextEntry {
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

type PurchaseContext =
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

interface CreateSessionBody {
  /** Opaque reference resolved against trusted server-side cart/catalog data. */
  checkoutRef: string;
  integrationType?: IntegrationType;
}

interface AppUser {
  id: string;
  email: string;
}

type AuthenticatedRequest = Request & { user?: AppUser };

interface ServerCheckout {
  totalAmount: string;
  currency: string;
  description: string;
  callbackUrl?: string;
  purchaseContext: PurchaseContext;
}

interface SessionResponse {
  session_id: string;
  session_token: string;
  expires_at: string;
  iframe_url: string;
  order_id: string;
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

// Sandbox/local reference only. Replace this process-local map with your
// durable checkout/session table before running multiple server instances.
// Missing bindings fail closed instead of exposing another user's status.
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

function ownsSession(userId: string, sessionId: string): boolean {
  const binding = SESSION_OWNERS.get(sessionId);
  if (!binding || binding.userId !== userId || binding.expiresAtMs <= Date.now()) {
    if (binding?.expiresAtMs && binding.expiresAtMs <= Date.now()) {
      SESSION_OWNERS.delete(sessionId);
    }
    return false;
  }
  return true;
}

interface PaymentLineItem {
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

interface PaymentTransaction {
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

interface ProductStatusInput {
  productId?: string;
  productRefId?: string;
  status: 'COMPLETED' | 'FAILED' | 'CANCELED' | 'INPROGRESS' | 'PENDING' | 'ONHOLD';
  amountPaid?: string;
}

export interface ReportPaymentStatusInput {
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

function requireSecretKey(): string {
  if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
    throw new Error('MERCHANT_SECRET_KEY not configured. Add it to your .env file.');
  }
  return MERCHANT_SECRET_KEY;
}

async function responseError(response: globalThis.Response): Promise<Error> {
  const data = await response.json().catch(() => null) as
    | { error?: { message?: string } }
    | null;
  return new Error(data?.error?.message || `Prava API error (HTTP ${response.status})`);
}

/**
 * Trusted-server primitive. At `awaiting_result`, line_items contain the
 * one-time network token and dynamic CVV. Use them only in your server-side
 * processor and never serialize them to the browser. Before use, durably claim
 * txn_ref_id and establish the processor idempotency key described above.
 */
export async function fetchPravaPaymentResult(
  sessionId: string
): Promise<PaymentResultResponse> {
  const response = await fetch(
    `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`,
    {
      headers: { 'Authorization': `Bearer ${requireSecretKey()}` },
      cache: 'no-store',
    }
  );

  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<PaymentResultResponse>;
}

/** Report the real processor outcome for an actionable transaction line item. */
export async function reportPravaPaymentStatus(
  sessionId: string,
  input: ReportPaymentStatusInput
): Promise<ReportPaymentStatusResponse> {
  if (input.productStatuses?.some((product) => !product.productId && !product.productRefId)) {
    throw new Error('Each product status requires productId or productRefId.');
  }
  const response = await fetch(
    `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/report-status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requireSecretKey()}`,
      },
      body: JSON.stringify({
        txn_ref_id: input.txnRefId,
        txn_status: input.txnStatus,
        txn_type: 'PURCHASE',
        ...(input.authorizationCode && { authorization_code: input.authorizationCode }),
        ...(input.responseCode && { response_code: input.responseCode }),
        ...(input.amountPaid && { amount_paid: input.amountPaid }),
        ...(input.productStatuses && {
          product_statuses: input.productStatuses.map((product) => ({
            ...(product.productId && { product_id: product.productId }),
            ...(product.productRefId && { product_ref_id: product.productRefId }),
            status: product.status,
            ...(product.amountPaid && { amount_paid: product.amountPaid }),
          })),
        }),
      }),
    }
  );

  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<ReportPaymentStatusResponse>;
}

/** Trusted-server primitive used after the app authorizes a user cancellation. */
export async function revokePravaSession(sessionId: string): Promise<void> {
  const response = await fetch(
    `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/revoke`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${requireSecretKey()}` },
      cache: 'no-store',
    }
  );
  if (!response.ok) throw await responseError(response);
}

// There is intentionally no browser-facing `/report-status` route. Invoke the
// helper above only from a trusted processor adapter/webhook after validating
// the processor's result; never accept APPROVED/DECLINED from browser JSON.

/** POST /api/prava/create-session */
router.post('/create-session', async (req: Request, res: Response) => {
  try {
    const { checkoutRef, integrationType = 'embedding' } = (req.body ?? {}) as Partial<CreateSessionBody>;
    const user = (req as AuthenticatedRequest).user;
    if (!user?.id || !user.email) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const checkout = checkoutRef ? SERVER_CHECKOUTS.get(checkoutRef) : undefined;
    if (!checkout) return res.status(404).json({ error: 'Checkout not found' });
    if (integrationType !== 'embedding' && integrationType !== 'full_checkout') {
      return res.status(400).json({
        error: 'integrationType must be "embedding" or "full_checkout"',
      });
    }

    const response = await fetch(`${BACKEND_URL}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${requireSecretKey()}`,
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

    if (!response.ok) {
      const error = await responseError(response);
      return res.status(response.status).json({ error: error.message });
    }

    const session = await response.json() as SessionResponse;
    if (!session.session_id || !session.session_token || !session.iframe_url || !session.expires_at) {
      return res.status(502).json({ error: 'Prava returned an invalid session response' });
    }
    rememberSessionOwner(user.id, session);
    return res.json(session);
  } catch (error) {
    console.error('[Prava] Failed to create session:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create Prava session',
    });
  }
});

/** POST /api/prava/cancel-session/:sessionId */
router.post('/cancel-session/:sessionId', async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user?.id) return res.status(401).json({ error: 'Authentication required' });
    if (!ownsSession(user.id, req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await revokePravaSession(req.params.sessionId);
    SESSION_OWNERS.delete(req.params.sessionId);
    return res.json({ success: true });
  } catch (error) {
    console.error('[Prava] Failed to revoke session:', error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to revoke Prava session',
    });
  }
});

/**
 * GET /api/prava/payment-status/:sessionId
 *
 * Browser-safe projection. It reports when credentials are ready but strips
 * transaction rows so network tokens and dynamic CVVs never reach browser code.
 */
router.get('/payment-status/:sessionId', async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user;
    if (!user?.id) return res.status(401).json({ error: 'Authentication required' });
    if (!ownsSession(user.id, req.params.sessionId)) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const data = await fetchPravaPaymentResult(req.params.sessionId);
    const transactions = data.transactions ?? [];
    const credentialReady =
      data.status === 'awaiting_result' &&
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
      data.error ?? transactions.find((transaction) => transaction.error)?.error;

    return res.json({
      session_id: data.session_id,
      order_id: data.order_id,
      status: data.status,
      credential_ready: credentialReady,
      ...(safeError
        ? { error: { code: safeError.code, message: safeError.message } }
        : {}),
      ...(data.shop_pay?.status ? { shop_pay_status: data.shop_pay.status } : {}),
    });
  } catch (error) {
    console.error('[Prava] Failed to get payment status:', error);
    return res.status(502).json({
      error: error instanceof Error ? error.message : 'Failed to get payment status',
    });
  }
});

/** GET /api/prava/health */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    const data = await response.json();
    return res.json({ healthy: response.ok, ...data });
  } catch {
    return res.json({ healthy: false });
  }
});

export default router;
