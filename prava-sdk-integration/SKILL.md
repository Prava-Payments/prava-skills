---
name: prava-sdk-integration
version: 1.0.0

description: Payment stack for AI agents — securely collect cards via PCI-compliant iframe, tokenize with Visa, protect transactions with passkeys (biometrics), and retrieve one-time payment credentials (network token + dynamic CVV) for agent-initiated purchases. No card details ever exposed to the AI.
homepage: https://prava.space
author: Prava Payments
user-invocable: true
metadata: {"openclaw":{"emoji":"💳","category":"payments","primaryEnv":"MERCHANT_SECRET_KEY","requires":{"env":["MERCHANT_SECRET_KEY","PUBLISHABLE_KEY"],"npm":["@prava-sdk/core"]}}}
tags:
  - payments
  - ai-agents
  - card-enrollment
  - pci-compliant
  - passkey
  - visa
  - tokenization
---

```
PRAVA SDK QUICK REFERENCE v1.0.0
Package:  @prava-sdk/core
Sandbox:  https://sandbox.api.prava.space
Prod:     https://api.prava.space
Auth:     Authorization: Bearer <MERCHANT_SECRET_KEY>  (server-side ONLY)
Frontend: PravaSDK({ publishableKey: "pk_test_xxx" })  (client-side safe)
Docs:     This file is canonical — skills guide + API ref + templates

Capabilities: card enrollment + Visa tokenization + passkey (biometric) auth + one-time payment credentials (network token + dynamic CVV) for AI agent purchases

Session lifecycle (server-side, secret key):
  POST /v1/sessions                          → create session → returns session_id, session_token, iframe_url, order_id, expires_at
  GET  /v1/sessions/{session_id}/payment-result → poll for credential → returns token (16-digit Visa network token), dynamic_cvv, expiry_month, expiry_year
  POST /v1/sessions/{session_id}/revoke      → revoke active session
  GET  /health                               → backend health check

Frontend SDK (publishable key):
  new PravaSDK({ publishableKey })           → create SDK instance
  prava.collectPAN({ sessionToken, iframeUrl, container, onReady, onChange, onSuccess, onError }) → mount secure iframe
  prava.destroy()                            → cleanup iframe + listeners

Session request shape (POST /v1/sessions):
  { user_id, user_email, amount, currency, description?,
    purchase_context: [{ merchant_details: { name, url, country_code_iso2, category_code?, category? },
                         product_details: [{ description, amount, quantity? }],
                         effective_until_minutes? }] }

Session response: { session_id, session_token, iframe_url, order_id, expires_at }

Payment credential (GET /v1/sessions/{id}/payment-result, status=completed):
  transactions[0].token         → Visa network token (16 digits, NOT real card number)
  transactions[0].dynamic_cvv   → one-time CVV (3 digits, changes per txn)
  transactions[0].expiry_month  → "12"
  transactions[0].expiry_year   → "2027"

Flows:
  First-time: create session → open iframe → user enters card → Visa tokenization → passkey registration → payment processed → poll credential
  Repeat:     create session → open iframe → user picks saved card → passkey verification → payment processed → poll credential

Rules:
  - MERCHANT_SECRET_KEY (sk_test_/sk_live_) → server-side ONLY, never in client bundles
  - publishableKey (pk_test_/pk_live_) → client-side safe
  - Poll payment-result with session_id (NOT session_token) + secret key (NOT session_token)
  - Sessions expire in ~15 minutes, are single-use
  - Raw card data NEVER leaves the PCI-compliant iframe
```

# Prava SDK Integration — Agent Skills Guide

This skill is **doc + templates**. It teaches AI coding agents how to integrate Prava into any web application. All capabilities are exposed via the Prava REST API (server-side) and the `@prava-sdk/core` npm package (client-side).

---

## When to Activate

Activate this skill when the user wants to:
- Integrate Prava payments into their app
- Add card enrollment / card collection to an AI agent
- Set up `@prava-sdk/core`
- Create a payment flow for an AI app
- Enable tokenized card payments with passkey verification
- Get one-time payment credentials (network token + dynamic CVV)

Trigger phrases: "integrate prava", "add prava sdk", "prava payments", "card enrollment", "add payment to my AI agent", "prava card collection", "tokenized payments", "passkey payments"

---

## What Prava Does

**Prava** is a payment stack for AI agents. It lets AI apps accept card payments without ever seeing raw card details.

1. **Card details stay in a PCI-compliant iframe** — your AI app never touches them
2. **Cards are tokenized with Visa** — stored securely in a vault
3. **Passkeys (biometrics)** protect every transaction — the user must approve
4. **Session-based** — each flow starts with a server-side session creation
5. **One-time credentials** — after payment, Prava generates a network token + dynamic CVV your agent uses to transact

### First-Time Flow
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
                  in the secure PCI-compliant iframe
                        │
                  Card tokenized with Visa
                  Stored in PCI-compliant vault
                        │
                  User registers a passkey (Face ID / Touch ID / fingerprint)
                        │
                  ✅ Payment processed → one-time credential generated
                        │
