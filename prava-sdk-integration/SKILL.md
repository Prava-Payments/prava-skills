---
name: prava-sdk-integration
version: 1.2.0

description: Integrate Prava's payment SDK into AI applications — create server-side payment sessions, embed or host the PCI-compliant checkout, retrieve one-time Visa credentials, and report real processor outcomes. For application integrations, not the Prava agent CLI.
homepage: https://prava.space
author: Prava Payments
user-invocable: true
metadata: {"openclaw":{"emoji":"💳","category":"payments","primaryEnv":"MERCHANT_SECRET_KEY","requires":{"env":[],"npm":["@prava-sdk/core"]}}}
tags:
  - payments
  - sdk
  - card-enrollment
  - pci-compliant
  - passkey
  - visa
  - tokenization
  - ai-applications
---

# Prava SDK Integration

Integrate Prava into a web application without letting raw card data, the merchant secret key, or one-time payment credentials cross the wrong trust boundary.

This skill is for applications using `@prava-sdk/core` and Prava's merchant Session API. For an AI agent operating the Prava CLI, use the separate `prava-pay` skill.

## Read the relevant resources

- Read [references/session-api-reference.md](references/session-api-reference.md) when implementing or debugging create-session, payment-result, report-status, saved-card, or revoke calls.
- Read [references/sdk-api-reference.md](references/sdk-api-reference.md) when mounting the iframe or handling SDK lifecycle/events.
- Read [references/integration-flow.md](references/integration-flow.md) when deciding between custom checkout, quote checkout, embedded, and hosted flows.
- Read [references/test-data.md](references/test-data.md) before running a sandbox test.
- Adapt the files under `templates/nextjs`, `templates/express`, or `templates/vanilla` to the application's framework and design system. They are logic references, not a UI kit.

## Non-negotiable invariants

1. **The merchant secret key is server-only in every environment.** Never put an `sk_*` value in HTML, client JavaScript, a browser bundle, or an environment variable prefixed with `NEXT_PUBLIC_`, `VITE_`, or `REACT_APP_`.
2. **Create sessions on an authenticated application server.** Derive the user, amount, currency, destination merchant, and products from trusted server-side state. Persist the resulting `session_id` → application user/order binding, and enforce it on every browser-facing status request. Do not blindly relay browser-supplied values.
3. **Use the current create-session `purchase_context` object.** On `POST /v1/sessions`, a bare array is rejected. Custom checkout is `{ custom: [entry] }`; quote checkout is `{ quote: true, quote_id, access_grant? }`.
4. **Set the presentation explicitly.** Use `integration_type: "embedding"` for an SDK-mounted iframe and `integration_type: "full_checkout"` for a hosted/new-tab flow. The API default is `full_checkout`.
5. **Pass `iframe_url` verbatim.** Its `session` query parameter contains an opaque `ses_...` session ID, not the JWT. Never rebuild the URL or replace that value with `session_token`.
6. **Keep payment credentials server-side.** Polling returns a network token and dynamic CVV. Consume them in a trusted server/agent process; do not serialize or render them in the browser.
7. **Treat `awaiting_result` as credential-ready for custom checkout.** `completed` normally happens only after the real processor outcome is reported. Waiting for `completed` before charging creates a deadlock.
8. **Make the processor charge idempotent.** Before using a credential, atomically claim its `txn_ref_id` in durable storage and use a stable processor idempotency key derived from it. A worker retry must resume/query the same processor attempt, never create a second charge.
9. **Report the actual outcome.** After attempting the charge, call `report-status` with `APPROVED` or `DECLINED`. Never fabricate approval merely to advance the state.
10. **Branch authorize-only mandates before polling.** A session with `mandate_setup.intent: "mandate_setup"` creates an authorization for later charges; it emits no immediate payment credential. Do not wait for Session API `awaiting_result` or call Session API `report-status` for that setup.
11. **Create one session per checkout attempt.** The iframe and payment-result poller must use the same `session_id` returned by that one call.
12. **Revoke abandoned sessions.** A browser Cancel/restart action must call the authenticated server, verify session ownership, and invoke `POST /v1/sessions/{id}/revoke`. Closing an iframe/tab or clearing local state does not cancel the server session.

## Required inputs

Collect these before integration:

| Input | Sandbox | Production | Exposure |
|---|---|---|---|
| Backend URL | `https://sandbox.api.prava.space` | `https://api.prava.space` | Server-only is sufficient |
| Publishable key | `pk_test_*` | `pk_live_*` | Browser-safe |
| Merchant secret key | `sk_test_*` | `sk_live_*` | Server-only |

Test keys must be used with the sandbox URL; live keys must be used with the production URL. If keys are unavailable, add obvious placeholders and tell the user to obtain credentials from Prava onboarding. Never invent usable-looking credentials.

