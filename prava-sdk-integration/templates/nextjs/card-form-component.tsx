/**
 * PravaCardForm — React Component for Secure Card Collection
 *
 * This component mounts the Prava PCI-compliant iframe for card enrollment.
 * It accepts a PRE-CREATED session as a prop — the parent is responsible for
 * creating the session (so both iframe and polling use the same session_id).
 *
 * Usage:
 *   // Parent creates session first:
 *   const session = await createPravaSession({ userId, userEmail, amount });
 *
 *   // Then passes it to this component:
 *   <PravaCardForm
 *     session={session}
 *     onError={(err) => console.error(err)}
 *   />
 *
 *   // Parent polls for result using session.session_id
 *
 * Place this file in: src/components/PravaCardForm.tsx
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PravaSDK } from '@prava-sdk/core';
import type { PravaError, CardValidationState } from '@prava-sdk/core';

// ── Configuration ─────────────────────────────────────────
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || '';

// ── Props ──────────────────────────────────────────────────

interface PravaCardFormProps {
  /** Pre-created session from the server action */
  session: {
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  };
  /** Called when an error occurs */
  onError?: (error: PravaError | Error) => void;
}

// ── Component ──────────────────────────────────────────────

export default function PravaCardForm({ session, onError }: PravaCardFormProps) {
  const sdkRef = useRef<PravaSDK | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Guard for React Strict Mode double-mount.
  // In dev, React mounts → unmounts → remounts. Without this guard,
  // the SDK gets destroyed on the first cleanup and never re-initializes.
  const hasStarted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<CardValidationState | null>(null);

  const mountSdk = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSdkReady(false);

    // Clean up any existing SDK instance
    if (sdkRef.current) {
      sdkRef.current.destroy();
      sdkRef.current = null;
    }

    try {
      const sdk = new PravaSDK({ publishableKey: PUBLISHABLE_KEY });
      sdkRef.current = sdk;

      if (containerRef.current) {
        await sdk.collectPAN({
          sessionToken: session.session_token,
          iframeUrl: session.iframe_url,
          container: containerRef.current,
          onReady: () => {
            setSdkReady(true);
            setLoading(false);
          },
          onChange: (state: CardValidationState) => setValidationState(state),
          onSuccess: () => {}, // Completion handled by parent via polling
          onError: (err: PravaError) => {
            setError(err.message);
            onError?.(err);
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      setLoading(false);
    }
  }, [session, onError]);

  // Mount SDK on first render (handles React Strict Mode double-mount)
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      mountSdk();
    }
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
      hasStarted.current = false; // Allow re-init on next mount (Strict Mode)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback: detect iframe in container if onReady doesn't fire.
  // In some cases the SDK's onReady callback doesn't trigger — this
  // MutationObserver catches the iframe appearing in the DOM.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sdkReady) return;

    const hideLoading = () => {
      setSdkReady(true);
      setLoading(false);
    };

    const observer = new MutationObserver(() => {
      if (container.querySelector('iframe')) hideLoading();
    });
    observer.observe(container, { childList: true, subtree: true });

    // Hard fallback — hide loading after 5s regardless
    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [sdkReady]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      {/* Error banner */}
      {error && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '14px',
        }}>
          <p style={{ fontWeight: 500 }}>Error</p>
          <p style={{ marginTop: '2px' }}>{error}</p>
          <button onClick={mountSdk} style={{
            marginTop: '8px', fontSize: '14px', fontWeight: 500,
            color: '#dc2626', textDecoration: 'underline', cursor: 'pointer',
            background: 'none', border: 'none', padding: 0,
          }}>
            Try Again
          </button>
        </div>
      )}

      {/* Loading indicator */}
      {loading && !sdkReady && !error && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
          Loading secure card form…
        </div>
      )}

      {/* Validation state */}
      {validationState && sdkReady && (
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '12px', fontWeight: 500 }}>
          <span style={{ color: validationState.cardNumber.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.cardNumber.isValid ? '✓' : '○'} Card Number
          </span>
          <span style={{ color: validationState.expiry.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.expiry.isValid ? '✓' : '○'} Expiry
          </span>
          <span style={{ color: validationState.cvv.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.cvv.isValid ? '✓' : '○'} CVV
          </span>
          {validationState.isComplete && (
            <span style={{ marginLeft: 'auto', color: '#059669', fontWeight: 600 }}>All fields valid ✓</span>
          )}
        </div>
      )}

      {/* SDK container — the iframe mounts here */}
      <div
        ref={containerRef}
        id="prava-card-form"
        style={{ minHeight: '400px', borderRadius: '12px', overflow: 'hidden' }}
      />
    </div>
  );
}
