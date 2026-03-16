/**
 * Example Page Integration — Next.js App Router
 *
 * This shows a complete page that uses the PravaCardForm component.
 * Demonstrates both the embedded iframe approach and the new-tab approach.
 *
 * Place this in: src/app/checkout/page.tsx (or any page)
 */
'use client';

import { useState } from 'react';
import type { CollectPANResult } from '@prava-sdk/core';
import PravaCardForm from '@/components/PravaCardForm';
import { createPravaSession } from '@/app/actions';

export default function CheckoutPage() {
  const [enrolledCard, setEnrolledCard] = useState<CollectPANResult | null>(null);

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 600, marginBottom: '8px' }}>
        Checkout
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '32px' }}>
        Securely add your card to complete the purchase.
      </p>

      {/* ── Approach A: Embedded Iframe ──────────────────────── */}
      {!enrolledCard ? (
        <PravaCardForm
          userId="user_123"           // ← Replace with actual user ID
          userEmail="user@example.com" // ← Replace with actual user email
          amount="49.99"
          currency="USD"
          onSuccess={(result) => {
            setEnrolledCard(result);
            console.log('Card enrolled:', result);
          }}
          onError={(error) => {
            console.error('Enrollment failed:', error);
          }}
        />
      ) : (
        <div style={{
          padding: '32px',
          textAlign: 'center',
          backgroundColor: '#f0fdf4',
          borderRadius: '16px',
          border: '1px solid #bbf7d0',
        }}>
          <h2 style={{ color: '#059669', fontSize: '20px', marginBottom: '12px' }}>
            ✓ Payment Complete
          </h2>
          <p style={{ marginBottom: '8px' }}>
            {enrolledCard.brand} •••• {enrolledCard.last4}
          </p>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            Order confirmed. Enrollment: {enrolledCard.enrollmentId.slice(0, 16)}…
          </p>
        </div>
      )}

      {/* ── Approach B: Open in New Tab ──────────────────────── */}
      {/*
        Alternative: Instead of embedding, open the iframe URL in a new tab.
        Uncomment the code below to use this approach instead.

        <NewTabCheckout
          userId="user_123"
          userEmail="user@example.com"
        />
      */}
    </div>
  );
}

/**
 * Alternative approach: Open Prava in a new tab.
 * The user completes the flow there and is redirected back.
 */
function NewTabCheckout({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [loading, setLoading] = useState(false);

  const handleOpenPrava = async () => {
    setLoading(true);
    try {
      const session = await createPravaSession({
        userId,
        userEmail,
        amount: '49.99',
        currency: 'USD',
      });

      // Open the iframe URL in a new tab
      // iframe_url already contains the session token
      window.open(session.iframe_url, '_blank');
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '32px' }}>
      <p style={{ marginBottom: '16px', color: '#6b7280' }}>
        You'll be taken to a secure page to enter your card details.
      </p>
      <button
        onClick={handleOpenPrava}
        disabled={loading}
        style={{
          padding: '12px 32px',
          backgroundColor: '#4f46e5',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: 500,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Starting checkout…' : 'Add Payment Card'}
      </button>
    </div>
  );
}