## Current Session API contract

### Custom checkout

`POST /v1/sessions` uses `Authorization: Bearer {MERCHANT_SECRET_KEY}` and a JSON body like this:

```json
{
  "user_id": "user_123",
  "user_email": "buyer@example.com",
  "total_amount": "49.99",
  "currency": "USD",
  "description": "Order 123",
  "integration_type": "embedding",
  "purchase_context": {
    "custom": [
      {
        "merchant_details": {
          "name": "Zara",
          "url": "https://www.zara.com",
          "country_code_iso2": "US",
          "category_code": "5651",
          "category": "Apparel"
        },
        "product_details": [
          {
            "product_id": "sku_123",
            "description": "Ribbed socks",
            "unit_price": "49.99",
            "quantity": 1
          }
        ],
        "effective_until_minutes": 15
      }
    ]
  }
}
```

Custom checkout currently supports exactly one purchase-context entry. `merchant_details` describes the destination merchant where the credential will be used, not the integrating AI application.

### Quote checkout

Use quote mode only with a `quote_id` obtained through the Prava shop flow:

```json
{
  "user_id": "user_123",
  "user_email": "buyer@example.com",
  "total_amount": "76.00",
  "currency": "USD",
  "integration_type": "full_checkout",
  "purchase_context": {
    "quote": true,
    "quote_id": "qte_..."
  }
}
```

An `access_grant` may be supplied only when the quote owner explicitly issued one for a cross-caller flow. Do not invent or persist a grant. Quote and custom fields are mutually exclusive. For quote mode, the validated quote is authoritative: the requested amount/currency must match it exactly, and a mismatch can return `409 QUOTE_SESSION_MISMATCH` with canonical `quoted_amount` and `currency_iso`.

### Authorize-only mandate setup

Adding `mandate_setup.intent: "mandate_setup"` changes the lifecycle. The iframe authorizes and activates a standing mandate, while the setup order and transaction become `authorized`; no token/CVV is emitted for an immediate charge. Do not run the custom payment-result loop below for this intent.

Resolve and store the active mandate on the server. A later charge uses `POST /v1/mandates/{mandate_id}/charge`; after using that charge's credential server-side, report the real outcome to `POST /v1/mandates/{mandate_id}/charges/{txn_id}/report`. These are mandate endpoints, not Session API `report-status`. See [references/session-api-reference.md](references/session-api-reference.md#mandate-setup) for the exact shapes.

### Relevant validation

- Merchant callers must send `user_id` and `user_email`.
- `user_email` must use a routable ICANN domain; reserved/local TLDs are rejected.
- `merchant_details.url` must be a public HTTPS URL on an ICANN-delegated domain, with no IP host or embedded credentials. Paths, queries, and fragments are reduced to the origin.
- `country_code_iso2` is two uppercase letters.
- `currency` is an uppercase code in Prava's supported allowlist; it is not an arbitrary three-letter value.
- `total_amount` currently accepts a non-negative decimal string with at most two fractional digits.
- `callback_url`, when present, must be HTTPS.

### Success response

```json
{
  "session_id": "ses_...",
  "session_token": "eyJ...",
  "expires_at": "2026-08-21T12:30:00.000Z",
  "iframe_url": "https://sandbox.collect.prava.space?session=ses_...",
  "order_id": "ord_..."
}
```

Keep `session_id` for server-side polling. Pass `session_token` and the unmodified `iframe_url` separately to `PravaSDK.collectPAN`.

## Integration workflow

### 1. Inspect the application before editing

- Detect the framework and package manager.
- Reuse its auth identity; do not hardcode production users.
- Reuse its server-side cart/order source and validation.
- Match its component library, loading/error patterns, and styling.
- Decide whether the flow is embedded or hosted before creating a session.

### 2. Install and configure

```bash
npm install @prava-sdk/core
```

Next.js example:

```env
PRAVA_BACKEND_URL=https://sandbox.api.prava.space
MERCHANT_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

Express example:

```env
PRAVA_BACKEND_URL=https://sandbox.api.prava.space
MERCHANT_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
PRAVA_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
```

Only the publishable key needs to reach the browser.

### 3. Create the session on the server

Define the wire types rather than accepting an untyped legacy array:

```typescript
type IntegrationType = 'embedding' | 'full_checkout';

interface PurchaseContextEntry {
  merchant_details: {
    name: string;
    url: string;
    country_code_iso2: string;
    category_code?: string;
    category?: string;
  };
  product_details: Array<{
    product_id?: string;
    description: string;
    unit_price: string;
    quantity?: number;
  }>;
  effective_until_minutes?: number;
}

type PurchaseContext =
  | { custom: PurchaseContextEntry[]; quote?: false }
  | { quote: true; quote_id: string; access_grant?: string };
