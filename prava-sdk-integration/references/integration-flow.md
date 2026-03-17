# Prava Integration Flow

## Overview

Prava is a payment stack for AI agents. It enables AI apps to process card payments without ever seeing raw card details. Cards are tokenized with Visa, stored in a PCI-compliant vault, and protected by passkeys (biometric authentication).

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    AI App (Merchant)                      │
│                                                           │
│  ┌──────────────┐          ┌───────────────────────┐     │
│  │  Your Server  │─── 1 ──→│  Prava Backend API     │     │
│  │  (secret key) │←── 2 ───│  /v1/sessions          │     │
│  └──────────────┘          └───────────────────────┘     │
│         │                                                 │
│         3  session_token + iframe_url                     │
│         ↓                                                 │
│  ┌──────────────┐                                        │
│  │  Your Frontend │                                       │
│  │  (pub key)    │                                        │
│  └──────┬───────┘                                        │
│         │                                                 │
│         4  Opens iframe (embed or new tab)                │
│         ↓                                                 │
│  ┌──────────────────────────────────────────────┐        │
│  │  Prava Secure Iframe (PCI-compliant)          │        │
│  │                                                │        │
│  │  • Card number, expiry, CVV input             │        │
│  │  • Tokenization with Visa                     │        │
│  │  • Passkey registration / verification         │        │
│  │  • Your app NEVER sees raw card data          │        │
│  └──────────────────────────────────────────────┘        │
│         │                                                 │
│         5  PostMessage events OR redirect                 │
│         ↓                                                 │
│  ┌──────────────┐                                        │
│  │  Your Frontend │ ← Success! enrollmentId, last4, brand│
│  └──────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Flow 1: First-Time Card Enrollment (+ Optional Purchase)

This flow is used when a user is connecting their card for the first time.

### Step-by-Step

```
Step 1: AI App (Server)
├── Call POST /v1/sessions with:
│   ├── user_id, user_email
│   ├── amount, currency
│   └── purchase_context (merchant details + products)
├── Receive: session_id, session_token, iframe_url, order_id
└── Pass session_token + iframe_url to frontend

Step 2: AI App (Frontend)
├── Option A: Embed iframe using PravaSDK.collectPAN()
│   └── Mount iframe in a container div
├── Option B: Open iframe_url in a new tab
│   └── window.open(iframe_url)  // iframe_url already contains the session token
└── Wait for user to complete

Step 3: End User (in iframe)
├── Sees secure card form
├── Enters card number, expiry, CVV
├── Card is validated in real-time
└── Submits card details

Step 4: Prava Backend (transparent to AI app)
├── Card data sent to PCI vault (Skyflow)
├── Card tokenized with Visa network
├── Enrolled for VIC (Visa Intelligent Commerce)
└── Passkey registration initiated

Step 5: End User (passkey)
├── Browser prompts for biometric (Face ID / Touch ID / fingerprint)
├── User approves passkey registration
└── Passkey stored for future verifications

Step 6: Completion
├── If buy flow:
│   ├── Payment is processed
│   └── AI App receives payment success
├── If registration only:
│   └── AI App receives enrollment confirmation
├── Embedded: onSuccess callback fires with enrollmentId, last4, brand
└── New tab: User sees success page, redirected back to merchant URL
```

### Key Data at Each Step

| Step | Who | Data |
|------|-----|------|
| Session creation | Your server → Prava | secret_key, user_id, user_email, amount, currency, purchase_context |
| Session response | Prava → Your server | session_id, session_token, iframe_url, order_id, expires_at |
| Frontend init | Your frontend → Iframe | session_token, publishable_key |
| Card submission | User → Iframe → Prava | Raw card data (never touches your app) |
| Success | Iframe → Your frontend | enrollmentId, last4, brand, expMonth, expYear |

---

## Flow 2: Repeat Purchase (Saved Card)

This flow is used when the user already has a card enrolled. No re-onboarding needed.

### Step-by-Step

```
Step 1: AI App (Server)
├── Call POST /v1/sessions (same as first-time)
└── Receive: session_token, iframe_url

Step 2: AI App (Frontend)
├── Open iframe (embed or new tab)
└── Iframe detects user has saved cards

Step 3: End User (in iframe)
├── Sees list of saved cards (brand, last 4 digits)
├── Selects a card
└── No need to re-enter card details!

Step 4: Passkey Verification
├── Browser prompts for biometric
├── User verifies with same passkey from enrollment
└── Verification sent to Prava backend

Step 5: Completion
├── Payment processed using tokenized card
├── AI App receives success
└── Much faster than first-time flow!
```

---

## Flow 3: Registration-Only (No Immediate Purchase)

