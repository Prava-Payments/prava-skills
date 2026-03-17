/**
 * Example Page Integration — Next.js App Router
 *
 * Shows the CORRECT pattern: parent creates session once, then:
 *   - Passes session to PravaCardForm (for iframe)
 *   - Uses session.session_id to poll for payment result
 *
 * This avoids the duplicate-session bug where iframe and polling
 * use different sessions.
 *
 * Place this in: src/app/checkout/page.tsx (or any page)
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PravaCardForm from '@/components/PravaCardForm';
import { createPravaSession, pollPaymentResult } from '@/app/actions';
import type { SessionResponse, PaymentResultResponse, PaymentTransaction } from '@/app/actions';

type Approach = 'embed' | 'newtab';

export default function CheckoutPage() {
  const [approach, setApproach] = useState<Approach>('embed');
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResultResponse | null>(null);

  // Polling
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const started = !!session;

  // ── Start checkout ─────────────────────────────────────────

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    setPaymentResult(null);

    try {
      // 1. Create session ONCE — same session for iframe + polling
      const s = await createPravaSession({
        userId: 'user_123',           // ← Replace with actual user ID
        userEmail: 'user@example.com', // ← Replace with actual user email
        amount: '49.99',
        currency: 'USD',
      });
      setSession(s);

      // 2. Start polling for payment result
      startPolling(s.session_id);

      // 3. For new-tab approach, open the iframe URL
      if (approach === 'newtab') {
        window.open(s.iframe_url, '_blank');
      }
      // For embed approach, PravaCardForm will mount the iframe automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  // ── Polling ────────────────────────────────────────────────

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
      } catch {
        // Keep polling on transient errors
      }
    };

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

  const completedTxn: PaymentTransaction | null =
    paymentResult?.status === 'completed' ? paymentResult.transactions[0] ?? null : null;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
        Checkout
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>
        Securely add your card to complete the purchase.
      </p>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 16px', marginBottom: '16px',
          backgroundColor: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '8px', color: '#dc2626', fontSize: '14px',
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Checkout button (before session is created) */}
      {!started && !paymentResult && (
        <button
          onClick={handleCheckout}
          disabled={loading}
          style={{
            width: '100%', padding: '12px 24px',
            backgroundColor: '#4f46e5', color: 'white', border: 'none',
            borderRadius: '10px', fontSize: '15px', fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Creating session…' : 'Pay $49.99'}
        </button>
      )}

      {/* Embedded card form (shown after session is created) */}
      {approach === 'embed' && session && !paymentResult && (
        <div style={{
          background: 'white', borderRadius: '16px', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <PravaCardForm
            session={session}
            onError={(err) => setError(err.message)}
          />
        </div>
      )}

      {/* Polling indicator */}
      {polling && !paymentResult && (
        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '16px', fontSize: '14px' }}>
          Waiting for payment completion…
        </p>
      )}

      {/* Success: show the credential */}
      {completedTxn && (
        <div style={{
          padding: '32px', textAlign: 'center',
          backgroundColor: '#f0fdf4', borderRadius: '16px',
          border: '1px solid #bbf7d0',
        }}>
          <h2 style={{ color: '#059669', fontSize: '20px', marginBottom: '16px' }}>
            ✓ Payment Complete
          </h2>
          <div style={{ fontSize: '14px', color: '#374151' }}>
            <p><strong>Network Token:</strong> {completedTxn.token}</p>
            <p><strong>Dynamic CVV:</strong> {completedTxn.dynamic_cvv}</p>
            <p><strong>Expiry:</strong> {completedTxn.expiry_month}/{completedTxn.expiry_year}</p>
          </div>
          <button
            onClick={handleReset}
            style={{
              marginTop: '16px', padding: '8px 16px',
              borderRadius: '8px', border: '1px solid #d1d5db',
              cursor: 'pointer', background: 'white',
            }}
          >
            Start New Checkout
          </button>
        </div>
      )}

      {/* Failed */}
      {paymentResult?.status === 'failed' && (
        <div style={{
          padding: '24px', backgroundColor: '#fef2f2',
          borderRadius: '16px', border: '1px solid #fecaca',
        }}>
          <h2 style={{ color: '#dc2626', fontSize: '18px' }}>Payment Failed</h2>
          <p style={{ color: '#dc2626', fontSize: '14px' }}>
            {paymentResult.transactions[0]?.error?.message || 'Unknown error'}
          </p>
          <button onClick={handleReset} style={{
            marginTop: '12px', padding: '8px 16px', borderRadius: '8px',
            border: '1px solid #d1d5db', cursor: 'pointer', background: 'white',
          }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
