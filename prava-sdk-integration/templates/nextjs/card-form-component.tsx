/**
 * PravaCardForm — React Component for Secure Card Collection
 *
 * PURPOSE: This template demonstrates the LOGIC for mounting the Prava SDK iframe.
 * It is NOT a ready-to-use UI component — adapt all rendering to the user's
 * existing design system, component library, and code patterns.
 *
 * CRITICAL LOGIC (do not change):
 *   - hasStarted ref for React Strict Mode double-mount handling
 *   - MutationObserver + timeout fallback for onReady detection
 *   - SDK cleanup on unmount
 *   - Session passed as prop (NOT created internally) to avoid duplicate-session bug
 *
 * ADAPT:
 *   - All rendering (loading, error, validation indicators) → user's design system
 *   - CSS/styling approach → match user's project (Tailwind, CSS modules, styled-components, etc.)
 *   - Component patterns → match user's existing component structure
 *
 * Usage:
 *   // Parent creates session first:
 *   const session = await createPravaSession({ userId, userEmail, totalAmount });
 *   // Then passes it to this component:
 *   <PravaCardForm session={session} onError={(err) => console.error(err)} />
 *   // Parent polls for result using session.session_id
 *
 * Place this file in: src/components/PravaCardForm.tsx (or wherever components live)
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PravaSDK } from '@prava-sdk/core';
import type { PravaError, CardValidationState } from '@prava-sdk/core';

// ── Configuration ─────────────────────────────────────────
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || '';

// ── Props ──────────────────────────────────────────────────

interface PravaCardFormProps {
  /** Pre-created session from the server action — do NOT create a session inside this component */
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

  // ⚠️ CRITICAL: Guard for React Strict Mode double-mount.
  // In dev, React 18 mounts → unmounts → remounts. Without this guard,
  // the SDK gets destroyed on the first cleanup and never re-initializes.
  // The key is resetting hasStarted to false in cleanup so the remount works.
  const hasStarted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<CardValidationState | null>(null);

  const mountSdk = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSdkReady(false);

    // Clean up any existing SDK instance before re-mounting
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
          onSuccess: () => {
            // Payment completion is handled by the PARENT via polling.
            // Do NOT add payment-result logic here — the parent polls using session_id.
          },
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

  // ⚠️ CRITICAL: Mount SDK on first render with Strict Mode handling
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      mountSdk();
    }
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
      hasStarted.current = false; // ← Reset so remount (Strict Mode) re-initializes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚠️ CRITICAL: Fallback for onReady not firing.
  // The SDK's onReady callback sometimes doesn't trigger. This MutationObserver
  // detects when the iframe appears in the DOM, plus a 5s hard timeout.
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

    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [sdkReady]);

  // ── Render ────────────────────────────────────────────────
  //
  // ADAPT EVERYTHING BELOW to the user's design system.
  // The logic above is what matters — the rendering is just a reference.
  //
  // States to handle:
  //   1. loading && !sdkReady && !error  → Show a loading indicator
  //   2. error                           → Show an error message + retry button
  //   3. sdkReady && validationState     → Optionally show field validation indicators
  //   4. The container div               → Always render this (iframe mounts here)

  return (
    <div>
      {/* ADAPT: Error state — use your app's error/alert component */}
      {error && (
        <div role="alert">
          <p>Error: {error}</p>
          <button onClick={mountSdk}>Try Again</button>
        </div>
      )}

      {/* ADAPT: Loading state — use your app's spinner/skeleton/loading component */}
      {loading && !sdkReady && !error && (
        <div>Loading secure card form…</div>
      )}

      {/* ADAPT: Validation indicators — optional, show if your UX benefits from it */}
      {validationState && sdkReady && (
        <div>
          <span>{validationState.cardNumber.isValid ? '✓' : '○'} Card Number</span>
          <span>{validationState.expiry.isValid ? '✓' : '○'} Expiry</span>
          <span>{validationState.cvv.isValid ? '✓' : '○'} CVV</span>
          {validationState.isComplete && <span>All fields valid ✓</span>}
        </div>
      )}

      {/* ⚠️ REQUIRED: This div is where the iframe mounts. Always render it.
          Give it enough height (min ~400px) and overflow:hidden for the iframe. */}
      <div
        ref={containerRef}
        id="prava-card-form"
        style={{ minHeight: '400px', overflow: 'hidden' }}
      />
    </div>
  );
}
