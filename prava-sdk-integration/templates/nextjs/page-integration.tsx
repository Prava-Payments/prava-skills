/**
 * Prava Checkout Page — State Machine Template
 *
 * PURPOSE: This template demonstrates the FLOW LOGIC for a complete Prava checkout.
 * It is NOT a ready-to-use page — adapt all rendering to the user's existing
 * design system, layout, and component patterns.
 *
 * STATE MACHINE:
 *   idle → loading → (card-entry + polling) → awaiting-result → completed | failed
 *
 * CRITICAL LOGIC (do not change):
 *   - Session created ONCE in parent, shared by iframe + polling (prevents duplicate-session bug)
 *   - Browser polling uses session_id (not session_token); the authenticated
 *     server action uses MERCHANT_SECRET_KEY and returns no payment credentials
 *   - Polling interval: 3s, with cleanup on unmount
 *   - For embed: PravaCardForm mounts iframe; for newtab: window.open(iframe_url)
 *
 * ADAPT:
 *   - All rendering → user's design system (components, styling, layout)
 *   - Where this lives → user's existing checkout page, settings page, or wherever it fits
 *   - Server auth adapter → user's authentication system
 *   - checkoutRef resolution → trusted server-side cart/order service
 *
 * Place this in: wherever the checkout or card enrollment flow lives in the user's app
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PravaCardForm from '@/components/PravaCardForm';
import {
  createPravaSession,
  pollPaymentStatus,
  revokePravaSession,
} from '@/app/actions';
import type { SessionResponse, PaymentStatusResponse } from '@/app/actions';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 300;
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

// ── Flow State ─────────────────────────────────────────────
// The checkout flow is a simple state machine:
//
//   IDLE          → User hasn't started yet. Show a "Pay" button or trigger.
//   LOADING       → Session is being created on the server.
//   CARD_ENTRY    → Session created. Iframe is mounted (embed) or opened (newtab).
//                   Simultaneously polling for payment result.
//   AWAITING      → One-time credential is ready on the SERVER. The trusted
//                   server-side payment worker must charge it and report status.
//   COMPLETED     → The processor outcome was reported as APPROVED.
//   FAILED        → Payment failed. Show error, allow retry.

export default function CheckoutPage() {
  // ── State ──────────────────────────────────────────────────
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusResponse | null>(null);
  const [integrationType, setIntegrationType] = useState<'embedding' | 'full_checkout'>('embedding');

  // Polling
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRunRef = useRef(0);
  const hostedCheckoutWindowRef = useRef<Window | null>(null);

  // Derived state
  const isCompleted = paymentStatus?.status === 'completed';
  const isFailed = paymentStatus?.status === 'failed';
  const isTerminal = isCompleted || isFailed;
  const isIdle = !session && !paymentStatus && !loading;
  const isCardEntry = !!session && !isTerminal;
  const isAwaitingResult = paymentStatus?.status === 'awaiting_result';

  // ── Start Checkout ─────────────────────────────────────────
  // Call this when the user clicks "Pay" or when the AI agent triggers a purchase.

  const handleCheckout = async (
    mode: 'embedding' | 'full_checkout' = 'embedding'
  ) => {
    // Open hosted checkout synchronously from the click so popup blockers do not
    // reject it after the create-session network request finishes.
    let checkoutWindow: Window | null = null;
    if (mode === 'full_checkout') {
      checkoutWindow = window.open('about:blank', '_blank');
      if (!checkoutWindow) {
        setError('Allow popups to open secure checkout.');
        return; // Do not create an orphaned server session when the popup is blocked.
      }
      checkoutWindow.opener = null;
      hostedCheckoutWindowRef.current = checkoutWindow;
    }

    setLoading(true);
    setError(null);
    setPaymentStatus(null);
    setIntegrationType(mode);

    let createdSession: SessionResponse | null = null;
    try {
      // The browser supplies only an opaque checkout reference and presentation mode.
      // The server authenticates the user and resolves all authoritative order fields.
      const s = await createPravaSession({
        checkoutRef: 'demo-purchase',  // ← Replace: server-owned cart/order reference
        integrationType: mode,
      });
      createdSession = s;

      // Full checkout must navigate to the backend-provided iframe_url verbatim.
      if (mode === 'full_checkout') {
        checkoutWindow!.location.replace(s.iframe_url);
      }

      setSession(s);
      // Start polling immediately — it runs in parallel with the iframe.
      startPolling(s.session_id);

    } catch (err) {
      checkoutWindow?.close();
      if (hostedCheckoutWindowRef.current === checkoutWindow) {
        hostedCheckoutWindowRef.current = null;
      }
      // If navigation failed after creation, revoke the otherwise-orphaned flow.
      if (createdSession) {
        await revokePravaSession(createdSession.session_id).catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  // ── Polling Logic ──────────────────────────────────────────
  // Polls GET /v1/sessions/{session_id}/payment-result every 3s.
  // `pending` and `processing` keep polling. `awaiting_result` means the
  // credential is ready for a trusted SERVER worker; keep polling while that
  // worker charges it and calls reportPaymentStatus. Stop only at a terminal
  // `completed` or `failed` response.

  const stopPolling = useCallback(() => {
    pollingRunRef.current += 1;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    setPolling(false);
  }, []);

  const startPolling = (sessionId: string) => {
    const pollingRun = ++pollingRunRef.current;
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let attempts = 0;
    let consecutiveErrors = 0;
    setPolling(true);

    const doPoll = async () => {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS || Date.now() >= deadline) {
        if (pollingRun === pollingRunRef.current) {
          setError('Timed out waiting for payment status. Start a new checkout session.');
          stopPolling();
        }
        return;
      }

      try {
        const result = await pollPaymentStatus(sessionId);
        if (pollingRun !== pollingRunRef.current) return;
        consecutiveErrors = 0;
        setPaymentStatus(result);

        if (result.status === 'completed' || result.status === 'failed') {
          stopPolling();
          return;
        }
        // pending | processing | awaiting_result → keep polling
      } catch (err) {
        if (pollingRun !== pollingRunRef.current) return;
        consecutiveErrors += 1;
        if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
          setError(err instanceof Error ? err.message : 'Unable to refresh payment status.');
          stopPolling();
          return;
        }
      }

      if (pollingRun === pollingRunRef.current) {
        pollingRef.current = setTimeout(doPoll, POLL_INTERVAL_MS);
      }
    };

    // Poll immediately, then schedule the next non-overlapping request.
    void doPoll();
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRunRef.current += 1;
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, []);

  // ── Reset ──────────────────────────────────────────────────

  const resetLocalCheckout = useCallback(() => {
    stopPolling();
    // A completed hosted tab may have redirected to a merchant page. Drop our
    // reference without closing that unrelated destination.
    hostedCheckoutWindowRef.current = null;
    setSession(null);
    setPaymentStatus(null);
    setError(null);
  }, [stopPolling]);

  const handleCancel = async () => {
    if (!session || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      // Revoke on the authenticated server before presenting a fresh attempt.
      await revokePravaSession(session.session_id);
      hostedCheckoutWindowRef.current?.close();
      resetLocalCheckout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel checkout.');
    } finally {
      setCancelling(false);
    }
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
  //   COMPLETED  → Confirmed success message (credentials stay server-side)
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
        <button onClick={() => handleCheckout('embedding')} disabled={loading}>
          {loading ? 'Creating session…' : 'Pay'}
        </button>
      )}

      {/* For a hosted/new-tab flow, call handleCheckout('full_checkout') instead. */}

      {/* STATE: CARD_ENTRY — Iframe is mounted, polling is running */}
      {/* ADAPT: Wrap in your page layout, card container, modal, etc. */}
      {isCardEntry && session && (
        <div>
          {/* The card form component — mounts the Prava iframe */}
          {integrationType === 'embedding' && (
            <PravaCardForm
              session={session}
              onError={(err) => setError(err.message)}
              onDismiss={resetLocalCheckout}
            />
          )}

          {integrationType === 'full_checkout' && (
            <p>Complete payment in the secure Prava tab.</p>
          )}

          {/* ADAPT: Polling indicator — show however fits your UX */}
          {polling && <p>Waiting for payment completion…</p>}

          {isAwaitingResult && paymentStatus?.credential_ready && (
            <p>
              Payment credential is ready on the server. Your server-side payment
              worker must durably claim it, use an idempotent processor operation,
              and report APPROVED or DECLINED to Prava.
            </p>
          )}

          {/* ADAPT: Cancel/back option */}
          <button onClick={handleCancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </button>
        </div>
      )}

      {/* STATE: COMPLETED — APPROVED outcome was confirmed with Prava. */}
      {/* ADAPT: Show success or navigate to a confirmation page. */}
      {isCompleted && (
        <div>
          <h2>Payment Complete</h2>
          <p>The approved processor outcome was confirmed.</p>
          <button onClick={resetLocalCheckout}>New Checkout</button>
        </div>
      )}

      {/* STATE: FAILED — Payment failed */}
      {/* ADAPT: Show error in your app's style with retry option */}
      {isFailed && (
        <div>
          <h2>Payment Failed</h2>
          <p>{paymentStatus?.error?.message || 'Unknown error'}</p>
          <button onClick={resetLocalCheckout}>Try Again</button>
        </div>
      )}
    </div>
  );
}
