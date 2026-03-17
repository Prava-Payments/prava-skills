# Prava Integration Guide

> **Prava** is the payment stack for AI agents. It lets your AI app accept card payments without ever touching raw card data. Cards are tokenized with Visa, stored in a PCI-compliant vault, and every transaction is protected by passkeys (biometric authentication). After payment, Prava generates a one-time payment credential your agent can use to transact on the user's behalf.

---

## 1. Install the SDK

```bash
npm install @prava-sdk/core
```

---

## 2. Configure Your Keys

You'll receive three credentials when your merchant account is created:

| Credential | Format | Where to Use |
|---|---|---|
| **Secret Key** | `sk_test_xxx` / `sk_live_xxx` | Server-side **ONLY** — never expose to the client |
| **Publishable Key** | `pk_test_xxx` / `pk_live_xxx` | Client-side — safe for the browser |
| **Backend URL** | `https://sandbox.api.prava.space` | API base URL (sandbox shown) |

Add them to your environment (`.env` / `.env.local`):

```env
MERCHANT_SECRET_KEY=sk_test_your_secret_key          # Server-side ONLY
NEXT_PUBLIC_PUBLISHABLE_KEY=pk_test_your_pub_key      # Client-side safe
NEXT_PUBLIC_BACKEND_URL=https://sandbox.api.prava.space
```

> ⚠️ **Never expose `MERCHANT_SECRET_KEY` in client-side code or environment variables prefixed with `NEXT_PUBLIC_`, `VITE_`, or `REACT_APP_`.**

---

## 3. Server-Side: Create a Session

Every flow starts by creating a session from your server. This is where the secret key is used.

```typescript
// Server-side (e.g., Next.js server action, Express route)
const response = await fetch(`${process.env.BACKEND_URL}/v1/sessions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.MERCHANT_SECRET_KEY}`,
  },
  body: JSON.stringify({
    user_id: 'user_123',
    user_email: 'user@example.com',
    amount: '49.99',
    currency: 'USD',
    description: 'AI-assisted purchase',
    purchase_context: [{
      merchant_details: {
        name: 'My AI App',
        url: 'https://myaiapp.com',
        country_code_iso2: 'US',
        category_code: '5734',          // Optional: MCC code
        category: 'Software Services',  // Optional: human-readable
      },
      product_details: [{
        description: 'Premium Plan — Monthly',
        amount: '49.99',
        quantity: 1,
      }],
      effective_until_minutes: 15,  // Optional: defaults to 15
    }],
  }),
});

const session = await response.json();
// session → { session_id, session_token, iframe_url, order_id, expires_at }
```

| Response Field | Description |
|---|---|
| `session_id` | Unique session identifier — **used for polling payment result** |
| `session_token` | JWT token — passed to the frontend SDK |
| `iframe_url` | URL for the PCI-compliant card form |
| `order_id` | Unique order identifier for tracking |
| `expires_at` | ISO 8601 timestamp when the session expires (~15 min) |

Pass `session_token` and `iframe_url` to your frontend. Store `session_id` on your server for polling.

---

## 4. Frontend: Collect the Card

Choose one of two approaches:

### Option A — Embedded Iframe (richer UX)

Mount Prava's secure iframe directly in your page. You get real-time validation and event callbacks.

```typescript
import { PravaSDK } from '@prava-sdk/core';

const prava = new PravaSDK({
  publishableKey: 'pk_test_your_pub_key',
});

await prava.collectPAN({
  sessionToken: session.session_token,
  iframeUrl: session.iframe_url,
  container: '#card-form',   // CSS selector or DOM element
  onReady:   ()       => console.log('Iframe loaded'),
  onChange:  (state)   => console.log('Validation:', state.isComplete),
  onSuccess: (result)  => {
    // Card enrolled! 🎉
    console.log(result.enrollmentId, result.brand, result.last4);
  },
  onError:   (error)   => console.error(error.code, error.message),
});
```

```html
<!-- In your HTML / JSX -->
<div id="card-form"></div>
```

> Call `prava.destroy()` on component unmount to clean up.

### Option B — Redirect / New Tab (simpler)

Just open the iframe URL in a new tab. The URL already contains the session token.

```typescript
window.open(session.iframe_url, '_blank');
```

The user completes the card flow in the new tab.

---

## 5. First-Time Flow (Card Enrollment)

When a user connects their card for the first time:

```
Your Server ──POST /v1/sessions──▶ Prava API
                                      │
              session_id    ◀─────────┘
              session_token ◀─────────┘
              iframe_url    ◀─────────┘
                  │
Your Frontend ────▶ Opens iframe (embed or new tab)
                        │
                  User enters card number, expiry, CVV
                  in the secure iframe
                        │
                  Card tokenized with Visa
                  Stored in PCI-compliant vault
                        │
                  User registers a passkey
                  (Face ID / Touch ID / fingerprint)
                        │
                  ✅ Payment processed!
                  → One-time credential generated
```

Your app **never** sees raw card data — it stays entirely within Prava's PCI-compliant iframe.

---

## 6. Repeat Flow (Saved Cards)

When a returning user makes another purchase, the flow is faster — no card re-entry needed:

```
Your Server ──POST /v1/sessions──▶ Prava API  (same API call as first-time)
                  │
Your Frontend ────▶ Opens iframe
                        │
                  Iframe shows saved cards
                  (brand + last 4 digits)
                        │
                  User selects a card
                        │
                  User verifies passkey (biometric)
                        │
                  ✅ Payment processed!
```

The session API call is identical — Prava automatically detects returning users and shows their saved cards.

---

## 7. Getting the Payment Credential

After the user completes payment in the iframe, Prava generates a **one-time payment credential**. This is what your AI agent uses to transact on the user's behalf.

### What's in the credential?

| Field | API Name | Format | Example |
|---|---|---|---|
| Network Token | `token` | 16 digits | `4323126882557932` |
| Expiry Month | `expiry_month` | 2 digits (MM) | `12` |
| Expiry Year | `expiry_year` | 4 digits (YYYY) | `2027` |
| Dynamic CVV | `dynamic_cvv` | 3 digits | `957` |

> The `token` is a **Visa network token** — not the user's real card number. It's issued by Visa specifically for this transaction. The `dynamic_cvv` is single-use and changes every time.

### How to retrieve it: Poll the payment result

After the user completes the flow on the frontend, poll from your **server** using the `session_id` and your **secret key**:

```typescript
// Server-side: Poll for payment completion
async function pollForCredential(sessionId: string): Promise<any> {
  const maxAttempts = 30;
  const interval = 3000; // 3 seconds

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${process.env.BACKEND_URL}/v1/sessions/${sessionId}/payment-result`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.MERCHANT_SECRET_KEY}`,
        },
      }
    );
    const data = await res.json();

    if (data.status === 'completed') {
      // Credential is ready!
      const txn = data.transactions[0];
      return {
        token: txn.token,              // Network token (16 digits)
        dynamic_cvv: txn.dynamic_cvv,  // One-time CVV
        expiry_month: txn.expiry_month,
        expiry_year: txn.expiry_year,
      };
    }

    if (data.status === 'failed') {
      throw new Error(data.transactions[0]?.error?.message || 'Payment failed');
    }

    // status === 'pending' → keep polling
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Polling timed out');
}
```

### Full payment-result response

```json
{
  "session_id": "sess_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "completed",
  "transactions": [
    {
      "txn_id": "txn_01KKW...",
      "status": "completed",
      "token": "4323126882557932",
      "dynamic_cvv": "957",
      "expiry_month": "12",
      "expiry_year": "2027"
    }
  ]
}
```

---

## Quick Reference: Full Flow at a Glance

```
┌─────────── YOUR SERVER ───────────┐
│                                    │
│  1. POST /v1/sessions              │
│     (secret key + user + amount)   │
│         │                          │
│         ▼                          │
│  2. Receive session_id,            │
│     session_token, iframe_url      │
│         │                          │
└─────────┼──────────────────────────┘
          │  Pass token + iframe_url to frontend
          │  Keep session_id on server for polling
          ▼
┌─────────── YOUR FRONTEND ─────────┐
│                                    │
│  3. Embed iframe  OR  open new tab │
│     (publishable key + session)    │
│         │                          │
└─────────┼──────────────────────────┘
          ▼
┌─────────── PRAVA IFRAME ──────────┐
│                                    │
│  First time:                       │
│    4a. User enters card details    │
│    4b. Card tokenized via Visa     │
│    4c. User registers passkey      │
│                                    │
│  Repeat:                           │
│    4a. User picks saved card       │
│    4b. User verifies passkey       │
│                                    │
│  5. Payment processed              │
│     One-time credential generated  │
│         │                          │
└─────────┼──────────────────────────┘
          ▼
┌─────────── YOUR SERVER ───────────┐
│                                    │
│  6. GET /v1/sessions/{id}/         │
│     payment-result                 │
│     (Authorization: secret key)    │
│                                    │
│     → Network token (16 digits)    │
│     → Expiry (MM / YYYY)          │
│     → Dynamic CVV (3 digits)      │
│                                    │
│  7. AI agent uses credential to    │
│     transact on user's behalf      │
│                                    │
└────────────────────────────────────┘
```

---

## Sandbox Testing

| Item | Value |
|---|---|
| **Backend URL** | `https://sandbox.api.prava.space` |
| **Secret Key** | Starts with `sk_test_` |
| **Publishable Key** | Starts with `pk_test_` |
| **Test Cards** | Provided by the Prava team during onboarding |
| **Health Check** | `curl https://sandbox.api.prava.space/health` |

> Passkeys require a browser with **WebAuthn support** (Chrome 80+, Safari 14+, Firefox 80+, Edge 80+) and biometric hardware (Face ID, Touch ID, or fingerprint reader).

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `401 Invalid API key` | Check your secret key starts with `sk_test_` / `sk_live_` and is in the `Authorization: Bearer` header |
| Iframe not loading | Verify `iframe_url` from session response; check browser console for errors |
| Passkey prompt missing | Ensure HTTPS (or localhost) + supported browser + biometric hardware |
| Session expired | Sessions last ~15 min. Create a fresh one |
| `publishableKey must start with "pk_"` | You're accidentally using the secret key on the frontend |
| Polling returns `pending` forever | Ensure you're polling with `session_id` (not `session_token`) and using the secret key |

---

*For full API details, see the [SDK API Reference](prava-sdk-integration/references/sdk-api-reference.md) and [Session API Reference](prava-sdk-integration/references/session-api-reference.md).*
