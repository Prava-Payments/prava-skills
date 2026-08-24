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
│  │  • Device binding: issuer OTP (first time)    │        │
│  │  • Passkey registration / verification         │        │
│  │    (on the card network's hosted page)        │        │
│  │  • Your app NEVER sees raw card data          │        │
│  └──────────────────────────────────────────────┘        │
│         │                                                 │
│         5  PostMessage events OR redirect                 │
│         ↓                                                 │
│  ┌──────────────┐                                        │
│  │  Your Frontend │ ← Enrollment event: id, last4, brand │
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
│   ├── total_amount, currency
│   ├── integration_type: "embedding" | "full_checkout" (optional)
│   ├── purchase_context: { custom: [entry] }
│   │   OR purchase_context: { quote: true, quote_id, access_grant? }
│   └── mandate_setup (optional standing-mandate terms)
├── Receive: session_id, session_token, iframe_url, order_id
└── Pass session_token + the verbatim iframe_url to frontend

Step 2: AI App (Frontend)
├── Option A: Embed iframe using PravaSDK.collectPAN()
│   └── Mount iframe in a container div
├── Option B: Open iframe_url in a new tab
│   └── window.open(iframe_url)  // already contains ?session=<session_id>
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
└── Device binding initiated (first time on this browser/device)

Step 5: End User (issuer OTP — first time on this browser/device only)
├── Card issuer sends a one-time code (SMS/email), 3-D Secure style
├── User enters the code (sandbox test code: 456789)
└── Skipped entirely on repeat purchases from the same browser

Step 6: End User (passkey — on the card network's hosted page)
├── Browser prompts for biometric (Face ID / Touch ID / fingerprint)
├── User approves passkey registration
└── Passkey stored for future verifications

Step 7: Iframe Completion
├── Embedded: do not await collectPAN or rely on onSuccess; current iframe builds do not emit the legacy PRAVA_SUCCESS event
├── New tab: user sees the Prava result or follows callback_url
└── Continue on the trusted server:
    ├── custom checkout: payment-result → credentials at awaiting_result → charge → report-status
    ├── quote mode: payment-result → Core checkout → top-level completed/failed
    └── mandate_setup: resolve/store the active mandate; no session credential or report-status
```

### Key Data at Each Step

| Step | Who | Data |
|------|-----|------|
| Session creation | Your server → Prava | secret_key, user_id, user_email, total_amount, currency, purchase_context |
| Session response | Prava → Your server | session_id, session_token, iframe_url, order_id, expires_at |
| Frontend init | Your frontend → SDK/Iframe | `session_token` passed separately, verbatim `iframe_url` whose query contains `session_id`, publishable key |
| Card submission | User → Iframe → Prava | Raw card data (never touches your app) |
| Browser progress | Iframe → SDK | Ready/change/dismiss and internal enrollment/transaction events; current high-level `onSuccess` is not a reliable signal |
| Payment state | Prava → Your server | Mode-specific `payment-result` or mandate lifecycle; this is authoritative |

### Session-Creation Guardrails

- Merchant callers must supply `user_id` and a syntactically valid `user_email` on a routable ICANN domain.
- `merchant_details.url` must be public HTTPS on a real ICANN-delegated domain. IP hosts, embedded credentials, and reserved TLDs are rejected; Prava stores only the URL origin.
- `currency` must be in the current backend allowlist documented in [Session API Reference](session-api-reference.md#supported-currencies), not merely any three-letter code.
- Custom and quote purchase-context fields cannot be mixed. Quote amount/currency must match the authoritative quote before any order is written.
- Persist the created `session_id` with the authenticated application user/order. A browser-facing sanitized status endpoint must verify that ownership before polling Prava; authentication alone does not prevent a same-merchant cross-user lookup.
- An explicit browser Cancel must go through that same ownership check and call `POST /v1/sessions/{id}/revoke` with the merchant secret. Do not equate closing the UI or hosted tab with cancelling the server session.

---

## Flow 2: Repeat Purchase (Saved Card)

This flow is used when the user already has a card enrolled. No re-onboarding needed.

### Step-by-Step

```
Step 1: AI App (Server)
├── Call POST /v1/sessions (same as first-time)
├── Optionally pass card: { card_id } to pre-select a saved card
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
├── Iframe completes card/passkey verification
├── Custom mode exposes a one-time credential at awaiting_result
├── Quote mode keeps credentials inside Core and exposes only checkout state
└── Much faster than first-time enrollment
```

---

## Flow 3: Standing-Mandate Setup

Use the optional `mandate_setup` object when the session should authorize later or recurring charges:

```json
{
  "mandate_setup": {
    "intent": "mandate_setup",
    "recurring_frequency": "monthly",
    "max_charges": 12,
    "valid_until": "2027-08-21T00:00:00.000Z",
    "merchant_scope": "listed"
  }
}
```

Allowed frequencies are `one_time`, `weekly`, `monthly`, and `yearly`; `max_charges` is an integer of at least 1; `valid_until` is an ISO 8601 datetime; and `merchant_scope` is `any` or `listed`. Recurring setups are merchant-listed. Keep this object server-authored alongside the amount and purchase context.

Current enforcement caveats: `max_charges` is validated and stored but is not a hard count gate in the mandate charge route, so enforce a count limit in trusted application state if it matters. Recurring mandates use `valid_until`; `one_time` mandates instead use the card network's fixed seven-day validity window regardless of that field.

This is an authorize-only flow. After iframe/passkey setup, Prava marks the setup transaction `authorized` and activates the mandate, but issues no session payment credential. Do **not** wait for session `payment-result` to reach `awaiting_result` and do not call session `report-status`.

On the trusted server:

1. Treat browser completion only as a trigger. Call `GET /v1/mandates?customer_id={user_id_or_cus_id}&standing_only=true` with the merchant secret, require the intended mandate's raw `status` to be `"active"`, and persist its `id`.
2. Later call `POST /v1/mandates/{id}/charge` with `{ amount, reference?, purchase_context? }`. `amount` is a decimal string with at most two fractional digits. Supply a stable application-owned `reference` (max 255) and reuse it on retries; Prava deduplicates it per mandate. `purchase_context`, when supplied, contains exactly one standard entry. Do not send `currency`; the route inherits it from setup.
3. If the response is `awaiting_result` and all four nullable `credentials` values (`token`, `dynamicCvv`, `expiryMonth`, `expiryYear`) are present, durably claim its `transactionId`, use a stable processor idempotency key, and persist/reuse that processor operation across retries.
4. Call `POST /v1/mandates/{id}/charges/{transactionId}/report` with `txn_status: "APPROVED" | "DECLINED"` and optional `txn_type: "PURCHASE"`, `authorization_code` (max 128), `response_code` (max 2), and decimal `amount_paid`. Derive these fields from the actual server-side processor outcome, never from a browser assertion.

---

## Flow 4: Server-Side Payment Result

After an ordinary checkout iframe flow, your server polls `payment-result` using `session_id` and the merchant secret. Custom and quote modes deliberately have different ownership. Authorize-only `mandate_setup` does not use this lifecycle.

### Step-by-Step

```
Step 1: Your Server polls for result
├── GET /v1/sessions/{session_id}/payment-result
├── Auth: Bearer {MERCHANT_SECRET_KEY}  ← secret key, NOT session_token
├── Poll with no-store/cache busting and a bounded timeout
└── Check data.status

Step 2: Shared status handling
├── "pending" or "processing" → keep polling
└── "failed" → stop; read top-level error first, then transaction error

Step 3A: Custom mode — status === "awaiting_result"
├── Find a line item with all four non-null credential fields:
├── token         → Visa network token (16 digits, NOT user's real card)
├── dynamic_cvv   → One-time CVV (3 digits, changes per transaction)
├── expiry_month  → "12" (2-digit MM)
├── expiry_year   → "2027" (4-digit YYYY)
└── txn_ref_id    → keep this — needed to report the outcome

Step 4A: Custom mode — charge and report
├── Atomically claim txn_ref_id in durable storage before touching the credential
├── Use a stable processor idempotency key derived from txn_ref_id
├── Persist/reuse the same processor operation across worker retries
├── POST /v1/sessions/{session_id}/report-status
├── Body: { txn_ref_id, txn_status: "APPROVED" | "DECLINED" }
├── Derive txn_status only from the server-side processor response
└── Reporting advances the custom transaction out of "awaiting_result"

Step 3B: Quote mode
├── Core owns merchant checkout; token/CVV are never returned
├── Nonterminal state is "pending" or "processing" with transactions: []
├── "completed" may also have transactions: []
└── "failed" carries a top-level error; inspect shop_pay for merchant state
```

Do not wait for `completed` before using a custom credential: `report-status` is what makes it completed. A crash between processor authorization and `report-status` must resume or query the same idempotent processor operation and report its stored outcome, never issue a new charge. Do not index `transactions[0]` in quote mode because credential suppression intentionally leaves that array empty.

### Key Data

| Step | Who | Data |
|------|-----|------|
| Poll request | Your server → Prava | `session_id` in URL, `MERCHANT_SECRET_KEY` in Bearer header |
| Poll response (nonterminal) | Prava → Your server | `{ status: "pending" \| "processing", transactions: [...], shop_pay }` |
| Custom credential ready | Prava → Your server | `{ status: "awaiting_result", transactions: [{ line_items: [{ txn_ref_id, token, dynamic_cvv, expiry_month, expiry_year }] }], shop_pay: null }` |
| Report outcome | Your server → Prava | `POST /v1/sessions/{session_id}/report-status` with `{ txn_ref_id, txn_status }` — required, incl. `DECLINED` |
| Quote terminal | Prava → Your server | `{ status: "completed" \| "failed", transactions: [], error?, shop_pay }` |
| Custom failed | Prava → Your server | Inspect top-level `error` first, then `transactions[].error` |

### Exact Report-Status Body

`txn_ref_id` and `txn_status` are required. The complete accepted shape is:

```typescript
{
  txn_ref_id: string;
  txn_status: 'APPROVED' | 'DECLINED';
  txn_type?: 'PURCHASE'; // defaults to PURCHASE
  authorization_code?: string; // max 128
  response_code?: string; // max 2
  amount_paid?: string;
  product_statuses?: Array<{
    product_id?: string; // max 50; this or product_ref_id is required
    product_ref_id?: string; // max 50; this or product_id is required
    status: 'COMPLETED' | 'FAILED' | 'CANCELED' | 'INPROGRESS' | 'PENDING' | 'ONHOLD';
    amount_paid?: string;
  }>;
}
```

The reporting server must map its processor's real authorization result to `APPROVED` or `DECLINED`. Browser callbacks, redirects, query parameters, and client request bodies are not trusted processor outcomes.

### Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Using `session_token` in the URL | Use `session_id` (e.g., `ses_01KKW...`) |
| Using `session_token` as Bearer auth | Use `MERCHANT_SECRET_KEY` (`sk_test_...`) |
| Calling `/v1/sessions/validate` | Use `/v1/sessions/{id}/payment-result` (validate is internal) |
| Expecting 2-digit expiry year | API returns 4-digit year (e.g., `"2027"`) |
| Waiting for custom `completed` before charging | Use complete credentials at `awaiting_result`, then report the outcome |
| Retrying a processor charge after a worker crash | Claim `txn_ref_id` durably and reuse the same processor idempotency key/operation |
| Polling `payment-result` for `mandate_setup` | Resolve/store the active mandate server-side, then use the mandate charge and charge-report routes later |
| Reading quote `transactions[0]` | Use top-level `status`, `error`, and `shop_pay`; quote transactions may be empty |
| Clearing local state on Cancel | Verify ownership and revoke the active server session before offering a new attempt |

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
  session_token ──→ collectPAN(sessionToken) separately
  iframe_url query ──→ ?session=<session_id>, supplied by backend
                                          │
  verbatim iframe_url ──→ Browser opens page ──→ Prava Iframe
                                          │
                                     Card data entered
                                     (NEVER leaves iframe)
                                          │
                                     Tokenized via Visa
                                     Stored in PCI vault
                                          │
  lifecycle events ←─ PostMessage ←────────┘
  payment state  ←── server-side API polling/mandate lifecycle
```

**Security boundaries:**
- 🔒 Raw card data NEVER crosses the iframe boundary
- 🔒 Secret key NEVER leaves your server
- 🔒 Publishable key is safe for client-side (read-only access)
- 🔒 Session tokens are short-lived and scoped to one session; the opaque iframe-link exchange is single-use
- 🔒 The JWT is never substituted into `iframe_url`; the URL identifies the session by `session_id`
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
  └── handles onReady/error/dismiss without awaiting collectPAN or relying on onSuccess
  └── trusted server handles the mode-specific lifecycle and polls payment-result only for checkout
```

### Pattern 2: Express + React SPA

```
React SPA (frontend)
  └── calls /api/create-session on your Express server
        └── Express route (uses secret key)
              └── POST /v1/sessions
        └── returns session data
  └── mounts PravaSDK with session_token + iframe_url
  └── Trusted server worker polls payment-result, charges through the processor, and calls report-status for custom mode
```

### Pattern 3: Any Backend + New Tab

```
Your backend (any language)
  └── POST /v1/sessions (using secret key)
  └── returns iframe_url + session_token to frontend

Your frontend
  └── window.open(iframe_url)  // pass verbatim; it contains ?session=<session_id>
  └── user completes flow in new tab
  └── user redirected back to your URL
```
