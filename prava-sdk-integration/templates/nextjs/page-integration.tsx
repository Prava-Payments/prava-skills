/**
 * Prava Checkout Page — State Machine Template
 *
 * PURPOSE: This template demonstrates the FLOW LOGIC for a complete Prava checkout.
 * It is NOT a ready-to-use page — adapt all rendering to the user's existing
 * design system, layout, and component patterns.
 *
 * STATE MACHINE:
 *   idle → loading → (card-entry + polling) → completed | failed
 *
 * CRITICAL LOGIC (do not change):
 *   - Session created ONCE in parent, shared by iframe + polling (prevents duplicate-session bug)
 *   - Polling uses session_id (not session_token) with MERCHANT_SECRET_KEY
 *   - Polling interval: 3s, with cleanup on unmount
 *   - For embed: PravaCardForm mounts iframe; for newtab: window.open(iframe_url)
 *
 * ADAPT:
 *   - All rendering → user's design system (components, styling, layout)
 *   - Where this lives → user's existing checkout page, settings page, or wherever it fits
 *   - User ID / email source → user's auth system (not hardcoded)
 *   - Amount / product info → user's cart, product context, or AI agent context
 *
 * Place this in: wherever the checkout or card enrollment flow lives in the user's app
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PravaCardForm from '@/components/PravaCardForm';
import { createPravaSession, pollPaymentResult } from '@/app/actions';
import type { SessionResponse, PaymentResultResponse, PaymentTransaction } from '@/app/actions';

// ── Flow State ─────────────────────────────────────────────
// The checkout flow is a simple state machine:
//
//   IDLE          → User hasn't started yet. Show a "Pay" button or trigger.
//   LOADING       → Session is being created on the server.
//   CARD_ENTRY    → Session created. Iframe is mounted (embed) or opened (newtab).
//                   Simultaneously polling for payment result.
//   COMPLETED     → Payment succeeded. Credential (token + CVV) is available.
//   FAILED        → Payment failed. Show error, allow retry.

export default function CheckoutPage() {
  // ── State ──────────────────────────────────────────────────
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResultResponse | null>(null);

  // Polling
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Derived state
  const isIdle = !session && !paymentResult && !loading;
  const isCardEntry = !!session && !paymentResult;
  const isCompleted = paymentResult?.status === 'completed';
  const isFailed = paymentResult?.status === 'failed';

  const completedTxn: PaymentTransaction | null =
    isCompleted ? paymentResult.transactions[0] ?? null : null;

  // ── Start Checkout ─────────────────────────────────────────
  // Call this when the user clicks "Pay" or when the AI agent triggers a purchase.

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    setPaymentResult(null);

    try {
      // ADAPT: Get userId and userEmail from your auth system, not hardcoded
      // ADAPT: Get amount/currency from your cart, product, or AI agent context
      const s = await createPravaSession({
        userId: 'user_123',            // ← Replace: from your auth context
        userEmail: 'user@example.com', // ← Replace: from your auth context
        amount: '49.99',               // ← Replace: from your product/cart
        currency: 'USD',               // ← Replace: from your product/cart
      });
      setSession(s);

      // Start polling immediately — it runs in parallel with the iframe
      startPolling(s.session_id);

      // ADAPT: Choose embed or newtab based on your UX needs
      // For newtab approach, uncomment:
      // window.open(s.iframe_url, '_blank');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  // ── Polling Logic ──────────────────────────────────────────
  // Polls GET /v1/sessions/{session_id}/payment-result every 3s.
  // Stops when status is "completed" or "failed".

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = (sessionId: string) => {
    setPolling(true);

    const doPoll = async () => {
      try {
        const result = await pollPaymentResult(sessionId);

        if (result.status === 'completed' || result.status === 'failed') {
          setPaymentResult(result);
          stopPolling();
        }
        // status === 'pending' → keep polling
      } catch {
        // Keep polling on transient errors (network glitches, etc.)
      }
    };

    // Poll immediately, then every 3 seconds
    doPoll();
    pollingRef.current = setInterval(doPoll, 3000);
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // ── Reset ──────────────────────────────────────────────────

  const handleReset = () => {
    stopPolling();
    setSession(null);
    setPaymentResult(null);
    setError(null);
  };

  // ── Render ─────────────────────────────────────────────────
  //
  // ADAPT EVERYTHING BELOW to the user's design system.
  // This rendering is intentionally minimal — it only shows the state transitions.
  //
  // Map each state to the appropriate UI in the user's app:
  //   IDLE       → "Pay" button, product summary, etc.
  //   LOADING    → Loading spinner / skeleton
  //   CARD_ENTRY → PravaCardForm component (iframe) + polling indicator
  //   COMPLETED  → Success message + credential display (or just navigate away)
  //   FAILED     → Error message + retry option

  return (
    <div>
      {/* ADAPT: Error display — use your app's toast, alert, or error component */}
      {error && (
        <div role="alert">
          <p>{error}</p>
        </div>
      )}

      {/* STATE: IDLE — Show checkout trigger */}
      {/* ADAPT: This could be a button, a product card, or triggered by an AI agent */}
      {isIdle && (
        <button onClick={handleCheckout} disabled={loading}>
          {loading ? 'Creating session…' : 'Pay'}
        </button>
      )}

      {/* STATE: CARD_ENTRY — Iframe is mounted, polling is running */}
      {/* ADAPT: Wrap in your page layout, card container, modal, etc. */}
      {isCardEntry && session && (
        <div>
          {/* The card form component — mounts the Prava iframe */}
          <PravaCardForm
            session={session}
            onError={(err) => setError(err.message)}
          />

          {/* ADAPT: Polling indicator — show however fits your UX */}
          {polling && <p>Waiting for payment completion…</p>}

          {/* ADAPT: Cancel/back option */}
          <button onClick={handleReset}>Cancel</button>
        </div>
      )}

      {/* STATE: COMPLETED — Payment succeeded, credential available */}
      {/* ADAPT: Show success in your app's style. You may want to:
          - Display the credential (for testing/debugging)
          - Navigate to a confirmation page
          - Pass the credential to the AI agent
          - Simply show a success message */}
      {isCompleted && completedTxn && (
        <div>
          <h2>Payment Complete</h2>
          <p>Network Token: {completedTxn.token}</p>
          <p>Dynamic CVV: {completedTxn.dynamic_cvv}</p>
          <p>Expiry: {completedTxn.expiry_month}/{completedTxn.expiry_year}</p>
          <button onClick={handleReset}>New Checkout</button>
        </div>
      )}

      {/* STATE: FAILED — Payment failed */}
      {/* ADAPT: Show error in your app's style with retry option */}
      {isFailed && (
        <div>
          <h2>Payment Failed</h2>
          <p>{paymentResult?.transactions[0]?.error?.message || 'Unknown error'}</p>
          <button onClick={handleReset}>Try Again</button>
        </div>
      )}
    </div>
  );
}