Your Server ──GET /v1/sessions/{id}/payment-result──▶ Prava API
                  │
              token (16-digit Visa network token)
              dynamic_cvv (one-time, 3 digits)
              expiry_month, expiry_year
                  │
              AI agent uses credential to transact
```

### Repeat Flow
```
Your Server ──POST /v1/sessions──▶ Prava API  (identical API call)
                  │
Your Frontend ────▶ Opens iframe
                        │
                  Iframe shows saved cards (brand + last 4)
                  User selects a card
                  User verifies passkey (biometric)
                        │
                  ✅ Payment processed → credential generated
```

Prava automatically detects returning users and shows their saved cards. The session API call is identical for both flows.

---

## Required Inputs

Before starting integration, you MUST collect these from the user:

| Input | Format | Example |
|-------|--------|---------|
| **Publishable Key** | `pk_test_xxx` or `pk_live_xxx` | `pk_test_TaFAJcKaldaFoXErIEHw03p_7lAhXY94D3RsXgLV_3s` |
| **Secret Key** | `sk_test_xxx` or `sk_live_xxx` | `sk_test_zGzBj2QzZVaFtO4dkY2ZLAGe7wRSf1zgzUPBheBksA4` |
| **Backend URL** | Full URL | `https://sandbox.api.prava.space` |

If the user hasn't provided these, ask:
> "To integrate Prava, I need three things from you:
> 1. Your **Publishable Key** (starts with `pk_test_` or `pk_live_`)
> 2. Your **Secret Key** (starts with `sk_test_` or `sk_live_`)
> 3. Your **Prava Backend URL** (e.g., `https://sandbox.api.prava.space`)
>
> You should have received these when your merchant account was created."

---

## Integration Steps

### Step 1: Detect the Framework

Scan the user's project to determine the framework:
- Check `package.json` for `next` → **Next.js**
- Check `package.json` for `express` → **Express.js**
- Check `package.json` for `react` (without Next) → **React SPA**
- No framework → **Vanilla JS**

### Step 2: Install the SDK

```bash
npm install @prava-sdk/core
# or: pnpm add @prava-sdk/core
# or: yarn add @prava-sdk/core
```

### Step 3: Set Up Environment Variables

Create a `.env` or `.env.local` file (depending on framework):

**Next.js** (`.env.local`):
```env
NEXT_PUBLIC_BACKEND_URL=https://sandbox.api.prava.space
MERCHANT_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

**Express** (`.env`):
```env
PRAVA_BACKEND_URL=https://sandbox.api.prava.space
MERCHANT_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
PRAVA_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

**Other frameworks** — use the appropriate env prefix (`VITE_`, `REACT_APP_`, etc.) for client-side variables.

> ⚠️ **CRITICAL SECURITY RULE**: `MERCHANT_SECRET_KEY` must ONLY be used server-side. NEVER expose it in client-side code, environment variables prefixed with `NEXT_PUBLIC_`, `VITE_`, or `REACT_APP_`, or browser-accessible bundles.

### Step 4: Create Server-Side Session Endpoint

The server must call Prava's backend to create a session. This is where the secret key is used. See the **Session API Reference** section below for the full request/response schema, and the **Templates** section for framework-specific code.

### Step 5: Create Frontend Integration

Choose one of two approaches:

**Approach A — Embedded iframe (richer UX):** Mount Prava's secure iframe directly in your page using the SDK. You get real-time validation events and callbacks.

```typescript
import { PravaSDK } from '@prava-sdk/core';

const prava = new PravaSDK({ publishableKey: 'pk_test_xxx' });

await prava.collectPAN({
  sessionToken: session.session_token,
  iframeUrl: session.iframe_url,
  container: '#card-form',        // DOM element or CSS selector
  onReady: () => { /* iframe loaded */ },
  onChange: (state) => { /* real-time validation: state.isComplete, state.cardNumber.isValid, etc. */ },
  onSuccess: (result) => { /* card enrolled: result.enrollmentId, result.last4, result.brand */ },
  onError: (error) => { /* handle error: error.code, error.message */ },
});

// On unmount:
prava.destroy();
```

**Approach B — Open in new tab (simpler):** Just open the `iframe_url` in a new browser tab. The user completes everything there and gets redirected back.

```typescript
window.open(session.iframe_url, '_blank');
```

### Step 6: Poll for Payment Credential (Server-Side)

After the user completes the card flow, your server must poll for the one-time payment credential. This is how you get the **network token + dynamic CVV** that your AI agent uses to transact.

```typescript
// Server-side: GET /v1/sessions/{session_id}/payment-result
// Auth: Bearer {MERCHANT_SECRET_KEY}  (NOT session_token)
// Poll every 3 seconds until status is "completed" or "failed"
// Timeout after ~90 seconds (30 attempts × 3s)

const res = await fetch(
  `${BACKEND_URL}/v1/sessions/${session_id}/payment-result?_t=${Date.now()}`,
  {
    headers: { 'Authorization': `Bearer ${MERCHANT_SECRET_KEY}` },
    cache: 'no-store',  // Prevent Next.js caching
  }
);
const data = await res.json();
// data.status: "pending" | "completed" | "failed"
// data.transactions[0].token         → Visa network token (16 digits)
// data.transactions[0].dynamic_cvv   → one-time CVV (3 digits)
// data.transactions[0].expiry_month  → "12"
// data.transactions[0].expiry_year   → "2027"
```