```

The application-facing session endpoint should authenticate the user and build the API body from trusted state:

```typescript
const response = await fetch(`${PRAVA_BACKEND_URL}/v1/sessions`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${MERCHANT_SECRET_KEY}`,
  },
  body: JSON.stringify({
    user_id: authenticatedUser.id,
    user_email: authenticatedUser.email,
    total_amount: order.total,
    currency: order.currency,
    external_order_ref: order.id,
    integration_type: 'embedding',
    purchase_context: { custom: [order.purchaseContext] },
  }),
  cache: 'no-store',
});
```

Validate the response before returning the non-secret session fields needed by the page. Do not send `MERCHANT_SECRET_KEY` or a payment-result payload to the browser.

### 4. Render the checkout

#### Embedded iframe

Create the session with `integration_type: "embedding"`, then mount the returned URL without altering it:

```typescript
import { PravaSDK } from '@prava-sdk/core';

const prava = new PravaSDK({ publishableKey });

// Start the iframe, but do not use this Promise/callback as payment success.
// Current iframe completion is determined by the server lifecycle below.
void prava.collectPAN({
  sessionToken: session.session_token,
  iframeUrl: session.iframe_url,
  container: '#prava-card-form',
  onReady: () => setReady(true),
  onChange: (state) => setValidation(state),
}).catch((error) => showError(error.message));
```

Current iframe builds emit enrollment/transaction lifecycle events but not the legacy `PRAVA_SUCCESS` event that resolves `collectPAN()` and triggers `onSuccess`. Do not await that Promise or gate UI/payment state on `onSuccess`; use `onReady` for mount state and the sanitized server poll for payment state. Destroy the SDK on unmount. In React Strict Mode, reset the mount guard in cleanup so the development remount can initialize again. Preserve the returned `iframe_url`; the SDK appends only the parent origin.

#### Hosted/new-tab checkout

Create the session with `integration_type: "full_checkout"`. The SDK is unnecessary:

```typescript
window.open(session.iframe_url, '_blank', 'noopener,noreferrer');
```

Do not add a token query parameter. The returned URL already carries the opaque session ID.

### 5. Poll and settle on the server

The merchant payment-result state machine for an immediate custom checkout (not quote mode and not authorize-only mandate setup) is:

```text
pending | processing
        ↓
awaiting_result  (custom checkout credential is ready)
        ↓  charge through your processor, then report the real result
completed | failed
```

For custom checkout, poll until a complete credential-bearing line item appears at `awaiting_result`:

```typescript
type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'awaiting_result'
  | 'completed'
  | 'failed';

async function waitForCustomCredential(sessionId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(
      `${PRAVA_BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`,
      {
        headers: { Authorization: `Bearer ${MERCHANT_SECRET_KEY}` },
        cache: 'no-store',
      },
    );
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message ?? `Payment poll failed (${response.status})`);
    }
    if (result.status === 'failed') {
      throw new Error(
        result.error?.message ??
        result.transactions?.[0]?.error?.message ??
        'Payment failed',
      );
    }
    if (result.status === 'awaiting_result') {
      const lineItem = result.transactions
        ?.flatMap((transaction: { line_items?: unknown[] }) => transaction.line_items ?? [])
        .find((item: any) =>
          item.token && item.dynamic_cvv && item.expiry_month && item.expiry_year,
        );
      if (lineItem) return lineItem;
    }
    if (result.status === 'completed') {
      return null; // already settled; do not charge the credential again
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error('Timed out waiting for a payment credential');
}
```

Use the returned `token`, `dynamic_cvv`, `expiry_month`, and `expiry_year` only inside the trusted payment process. Before calling the processor, atomically create or acquire a durable payment-attempt record keyed by `txn_ref_id`, and pass a stable key derived from `txn_ref_id` through the processor's idempotency mechanism. Persist the processor request/reference and result. If a worker crashes after authorization but before `report-status`, a retry must query or repeat the **same idempotent processor operation** and report its stored outcome; it must not submit a new charge. An in-memory lock is insufficient.

Then report what the processor actually returned:

```typescript
async function reportPaymentOutcome(args: {
  sessionId: string;
  txnRefId: string;
  approved: boolean;
  authorizationCode?: string;
  responseCode?: string;
  amountPaid?: string;
}) {
  const response = await fetch(
    `${PRAVA_BACKEND_URL}/v1/sessions/${encodeURIComponent(args.sessionId)}/report-status`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MERCHANT_SECRET_KEY}`,
      },
      body: JSON.stringify({
        txn_ref_id: args.txnRefId,
        txn_status: args.approved ? 'APPROVED' : 'DECLINED',
        ...(args.authorizationCode && { authorization_code: args.authorizationCode }),
        ...(args.responseCode && { response_code: args.responseCode }),
        ...(args.amountPaid && { amount_paid: args.amountPaid }),
      }),
      cache: 'no-store',
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.message ?? `Report failed (${response.status})`);
  }
  return result;
}
```

Return only a sanitized status to the browser. Never return the token, dynamic CVV, full payment-result body, or processor authorization data to a client component.

For quote checkout, Prava owns the merchant checkout and suppresses credentials. Continue polling through `pending`/`processing`; treat top-level `completed` or `failed` as terminal. `transactions` may be empty, and failure may live in top-level `error`. Do not wait for or expose a credential-bearing `awaiting_result` response in quote mode.

For `mandate_setup.intent: "mandate_setup"`, do not use this Session API polling path at all. Complete the authorization flow, persist the resulting mandate server-side, and use the mandate charge/report lifecycle for later purchases.

### 6. Test in sandbox

- Use `https://sandbox.api.prava.space` with `pk_test_*` and `sk_test_*` keys.
- Use only the network test card assigned by Prava onboarding.
- A first run on a new browser/device can include device-binding OTP before passkey registration; use the sandbox OTP documented for the account (the standard sandbox code is `456789`).
- Passkeys require HTTPS or localhost and a WebAuthn-capable browser/device.
- Sessions normally expire after about 15 minutes. Create a new session after expiry.