Sometimes you want to onboard a card without an immediate purchase (e.g., "Connect your card for future AI purchases").

### Difference from Buy Flow

The session is created with the same API, but the session intent indicates registration-only. The user goes through the same card entry and passkey flow, but no payment is charged. The card is stored for future use.

---

## Flow 4: Getting the Payment Credential (Server-Side Polling)

After the user completes the card flow in the iframe, your server polls for the one-time payment credential. This is the network token + dynamic CVV your AI agent uses to transact.

### Step-by-Step

```
Step 1: User completes card flow
├── Embedded: onSuccess callback fires (card enrolled)
├── New tab: user sees success page
└── In both cases, the payment is processing server-side

Step 2: Your Server polls for result
├── GET /v1/sessions/{session_id}/payment-result
├── Auth: Bearer {MERCHANT_SECRET_KEY}  ← secret key, NOT session_token
├── Poll every 3 seconds
└── Check data.status

Step 3: Status transitions
├── "pending"   → Keep polling (payment still processing)
├── "completed" → Credential ready! Extract from transactions[0]
└── "failed"    → Error occurred, check transactions[0].error

Step 4: Extract credential (when status === "completed")
├── token         → Visa network token (16 digits, NOT user's real card)
├── dynamic_cvv   → One-time CVV (3 digits, changes per transaction)
├── expiry_month  → "12" (2-digit MM)
└── expiry_year   → "2027" (4-digit YYYY)

Step 5: AI agent uses credential
├── Network token can be used like a card number
├── Dynamic CVV is the security code
└── Agent transacts on user's behalf at any merchant
```

### Key Data

| Step | Who | Data |
|------|-----|------|
| Poll request | Your server → Prava | `session_id` in URL, `MERCHANT_SECRET_KEY` in Bearer header |
| Poll response (pending) | Prava → Your server | `{ status: "pending", transactions: [] }` |
| Poll response (completed) | Prava → Your server | `{ status: "completed", transactions: [{ token, dynamic_cvv, expiry_month, expiry_year }] }` |
| Poll response (failed) | Prava → Your server | `{ status: "failed", transactions: [{ error: { code, message } }] }` |

### Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Using `session_token` in the URL | Use `session_id` (e.g., `sess_01KKW...`) |
| Using `session_token` as Bearer auth | Use `MERCHANT_SECRET_KEY` (`sk_test_...`) |
| Calling `/v1/sessions/validate` | Use `/v1/sessions/{id}/payment-result` (validate is internal) |
| Expecting 2-digit expiry year | API returns 4-digit year (e.g., `"2027"`) |

---

## Data Flow Diagram (Security)

```
Your AI App                    Prava Infrastructure
──────────                     ────────────────────

Server-side:
  secret_key ──→ POST /v1/sessions ──→ Prava Backend
                                          │
                    session_token ←────────┘
                    iframe_url ←──────────┘

Client-side:
  publishable_key ──→ PravaSDK
  session_token ──→ Iframe URL param
                                          │
  iframe_url ──→ Browser opens page ──→ Prava Iframe
                                          │
                                     Card data entered
                                     (NEVER leaves iframe)
                                          │
                                     Tokenized via Visa
                                     Stored in PCI vault
                                          │
  enrollmentId ←──── PostMessage ←────────┘
  last4, brand ←──── (or redirect)
```

**Security boundaries:**
- 🔒 Raw card data NEVER crosses the iframe boundary
- 🔒 Secret key NEVER leaves your server
- 🔒 Publishable key is safe for client-side (read-only access)
- 🔒 Session tokens are time-limited and single-use
- 🔒 Passkeys provide cryptographic proof of user intent

---

## Integration Patterns

### Pattern 1: Next.js App Router (Recommended for React apps)

```
page.tsx (client component)
  └── calls server action
        └── actions.ts (server action, uses secret key)
              └── POST /v1/sessions
        └── returns session data to page
  └── mounts PravaSDK with session_token + iframe_url
  └── renders <div id="card-form" /> container
  └── handles onSuccess callback
```

### Pattern 2: Express + React SPA

```
React SPA (frontend)
  └── calls /api/create-session on your Express server
        └── Express route (uses secret key)
              └── POST /v1/sessions
        └── returns session data
  └── mounts PravaSDK with session_token + iframe_url
```

### Pattern 3: Any Backend + New Tab

```
Your backend (any language)
  └── POST /v1/sessions (using secret key)
  └── returns iframe_url + session_token to frontend

Your frontend
  └── window.open(iframe_url)  // iframe_url already contains the session token
  └── user completes flow in new tab
  └── user redirected back to your URL
```