> **Key details:**
> - Use `session_id` in the URL path (NOT `session_token`)
> - Authenticate with `MERCHANT_SECRET_KEY` (NOT the session token)
> - The `token` is a **Visa network token** — not the user's real card number
> - The `dynamic_cvv` is **single-use** and changes every transaction
> - Add `?_t=${Date.now()}` cache-buster to prevent stale responses in Next.js

### Step 7: Provide Test Data

**Network test cards are provided by the Prava team.** Reach out to your Prava account manager during onboarding to receive sandbox test card details. Once received, the test card will include a 16-digit card number, a future expiry date (e.g., `12/28`), and a 3-digit CVV.

---

## Session API Reference

### `POST /v1/sessions` — Create Session

**Auth:** `Authorization: Bearer {MERCHANT_SECRET_KEY}`

**Request Body:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `user_id` | `string` | ✅ | 1-255 chars | Your app's unique user identifier |
| `user_email` | `string` | ✅ | Valid email | User's email address |
| `user_phone` | `string` | | Min 1 char | User's phone number |
| `user_country_code_iso2` | `string` | | 2 uppercase letters | ISO 3166-1 alpha-2 country code |
| `amount` | `string` | ✅ | `^\d+(\.\d{1,2})?$` | Transaction amount (e.g., `"99.99"`) |
| `currency` | `string` | ✅ | 3 uppercase letters | ISO 4217 currency code (e.g., `"USD"`) |
| `external_order_ref` | `string` | | Max 255 chars | Your internal order reference |
| `description` | `string` | | | Order description |
| `purchase_context` | `array` | ✅ | Min 1 entry | Purchase context (see below) |

**Purchase Context Entry:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `merchant_details.name` | `string` | ✅ | Merchant/app name |
| `merchant_details.url` | `string` | ✅ | Merchant website URL |
| `merchant_details.country_code_iso2` | `string` | ✅ | 2 uppercase letters (ISO 3166-1 alpha-2) |
| `merchant_details.category_code` | `string` | | MCC code (max 10 chars) |
| `merchant_details.category` | `string` | | Human-readable category (max 100 chars) |
| `product_details[].description` | `string` | ✅ | Product description |
| `product_details[].amount` | `string` | ✅ | Product amount |
| `product_details[].quantity` | `number` | | Default: 1 |
| `effective_until_minutes` | `number` | | Default: 15 |

**Response (201 Created):**

```json
{
  "session_id": "sess_01KKW...",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://sandbox.collect.prava.space?session=eyJ...",
  "order_id": "ord_01KKW...",
  "expires_at": "2026-03-16T15:30:00.000Z"
}
```

| Field | Description |
|-------|-------------|
| `session_id` | Unique session ID — **required for polling payment result** |
| `session_token` | JWT token — pass to frontend SDK |
| `iframe_url` | PCI-compliant card enrollment page URL |
| `order_id` | Order tracking ID |
| `expires_at` | ISO 8601 expiration (~15 min) |

**cURL Example:**

```bash
curl -X POST https://sandbox.api.prava.space/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -d '{
    "user_id": "user_123",
    "user_email": "user@example.com",
    "amount": "49.99",
    "currency": "USD",
    "description": "AI-assisted purchase",
    "purchase_context": [{
      "merchant_details": {
        "name": "My AI App",
        "url": "https://myapp.com",
        "country_code_iso2": "US",
        "category_code": "5734",
        "category": "Software Services"
      },
      "product_details": [{
        "description": "Premium Plan — Monthly",
        "amount": "49.99",
        "quantity": 1
      }],
      "effective_until_minutes": 15
    }]
  }'
```

### `GET /v1/sessions/{session_id}/payment-result` — Poll for Credential

**Auth:** `Authorization: Bearer {MERCHANT_SECRET_KEY}` (NOT session_token)

**Path:** Use `session_id` (e.g., `sess_01KKW...`), NOT `session_token`.

**Response (200):**

```json
{
  "session_id": "sess_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "completed",
  "transactions": [{
    "txn_id": "txn_01KKW...",
    "status": "completed",
    "token": "4323126882557932",
    "dynamic_cvv": "957",
    "expiry_month": "12",
    "expiry_year": "2027"
  }]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"pending"` → keep polling, `"completed"` → credential ready, `"failed"` → error |
| `transactions[].token` | `string` | Visa network token (16 digits) — NOT the real card number |
| `transactions[].dynamic_cvv` | `string` | One-time CVV (3 digits) — changes per transaction |
| `transactions[].expiry_month` | `string` | Token expiry month (2-digit MM) |
| `transactions[].expiry_year` | `string` | Token expiry year (4-digit YYYY) |
| `transactions[].error` | `object?` | Present if failed: `{ code, message }` |

**Polling pattern:** Call every 3 seconds. Timeout after ~90 seconds. Add `?_t=${Date.now()}` to bust Next.js cache.

**cURL Example:**