## Framework templates

- Next.js server/session logic: `templates/nextjs/server-action.ts`
- Next.js SDK mount: `templates/nextjs/card-form-component.tsx`
- Next.js page/state example: `templates/nextjs/page-integration.tsx`
- Express server routes: `templates/express/session-route.ts`
- Vanilla browser half: `templates/vanilla/integration.html` (pair it with a server route and an ESM-aware bundler/import map; it contains no secret key)

When adapting a template, preserve the contract and security boundaries while replacing its demo user, order, merchant, processor, layout, and error presentation with the application's real implementations.

## Common failures

| Symptom | Check |
|---|---|
| `400 VAL_2001` on `purchase_context` | The current wire shape is `{ custom: [...] }` or `{ quote: true, quote_id }`; a bare array is invalid. |
| Embedded flow looks like a hosted checkout | Create the session with `integration_type: "embedding"`. |
| `401` while polling | Use `session_id` in the path and the merchant secret key as Bearer auth, server-side. |
| Poll remains `pending` in Next.js | Add a timestamp query, `cache: 'no-store'`, and `next: { revalidate: 0 }`. |
| Poll reaches `awaiting_result` but never `completed` | The credential is ready; charge it and call `report-status`. |
| A worker retry can charge twice | Atomically claim `txn_ref_id` in durable storage and reuse it as the processor idempotency anchor before touching the credential. |
| Iframe preview returns `404` | Pass `iframe_url` verbatim. Do not replace its `ses_...` query value with the JWT. |
| React development remount breaks the iframe | Reset the Strict Mode mount guard and destroy the SDK in cleanup. |
| Loading spinner never clears | Keep `onReady`, plus an iframe `MutationObserver` and bounded fallback timeout. |
| `collectPAN()` / `onSuccess` never finishes | Current iframe builds do not emit the legacy `PRAVA_SUCCESS` event. Start `collectPAN()` without awaiting it, catch errors, and use authenticated server polling as the payment authority. |
| Quote completion has no transaction rows | This is valid; use top-level status/error and `shop_pay`. |
| Mandate setup polling never reaches `awaiting_result` | Authorize-only setup emits no credential; use the later `/v1/mandates/{id}/charge` and charge-report lifecycle. |
| Merchant URL or user email is rejected late | Use a public HTTPS ICANN merchant origin and a routable email domain when creating the session. |
| Cancel hides the UI but checkout still works | Authorize ownership and call the server-side session revoke endpoint before offering a fresh attempt. |

## Security checklist

- [ ] Merchant secret key exists only in a server secret store/environment.
- [ ] The application server authenticates the caller and derives user/order data from trusted state.
- [ ] Every browser-facing status request is authorized against a durable session/user ownership record.
- [ ] Only the publishable key, session token, and verbatim iframe URL reach the iframe host page.
- [ ] Payment-result polling, credential use, and report-status happen server-side.
- [ ] Token, dynamic CVV, session JWT, and quote access grant are absent from browser rendering and logs.
- [ ] Custom checkout stops on credential-ready `awaiting_result`, not only `completed`.
- [ ] Each `txn_ref_id` has a durable processor attempt/claim and a stable processor idempotency key.
- [ ] Every attempted custom charge reports its real `APPROVED` or `DECLINED` result.
- [ ] Quote completion handles empty `transactions` and top-level errors.
- [ ] Authorize-only mandate setup is not sent through the immediate custom credential/report loop.
- [ ] Active sessions are revoked server-side on explicit Cancel before local state is reset.
- [ ] Production uses HTTPS and environment-matched live keys/URLs.

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
