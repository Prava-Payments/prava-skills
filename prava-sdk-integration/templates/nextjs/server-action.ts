/**
 * Prava Session Server Action — Next.js App Router
 *
 * This server action creates a Prava session by calling the Prava backend.
 * It uses the MERCHANT_SECRET_KEY which is ONLY available server-side.
 *
 * Usage:
 *   import { createPravaSession } from '@/app/actions';  // or wherever you place this
 *   const session = await createPravaSession({ userId: 'user_123', userEmail: 'user@example.com' });
 *
 * Place this file in: src/app/actions.ts (or src/lib/prava.ts)
 */
'use server';

// ── Configuration ─────────────────────────────────────────
// These come from your .env.local file
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://sandbox.api.prava.space';
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

export interface PaymentTransaction {
  txn_id: string;
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
  line_items: PaymentLineItem[];
  error?: { code: string; message: string };
}

export interface PaymentResultResponse {
  session_id: string;
  order_id: string | null;
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
  transactions: PaymentTransaction[];
}

interface CreateSessionParams {
  /** Your app's unique user identifier */
  userId: string;
  /** User's email address */
  userEmail: string;
  /** Transaction total amount (e.g., "99.99") */
  totalAmount?: string;
  /** Currency code (ISO 4217, e.g., "USD") */
  currency?: string;
  /** Order description */
  description?: string;
  /** HTTPS redirect URL after payment completion */
  callbackUrl?: string;
  /** Custom purchase context (optional — defaults provided) */
  purchaseContext?: Array<{
    merchant_details: {
      name: string;
      url: string;
      country_code_iso2: string;
      category_code?: string;
      category?: string;
    };
    product_details: Array<{
      description: string;
      unit_price: string;
      quantity?: number;
    }>;
    effective_until_minutes?: number;
  }>;
}

// ── Server Action ──────────────────────────────────────────

/**
 * Creates a Prava session for card enrollment / payment.
 *
 * This runs on the server — the secret key never reaches the browser.
 * Returns session_token + iframe_url that the frontend needs.
 */
export async function createPravaSession({
  userId,
  userEmail,
  totalAmount = '99.99',
  currency = 'USD',
  description,
  callbackUrl,
  purchaseContext,
}: CreateSessionParams): Promise<SessionResponse> {
  // Validate secret key is configured
  if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
    throw new Error(
      'MERCHANT_SECRET_KEY not configured. Add it to .env.local:\n' +
      'MERCHANT_SECRET_KEY=sk_test_your_key_here'
    );
  }

  // Call Prava backend to create session
  const res = await fetch(`${BACKEND_URL}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      user_email: userEmail,
      total_amount: totalAmount,
      currency,
      description: description || 'Purchase',
      ...(callbackUrl && { callback_url: callbackUrl }),
      purchase_context: purchaseContext || [
        {
          merchant_details: {
            name: 'My AI App',                  // ← Replace with your app name
            url: 'https://myapp.com',           // ← Replace with your URL
            country_code_iso2: 'US',            // ← Replace with your country
            category_code: '5734',
            category: 'Software Services',
          },
          product_details: [
            {
              description: 'Purchase',
              unit_price: totalAmount,
              quantity: 1,
            },
          ],
          effective_until_minutes: 15,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to create session (HTTP ${res.status})`);
  }

  return res.json();
}

/**
 * Polls for the payment result after the user completes the card flow.
 *
 * Use session_id (NOT session_token) and authenticate with your secret key.
 * Returns the network token + dynamic CVV when status is "completed".
 *
 * Usage:
 *   const result = await pollPaymentResult(session.session_id);
 *   // result.transactions[0].line_items[0].token → Visa network token
 *   // result.transactions[0].line_items[0].dynamic_cvv → one-time CVV
 */
export async function pollPaymentResult(sessionId: string): Promise<PaymentResultResponse> {
  if (!MERCHANT_SECRET_KEY) {
    throw new Error('MERCHANT_SECRET_KEY not configured.');
  }

  // Cache-buster: Next.js can aggressively cache/deduplicate identical fetches.
  // Adding ?_t=timestamp + cache: 'no-store' + next: { revalidate: 0 } prevents stale responses.
  const res = await fetch(
    `${BACKEND_URL}/v1/sessions/${sessionId}/payment-result?_t=${Date.now()}`,
    {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${MERCHANT_SECRET_KEY}` },
      cache: 'no-store',
      next: { revalidate: 0 },
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