```bash
curl -s "https://sandbox.api.prava.space/v1/sessions/sess_01KKW.../payment-result" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" | jq
```

> **Common mistakes:**
> | Mistake | Correct Approach |
> |---------|-----------------|
> | Using `session_token` in URL | Use `session_id` (e.g., `sess_01KKW...`) |
> | Using `session_token` as Bearer auth | Use `MERCHANT_SECRET_KEY` (`sk_test_...`) |
> | Calling `/v1/sessions/validate` | Use `/v1/sessions/{id}/payment-result` (validate is internal) |
> | Expecting 2-digit expiry year | API returns 4-digit year (e.g., `"2027"`) |

### `POST /v1/sessions/{session_id}/revoke` — Revoke Session

**Auth:** `Authorization: Bearer {MERCHANT_SECRET_KEY}`

**Response (200):** `{ "success": true }`

### `GET /health` — Health Check

No auth required. Returns `{ "status": "ok", "timestamp": "..." }`.

```bash
curl https://sandbox.api.prava.space/health
```

---

## SDK API Reference

### Installation

```bash
npm install @prava-sdk/core
```

### Package Exports

```typescript
import {
  PravaSDK,                    // Main SDK class
  type PravaSDKConfig,         // Constructor config
  type CollectPANOptions,      // collectPAN options
  type CollectPANResult,       // Success result
  type PravaError,             // Error object
  type CardValidationState,    // onChange state
  type FieldState,             // Per-field state
  type CardFormStyles,         // Custom iframe styles
  IframeManager,               // (Advanced) Low-level iframe control
  PostMessageBridge,           // (Advanced) Low-level PostMessage handling
} from '@prava-sdk/core';
```

### `new PravaSDK(config)`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publishableKey` | `string` | ✅ | Must start with `pk_test_` (sandbox) or `pk_live_` (production) |

Throws `Error` if publishableKey is missing or doesn't start with `pk_`.

### `prava.collectPAN(options)` → `Promise<CollectPANResult>`

Collects card data via a secure iframe.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `sessionToken` | `string` | ✅ | From `POST /v1/sessions` response |
| `iframeUrl` | `string` | ✅ | From session response |
| `container` | `string \| HTMLElement` | ✅ | CSS selector or DOM element for iframe mount |
| `onReady` | `() => void` | | Iframe loaded and ready |
| `onChange` | `(state: CardValidationState) => void` | | Real-time validation on every input change |
| `onSuccess` | `(result: CollectPANResult) => void` | | Card enrolled successfully |
| `onError` | `(error: PravaError) => void` | | Error occurred |
| `styles` | `CardFormStyles` | | Custom styles for card form inside iframe |

**Return: `CollectPANResult`**

```typescript
interface CollectPANResult {
  enrollmentId: string;  // Unique enrollment ID
  last4: string;         // Last 4 digits of the card
  brand: string;         // "visa", "mastercard", etc.
  expMonth: number;      // 1-12
  expYear: number;       // e.g., 2028
}
```

**Error codes:**

| Code | Meaning |
|------|---------|
| `SDK_ALREADY_ACTIVE` | Card collection session already in progress |
| `INVALID_CONFIG` | iframeUrl missing or invalid |
| `IFRAME_LOAD_ERROR` | Failed to load the secure iframe |
| `SDK_INIT_ERROR` | General initialization error |

### `prava.destroy()`

Removes iframe, cleans up event listeners, releases resources. Always call on component unmount, before starting a new session, or after an error.

### Types

```typescript
interface CardValidationState {
  cardNumber: FieldState;
  expiry: FieldState;
  cvv: FieldState;
  isComplete: boolean;    // true when ALL fields are valid
}

interface FieldState {
  isEmpty: boolean;
  isValid: boolean;
  isFocused: boolean;
  error?: string;
}

interface CardFormStyles {
  base?: Record<string, string>;     // Base styles for all fields
  invalid?: Record<string, string>;  // Styles when field is invalid
  focus?: Record<string, string>;    // Styles when field is focused
}

interface PravaError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
```

**CardFormStyles example:**

```typescript
const styles: CardFormStyles = {
  base: { 'font-size': '16px', 'color': '#1a1a1a', 'font-family': 'Inter, sans-serif' },
  invalid: { 'color': '#e53e3e' },
  focus: { 'border-color': '#4f46e5' },
};
```

### PostMessage Events (Advanced)

**Iframe → SDK:**

| Event | Payload | Description |
|-------|---------|-------------|
| `PRAVA_READY` | — | Iframe loaded and ready |
| `PRAVA_CHANGE` | `CardValidationState` | Validation changed |
| `PRAVA_SUCCESS` | `CollectPANResult` | Card enrolled |
| `PRAVA_ERROR` | `PravaError` | Error occurred |
| `PRAVA_RESIZE` | `{ height }` | Iframe requests height change |
| `PRAVA_ENROLLMENT_COMPLETE` | Enrollment data | Full enrollment completed |
| `PRAVA_SAVED_CARDS_LOADED` | Cards list | Saved cards loaded (repeat flow) |
| `PRAVA_PASSKEY_VERIFY_REQUIRED` | Passkey data | Passkey verification needed |
| `PRAVA_TRANSACTION_COMPLETE` | Transaction data | Payment completed |
| `PRAVA_TRANSACTION_CREATED` | Transaction data | Transaction created |

