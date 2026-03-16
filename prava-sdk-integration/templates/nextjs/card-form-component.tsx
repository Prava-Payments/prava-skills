/**
 * PravaCardForm — React Component for Card Enrollment
 *
 * This component handles the complete card enrollment flow:
 * 1. Creates a session via server action
 * 2. Mounts the Prava secure iframe
 * 3. Handles validation, success, and error states
 *
 * Usage:
 *   <PravaCardForm
 *     userId="user_123"
 *     userEmail="user@example.com"
 *     onSuccess={(result) => console.log('Card enrolled:', result)}
 *   />
 *
 * Place this file in: src/components/PravaCardForm.tsx
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PravaSDK } from '@prava-sdk/core';
import type { CollectPANResult, PravaError, CardValidationState } from '@prava-sdk/core';

// Import your server action (adjust path as needed)
import { createPravaSession } from '@/app/actions';

// ── Configuration ─────────────────────────────────────────
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || '';

// ── Props ──────────────────────────────────────────────────

interface PravaCardFormProps {
  /** Your app's user ID */
  userId: string;
  /** User's email */
  userEmail: string;
  /** Transaction amount (default: "99.99") */
  amount?: string;
  /** Currency code (default: "USD") */
  currency?: string;
  /** Called when card is successfully enrolled */
  onSuccess?: (result: CollectPANResult) => void;
  /** Called when an error occurs */
  onError?: (error: PravaError | Error) => void;
  /** Custom class name for the container */
  className?: string;
}

// ── Component ──────────────────────────────────────────────

export default function PravaCardForm({
  userId,
  userEmail,
  amount = '99.99',
  currency = 'USD',
  onSuccess,
  onError,
  className = '',
}: PravaCardFormProps) {
  // Refs
  const sdkRef = useRef<PravaSDK | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // State
  const [loading, setLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<CardValidationState | null>(null);
  const [cardResult, setCardResult] = useState<CollectPANResult | null>(null);

  // ── Start the enrollment flow ─────────────────────────────
  const startEnrollment = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSdkReady(false);
    setValidationState(null);
    setCardResult(null);

    // Clean up any existing SDK instance
    if (sdkRef.current) {
      sdkRef.current.destroy();
      sdkRef.current = null;
    }

    try {
      // 1. Create session via server action
      const session = await createPravaSession({
        userId,
        userEmail,
        amount,
        currency,
      });

      // 2. Initialize PravaSDK
      const sdk = new PravaSDK({ publishableKey: PUBLISHABLE_KEY });
      sdkRef.current = sdk;

      // 3. Mount iframe and collect card
      if (containerRef.current) {
        await sdk.collectPAN({
          sessionToken: session.session_token,
          iframeUrl: session.iframe_url,
          container: containerRef.current,
          onReady: () => {
            setSdkReady(true);
          },
          onChange: (state) => {
            setValidationState(state);
          },
          onSuccess: (result) => {
            setCardResult(result);
            onSuccess?.(result);
          },
          onError: (err) => {
            setError(err.message);
            onError?.(err);
          },
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMsg);
      onError?.(err instanceof Error ? err : new Error(errorMsg));
    } finally {
      setLoading(false);
    }
  }, [userId, userEmail, amount, currency, onSuccess, onError]);

  // ── Auto-start on mount ──────────────────────────────────
  useEffect(() => {
    startEnrollment();

    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, [startEnrollment]);

  // ── Reset and start over ─────────────────────────────────
  const handleReset = () => {
    sdkRef.current?.destroy();
    sdkRef.current = null;
    setCardResult(null);
    startEnrollment();
  };

  // ── Render ────────────────────────────────────────────────

  // Success state
  if (cardResult) {
    return (
      <div className={className}>
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <h3 style={{ color: '#059669', marginBottom: '12px' }}>✓ Card Enrolled Successfully</h3>
          <p>
            {cardResult.brand} •••• {cardResult.last4}
          </p>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Enrollment ID: {cardResult.enrollmentId}
          </p>
          <button
            onClick={handleReset}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              cursor: 'pointer',
            }}
          >
            Enroll Another Card
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
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
          ⚠ {error}
        </div>
      )}

      {/* Loading indicator */}
      {loading && !sdkReady && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
          Loading secure card form…
        </div>
      )}

      {/* Validation state */}
      {validationState && (
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '12px',
          fontSize: '13px',
        }}>
          <span style={{ color: validationState.cardNumber.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.cardNumber.isValid ? '✓' : '○'} Card
          </span>
          <span style={{ color: validationState.expiry.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.expiry.isValid ? '✓' : '○'} Expiry
          </span>
          <span style={{ color: validationState.cvv.isValid ? '#059669' : '#9ca3af' }}>
            {validationState.cvv.isValid ? '✓' : '○'} CVV
          </span>
        </div>
      )}

      {/* SDK container — the iframe mounts here */}
      <div
        ref={containerRef}
        id="prava-card-form"
        style={{
          minHeight: '400px',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}