**SDK → Iframe:**

| Command | Description |
|---------|-------------|
| `PRAVA_INIT` | Initialize with publishableKey + styles |
| `PRAVA_SUBMIT` | Trigger form submission |
| `PRAVA_FOCUS` | Focus a specific field |
| `PRAVA_CLEAR` | Clear form fields |
| `PRAVA_PASSKEY_VERIFY_COMPLETE` | Passkey verification result |
| `PRAVA_PASSKEY_VERIFY_FAILED` | Passkey verification failed |

### Iframe Security

- **Sandbox:** `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`
- **Permissions:** `payment; publickey-credentials-get; publickey-credentials-create`
- **Origin validation:** PostMessage restricted to iframe's origin only
- **No backend URL injection:** Iframe determines its backend URL from its own hostname

### Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 80+ |
| Firefox | 80+ |
| Safari | 14+ |
| Edge | 80+ |

WebAuthn/Passkey requires Web Authentication API support and biometric hardware (Face ID, Touch ID, fingerprint reader).

---

## Known Gotchas

These are common pitfalls discovered during integration. Address them proactively:

| Gotcha | Problem | Solution |
|--------|---------|----------|
| **React Strict Mode double-mount** | In development, React 18 mounts/unmounts/remounts. The SDK gets destroyed on first cleanup and `hasStarted` guard prevents re-init. | Use a `hasStarted` ref that resets to `false` in the cleanup function. See Next.js card form template. |
| **Next.js fetch caching** | Next.js may cache or deduplicate identical fetch requests. Polling returns stale "pending" responses. | Add cache-buster `?_t=${Date.now()}` and `cache: 'no-store'` + `next: { revalidate: 0 }` to fetch options. |
| **Duplicate session creation** | Parent creates a session (for polling) and card form creates its own (for iframe) → user pays on one session, polling checks a different one. | Create session **once** in the parent, pass as prop to card form. Both iframe and polling use the same `session_id`. |
| **`onReady` callback may not fire** | The SDK's `onReady` sometimes doesn't trigger, leaving loading spinner visible even though iframe is loaded. | Add a `MutationObserver` on the container to detect iframe appearance, plus a 5-second fallback timeout. |
| **Polling with wrong identifier** | Using `session_token` instead of `session_id` in URL, or `session_token` as Bearer auth instead of secret key. | Always use `session_id` in URL path and `MERCHANT_SECRET_KEY` as Bearer auth. |

---

## Adapting to the User's Project

**The templates in this skill are LOGIC references, not ready-to-use UI.** When integrating Prava, you MUST adapt to the user's existing design system, patterns, and code style. Never impose a specific UI.

### Before Writing Any Code, Scan the User's Project

1. **Detect styling:** `tailwind.config.*` → Tailwind, `*.module.css` → CSS Modules, `styled-components`/`@emotion` → CSS-in-JS, `@shadcn/ui`/`@mui/material`/`@chakra-ui/react`/`antd`/`@mantine/core` → Use their components
2. **Detect component patterns:** How do they handle loading states? Errors? Forms? Page structure?
3. **Detect placement:** Existing checkout page? Settings page? AI agent purchase trigger? Create new page matching their structure if needed.
4. **Detect auth:** How do they get user ID and email? (NextAuth, Clerk, custom?) Use their auth system — never hardcode.

### What to Keep vs. What to Adapt

| Keep Exactly (Critical Logic) | Adapt to User's Project |
|------|------|
| `hasStarted` ref + Strict Mode cleanup pattern | All visual rendering (loading, error, success states) |
| MutationObserver + 5s timeout fallback for onReady | CSS/styling approach (Tailwind, CSS modules, etc.) |
| Session created ONCE in parent, passed as prop | Component structure and file organization |
| Polling with `session_id` + `MERCHANT_SECRET_KEY` | Page layout, navigation, routing |
| SDK cleanup on unmount (`sdkRef.current?.destroy()`) | Auth system integration (where userId/email come from) |
| Cache-busting on poll requests (`?_t=${Date.now()}`) | Error handling patterns (toast, alert, inline) |
| `onSuccess: () => {}` (completion via polling, not callback) | Product/amount source (cart, AI context, props) |

---

## Templates

### Next.js: Server Action (`src/app/actions.ts`)

```typescript
'use server';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://sandbox.api.prava.space';
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

export interface SessionResponse {
  session_id: string;
  session_token: string;
  expires_at: string;
  iframe_url: string;
  order_id: string;
}

export interface PaymentTransaction {
  txn_id: string;
  status: 'completed' | 'failed' | string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  error?: { code: string; message: string };
}

export interface PaymentResultResponse {
  session_id: string;
  order_id: string | null;
  status: 'pending' | 'completed' | 'failed' | string;
  transactions: PaymentTransaction[];
}

interface CreateSessionParams {
  userId: string;
  userEmail: string;
  amount?: string;
  currency?: string;
  description?: string;
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
      amount: string;
      quantity?: number;
    }>;
    effective_until_minutes?: number;
  }>;
}

export async function createPravaSession({
  userId, userEmail, amount = '99.99', currency = 'USD', description, purchaseContext,
}: CreateSessionParams): Promise<SessionResponse> {
  if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
    throw new Error(
      'MERCHANT_SECRET_KEY not configured. Add it to .env.local:\n' +
      'MERCHANT_SECRET_KEY=sk_test_your_key_here'
    );
  }

  const res = await fetch(`${BACKEND_URL}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({
      user_id: userId,
      user_email: userEmail,
      amount,
      currency,
      description: description || 'Purchase',
      purchase_context: purchaseContext || [{
        merchant_details: {
          name: 'My AI App',                  // ← Replace with your app name
          url: 'https://myapp.com',           // ← Replace with your URL
          country_code_iso2: 'US',            // ← Replace with your country
          category_code: '5734',
          category: 'Software Services',
        },
        product_details: [{
          description: 'Purchase',
          amount: amount,
          quantity: 1,
        }],
        effective_until_minutes: 15,
      }],
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: { message: 'Unknown error' } }));
    throw new Error(errorData.error?.message || `Failed to create session (HTTP ${res.status})`);
  }

  return res.json();
}

export async function pollPaymentResult(sessionId: string): Promise<PaymentResultResponse> {
  if (!MERCHANT_SECRET_KEY) throw new Error('MERCHANT_SECRET_KEY not configured.');

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

export async function checkPravaHealth(): Promise<{ healthy: boolean }> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { cache: 'no-store' });
    return { healthy: res.ok };
  } catch {
    return { healthy: false };
  }
}
```

### Next.js: Card Form Component (`src/components/PravaCardForm.tsx`)

> **CRITICAL LOGIC — do not change:** `hasStarted` ref for Strict Mode, MutationObserver + 5s timeout for onReady, SDK cleanup on unmount, session passed as prop (NOT created internally).

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PravaSDK } from '@prava-sdk/core';
import type { PravaError, CardValidationState } from '@prava-sdk/core';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || '';

interface PravaCardFormProps {
  /** Pre-created session from server action — do NOT create session inside this component */
  session: {
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  };
  onError?: (error: PravaError | Error) => void;
}

export default function PravaCardForm({ session, onError }: PravaCardFormProps) {
  const sdkRef = useRef<PravaSDK | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⚠️ CRITICAL: React Strict Mode double-mount guard.
  // Resets to false in cleanup so remount re-initializes.
  const hasStarted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<CardValidationState | null>(null);

  const mountSdk = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSdkReady(false);

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
          onReady: () => { setSdkReady(true); setLoading(false); },
          onChange: (state: CardValidationState) => setValidationState(state),
          onSuccess: () => {
            // Payment completion handled by PARENT via polling.
            // Do NOT add payment-result logic here.
          },
          onError: (err: PravaError) => { setError(err.message); onError?.(err); },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      setLoading(false);
    }
  }, [session, onError]);

  // ⚠️ CRITICAL: Mount with Strict Mode handling
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      mountSdk();
    }
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
      hasStarted.current = false; // ← Reset so remount re-initializes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚠️ CRITICAL: Fallback for onReady not firing.
  // MutationObserver detects iframe + 5s hard timeout.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sdkReady) return;

    const hideLoading = () => { setSdkReady(true); setLoading(false); };

    const observer = new MutationObserver(() => {
      if (container.querySelector('iframe')) hideLoading();
    });
    observer.observe(container, { childList: true, subtree: true });

    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => { observer.disconnect(); clearTimeout(timeout); };
  }, [sdkReady]);

  // ── ADAPT all rendering below to the user's design system ──
  return (
    <div>
      {error && (
        <div role="alert">
          <p>Error: {error}</p>
          <button onClick={mountSdk}>Try Again</button>
        </div>
      )}

      {loading && !sdkReady && !error && <div>Loading secure card form…</div>}

      {validationState && sdkReady && (
        <div>
          <span>{validationState.cardNumber.isValid ? '✓' : '○'} Card Number</span>
          <span>{validationState.expiry.isValid ? '✓' : '○'} Expiry</span>
          <span>{validationState.cvv.isValid ? '✓' : '○'} CVV</span>
          {validationState.isComplete && <span>All fields valid ✓</span>}
        </div>
      )}

      {/* ⚠️ REQUIRED: iframe mounts here. Min ~400px height, overflow hidden. */}
      <div ref={containerRef} id="prava-card-form" style={{ minHeight: '400px', overflow: 'hidden' }} />
    </div>
  );
}
```

### Next.js: Page Integration (`src/app/checkout/page.tsx`)

> **State machine:** `idle → loading → card-entry (+ polling) → completed | failed`

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import PravaCardForm from '@/components/PravaCardForm';
import { createPravaSession, pollPaymentResult } from '@/app/actions';
import type { SessionResponse, PaymentResultResponse, PaymentTransaction } from '@/app/actions';

export default function CheckoutPage() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentResultResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isIdle = !session && !paymentResult && !loading;
  const isCardEntry = !!session && !paymentResult;
  const isCompleted = paymentResult?.status === 'completed';
  const isFailed = paymentResult?.status === 'failed';
  const completedTxn: PaymentTransaction | null = isCompleted ? paymentResult.transactions[0] ?? null : null;

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
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
      } catch { /* Keep polling on transient errors */ }
    };
    doPoll();
    pollingRef.current = setInterval(doPoll, 3000);
  };

  const handleCheckout = async () => {
    setLoading(true); setError(null); setPaymentResult(null);
    try {
      // ADAPT: Get userId/userEmail from your auth system, amount from your cart/product
      const s = await createPravaSession({
        userId: 'user_123',            // ← Replace with your auth context
        userEmail: 'user@example.com', // ← Replace with your auth context
        amount: '49.99',               // ← Replace with your product/cart
        currency: 'USD',
      });
      setSession(s);
      startPolling(s.session_id);
      // For new-tab approach: window.open(s.iframe_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
    } finally { setLoading(false); }
  };

  const handleReset = () => { stopPolling(); setSession(null); setPaymentResult(null); setError(null); };

  useEffect(() => { return () => { if (pollingRef.current) clearInterval(pollingRef.current); }; }, []);

  // ── ADAPT all rendering below to the user's design system ──
  return (
    <div>
      {error && <div role="alert"><p>{error}</p></div>}

      {isIdle && (
        <button onClick={handleCheckout} disabled={loading}>
          {loading ? 'Creating session…' : 'Pay'}
        </button>
      )}

      {isCardEntry && session && (
        <div>
          <PravaCardForm session={session} onError={(err) => setError(err.message)} />
          {polling && <p>Waiting for payment completion…</p>}
          <button onClick={handleReset}>Cancel</button>
        </div>
      )}

      {isCompleted && completedTxn && (
        <div>
          <h2>Payment Complete</h2>
          <p>Network Token: {completedTxn.token}</p>
          <p>Dynamic CVV: {completedTxn.dynamic_cvv}</p>
          <p>Expiry: {completedTxn.expiry_month}/{completedTxn.expiry_year}</p>
          <button onClick={handleReset}>New Checkout</button>
        </div>
      )}

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
```

### Express.js: Session Route (`routes/prava-session.ts`)

```typescript
import { Router, Request, Response } from 'express';

const router = Router();
const BACKEND_URL = process.env.PRAVA_BACKEND_URL || 'https://sandbox.api.prava.space';
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

// POST /api/prava/create-session
router.post('/create-session', async (req: Request, res: Response) => {
  try {
    if (!MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes('YOUR_SECRET_KEY')) {
      return res.status(500).json({ error: 'MERCHANT_SECRET_KEY not configured.' });
    }

    const { userId, userEmail, amount = '99.99', currency = 'USD', description } = req.body;
    if (!userId || !userEmail) {
      return res.status(400).json({ error: 'userId and userEmail are required' });
    }

    const response = await fetch(`${BACKEND_URL}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MERCHANT_SECRET_KEY}`,
      },
      body: JSON.stringify({
        user_id: userId,
        user_email: userEmail,
        amount,
        currency,
        description: description || 'Purchase',
        purchase_context: [{
          merchant_details: {
            name: 'My AI App',                  // ← Replace
            url: 'https://myapp.com',           // ← Replace
            country_code_iso2: 'US',            // ← Replace
            category_code: '5734',
            category: 'Software Services',
          },
          product_details: [{ description: description || 'Purchase', amount, quantity: 1 }],
          effective_until_minutes: 15,
        }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error?.message || `Prava API error (HTTP ${response.status})`,
      });
    }

    return res.json(await response.json());
  } catch (error) {
    console.error('[Prava] Failed to create session:', error);
    return res.status(500).json({ error: 'Failed to create Prava session' });
  }
});

// GET /api/prava/payment-result/:sessionId
router.get('/payment-result/:sessionId', async (req: Request, res: Response) => {
  try {
    if (!MERCHANT_SECRET_KEY) return res.status(500).json({ error: 'MERCHANT_SECRET_KEY not configured.' });

    const response = await fetch(
      `${BACKEND_URL}/v1/sessions/${req.params.sessionId}/payment-result`,
      { headers: { 'Authorization': `Bearer ${MERCHANT_SECRET_KEY}` } }
    );

    if (!response.ok) {
      if (response.status === 404) return res.status(404).json({ error: 'Session not found' });
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: errorData.error?.message || `Prava API error (HTTP ${response.status})`,
      });
    }

    return res.json(await response.json());
  } catch (error) {
    console.error('[Prava] Failed to get payment result:', error);
    return res.status(500).json({ error: 'Failed to get payment result' });
  }
});

// GET /api/prava/health
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(`${BACKEND_URL}/health`);
    return res.json({ healthy: response.ok, ...(await response.json()) });
  } catch {
    return res.json({ healthy: false });
  }
});

export default router;
// Mount: app.use('/api/prava', pravaRouter);
```

### Vanilla JS: Complete HTML Integration

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prava Card Enrollment</title>
</head>
<body>
  <div id="card-form" style="min-height: 420px;"></div>
  <button id="start-btn" onclick="startFlow()">Add Payment Card</button>
  <div id="status"></div>

  <script type="module">
    import { PravaSDK } from '@prava-sdk/core';

    // ⚠️ In production, session creation MUST happen on your server.
    const PUBLISHABLE_KEY = 'pk_test_YOUR_KEY';
    const BACKEND_URL = 'https://sandbox.api.prava.space';
    const SECRET_KEY = 'sk_test_YOUR_KEY'; // ⚠️ Server-side only in production!

    let sdk = null;

    window.startFlow = async function() {
      document.getElementById('start-btn').style.display = 'none';
      document.getElementById('status').textContent = 'Creating session…';

      if (sdk) { sdk.destroy(); sdk = null; }

      try {
        // 1. Create session (move to server in production)
        const res = await fetch(`${BACKEND_URL}/v1/sessions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SECRET_KEY}`,
          },
          body: JSON.stringify({
            user_id: 'demo_user', user_email: 'demo@example.com',
            amount: '49.99', currency: 'USD', description: 'Demo checkout',
            purchase_context: [{
              merchant_details: { name: 'Demo Store', url: 'https://example.com', country_code_iso2: 'US' },
              product_details: [{ description: 'Test Product', amount: '49.99', quantity: 1 }],
            }],
          }),
        });
        const session = await res.json();

        // 2. Mount iframe
        sdk = new PravaSDK({ publishableKey: PUBLISHABLE_KEY });
        await sdk.collectPAN({
          sessionToken: session.session_token,
          iframeUrl: session.iframe_url,
          container: '#card-form',
          onReady: () => { document.getElementById('status').textContent = ''; },
          onSuccess: (result) => {
            document.getElementById('status').textContent =
              `✓ Card enrolled: ${result.brand} ****${result.last4}`;
          },
          onError: (err) => {
            document.getElementById('status').textContent = `Error: ${err.message}`;
          },
        });

        // Alternative: new tab approach
        // window.open(session.iframe_url, '_blank');
      } catch (err) {
        document.getElementById('status').textContent = `Error: ${err.message}`;
        document.getElementById('start-btn').style.display = 'block';
      }
    };
  </script>
</body>
</html>
```

---

## Sandbox & Testing

| Item | Value |
|------|-------|
| **Sandbox Backend** | `https://sandbox.api.prava.space` |
| **Production Backend** | `https://api.prava.space` |
| **Secret Key format** | `sk_test_xxx` (sandbox) / `sk_live_xxx` (production) |
| **Publishable Key format** | `pk_test_xxx` (sandbox) / `pk_live_xxx` (production) |
| **Test Cards** | Provided by Prava team during onboarding |
| **Health Check** | `curl https://sandbox.api.prava.space/health` |
| **Passkey requirements** | HTTPS (or localhost) + WebAuthn browser (Chrome 80+, Safari 14+, Firefox 80+, Edge 80+) + biometric hardware |

**Supported currencies:** Any valid ISO 4217 3-letter code — `USD`, `EUR`, `GBP`, `INR`, `CAD`, `AUD`, `JPY`, etc.

---

## Error Responses

All errors return JSON with an error object and appropriate HTTP status.

**Session creation errors:**

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `VAL_2001` | Invalid request body — check `details.fieldErrors` for specific fields |
| 401 | `AUTH_1001` | Invalid API key |
| 401 | `AUTH_1002` | Missing or invalid Authorization header |
| 500 | `SESSION_CREATE_ERROR` | Failed to create session (transient, retry) |

**Payment result errors:**

| Status | Meaning |
|--------|---------|
| 401 | Invalid or missing secret key |
| 404 | Session not found |

**Error response format:**

```json
{
  "error": {
    "code": "AUTH_1001",
    "message": "Invalid API key",
    "details": {}
  }
}
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `publishableKey must start with "pk_"` | Using secret key on frontend — use publishable key instead |
| `401 Invalid API key` on session creation | Check secret key starts with `sk_test_`/`sk_live_` and `Authorization: Bearer` header is correct |
| Iframe not loading | Verify `iframe_url` from session response; check browser console |
| `MERCHANT_SECRET_KEY not configured` | Add to `.env.local` (Next.js) or `.env` — server-side only |
| Session expired | Sessions last ~15 min. Create a new one |
| Passkey prompt missing | Ensure HTTPS (or localhost) + supported browser + biometric hardware |
| Polling returns `pending` forever | Using `session_id` (not `session_token`) in URL? Using secret key (not session_token) as Bearer? |
| Next.js stale polling responses | Add `?_t=${Date.now()}` + `cache: 'no-store'` + `next: { revalidate: 0 }` |
| React double-mount breaks SDK | Use `hasStarted` ref that resets to `false` in cleanup |

---

## Security Checklist

Before going live, verify:

- [ ] `MERCHANT_SECRET_KEY` is ONLY used server-side (never in client bundles)
- [ ] `publishableKey` is the only key used client-side
- [ ] Session creation happens on your server, not from the browser
- [ ] Using HTTPS in production
- [ ] CORS is properly configured on your server
- [ ] Session response is validated before use
- [ ] Polling uses `session_id` + secret key (not session_token)

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
