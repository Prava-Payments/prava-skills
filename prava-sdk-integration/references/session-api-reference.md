# Prava Session API Reference

The Session API is the server-side entry point for every Prava payment flow. Your backend calls this endpoint to create a session, which returns the `session_token` and `iframe_url` needed for the frontend.

### Base URLs

| Environment | Base URL | Keys |
|-------------|----------|------|
| **Sandbox** | `https://sandbox.api.prava.space` | `sk_test_*` / `pk_test_*` |
| **Production** | `https://api.prava.space` | `sk_live_*` / `pk_live_*` |

Examples below use the sandbox URL. Keys and URLs must match environments — `sk_test_` keys don't work against production, and vice versa.

---

## Create Session

### `POST /v1/sessions`

Creates a new session for card enrollment and/or purchase.

### Authentication

```
Authorization: Bearer {MERCHANT_SECRET_KEY}
```

The `MERCHANT_SECRET_KEY` (`sk_test_xxx` or `sk_live_xxx`) authenticates your merchant account. **This key must ONLY be used server-side.**

### Request Headers

```
Content-Type: application/json
Authorization: Bearer sk_test_xxxxx
```

### Request Body — Custom Purchase

```json
{
  "user_id": "user_123",
  "user_email": "user@example.com",
  "total_amount": "99.99",
  "currency": "USD",
  "description": "AI-assisted purchase",
  "integration_type": "embedding",
  "purchase_context": {
    "custom": [
      {
        "merchant_details": {
          "name": "PackRight Supplies",
          "url": "https://packright-supplies.com/catalog/tape",
          "country_code_iso2": "US",
          "category_code": "5943",
          "category": "Office Supplies"
        },
        "product_details": [
          {
            "product_id": "tape-3-pack",
            "description": "Packing tape — 3 pack",
            "unit_price": "99.99",
            "quantity": 1
          }
        ],
        "effective_until_minutes": 15
      }
    ]
  }
}
```

`purchase_context` is an object. The former bare-array wire shape is rejected.

### Field Reference

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `user_id` | `string` | ✅ | 1-255 chars | Your app's unique identifier for the user |
| `user_email` | `string` | ✅ | Valid email on a routable ICANN domain | Reserved/non-routable TLDs and IP domains are rejected |
| `user_phone` | `string` | | Min 1 char | User's phone number |
| `user_country_code_iso2` | `string` | | 2 uppercase letters | User's country (ISO 3166-1 alpha-2, e.g., "US") |
| `total_amount` | `string` | ✅ | Regex: `^\d+(\.\d{1,2})?$` | Transaction total amount (e.g., "99.99") |
| `currency` | `string` | ✅ | Supported uppercase ISO 4217 code | See [Supported Currencies](#supported-currencies); arbitrary three-letter codes are rejected |
| `external_order_ref` | `string` | | Max 255 chars | Your internal order reference ID |
| `callback_url` | `string` | | HTTPS URL, max 2048 chars | Redirect URL after payment completion |
| `description` | `string` | | | Order description |
| `purchase_context` | `object` | ✅ | Exactly one mode | `{ custom: [entry] }` or `{ quote: true, quote_id, access_grant? }` |
| `card` | `object` | | | Pre-select a saved card (skip card entry) |
| `card.card_id` | `string` | | | ID of a previously saved card |
| `card.vault_ref_id` | `string` | | Valid UUID | Encrypted card reference from Skyflow vault |
| `integration_type` | `string` | | `"embedding"` or `"full_checkout"` | Defaults to `"full_checkout"` |
| `mandate_setup` | `object` | | | Optional standing-mandate configuration; see below |

### Purchase Context Modes

The two modes are mutually exclusive.

#### Custom Mode

```json
{
  "purchase_context": {
    "custom": [
      {
        "merchant_details": {
          "name": "PackRight Supplies",
          "url": "https://packright-supplies.com",
          "country_code_iso2": "US"
        },
        "product_details": [
          {
            "description": "Packing tape — 3 pack",
            "unit_price": "99.99",
            "quantity": 1
          }
        ]
      }
    ]
  }
}
```

`custom` must contain one entry. Multi-merchant checkout is not currently accepted.

#### Quote Mode

```json
{
  "total_amount": "99.99",
  "currency": "USD",
  "purchase_context": {
    "quote": true,
    "quote_id": "qte_01ABC...",
    "access_grant": "qag_0123456789abcdef0123456789abcdef.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq"
  }
}
```

- `quote` must be exactly `true` and `quote_id` is required.
- `custom` must be omitted.
- `access_grant` is optional and is used only for an authorized cross-caller quote. Its wire format is `qag_<32 lowercase hex>.<43 base64url characters>`.
- Prava resolves the quote before creating an order. `total_amount` and `currency` must exactly match its authoritative amount and currency.

### Purchase Context Entry

> **`merchant_details` is the destination merchant** — the business the user is buying from, **not** the integrating app. The `name` renders as the header on the checkout page and is forwarded to the card network as the merchant of record for the token.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `merchant_details` | `object` | ✅ | Destination merchant information (where the user is buying) |
| `merchant_details.name` | `string` | ✅ | Destination merchant name — shown to the user on the checkout page |
| `merchant_details.url` | `string` | ✅ | Public HTTPS URL on a real ICANN-delegated domain. IP hosts, credentials, and reserved TLDs are rejected; paths, queries, and fragments are stored as the bare origin |
| `merchant_details.country_code_iso2` | `string` | ✅ | 2 uppercase letters (ISO 3166-1 alpha-2) |
| `merchant_details.category_code` | `string` | | MCC code (max 10 chars) |
| `merchant_details.category` | `string` | | Human-readable category (max 100 chars) |
| `product_details` | `array` | ✅ | At least one product |
| `product_details[].description` | `string` | ✅ | Product description |
| `product_details[].unit_price` | `string` | ✅ | Product unit price |
| `product_details[].product_id` | `string` | | Max 50 chars. Your internal product ID |
| `product_details[].quantity` | `number` | | Positive integer; default: 1 |
| `effective_until_minutes` | `number` | | Default: 15. How long this context is valid |

Merchant names are sanitized to the card-network-safe character set. After sanitization the name must remain non-empty.

### Mandate Setup

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

| Field | Allowed values / validation |
|-------|-----------------------------|
| `intent` | `"checkout"` or `"mandate_setup"` |
| `recurring_frequency` | `"one_time"`, `"weekly"`, `"monthly"`, or `"yearly"` |
| `max_charges` | Integer ≥ 1. Accepted and stored, but the current mandate charge route does not enforce this count as a hard cap; do not rely on it without an application-side gate |
| `valid_until` | ISO 8601 datetime. Used for recurring mandates; `one_time` setup currently uses the card network's fixed seven-day window instead |
| `merchant_scope` | `"any"` or `"listed"`; recurring mandates are merchant-listed |

#### Authorize-Only Lifecycle

`mandate_setup.intent: "mandate_setup"` authorizes a standing mandate; it is not a session payment. After the iframe completes, Prava activates the mandate and records the setup transaction as `authorized`. It does **not** mint a session payment credential.

- Do not wait for session `payment-result` to reach `awaiting_result`, and do not call `POST /v1/sessions/{session_id}/report-status` for this setup.
- Treat browser completion only as a trigger. On the trusted server, call `GET /v1/mandates?customer_id={user_id_or_cus_id}&standing_only=true` with the merchant secret, resolve the intended returned mandate whose raw `status` is `"active"`, and persist its `id`.
- For a later payment, call `POST /v1/mandates/{id}/charge`. Currency is inherited from the setup order and is not accepted in this request:

```typescript
{
  amount: string; // /^\d+(\.\d{1,2})?$/
  reference?: string; // max 255; deduplicated per mandate + reference
  purchase_context?: PurchaseContextEntry[]; // exactly one entry when present
}
```

Use a stable, application-owned `reference` for each intended charge and reuse it on retries; the route deduplicates that value per mandate. A successful merchant-side mint returns `status: "awaiting_result"`, `transactionId`, and a `credentials` object with nullable `token`, `dynamicCvv`, `expiryMonth`, and `expiryYear`. When all four values are non-null, durably claim `transactionId` and use a stable processor idempotency key before charging. Then report the processor's real result to `POST /v1/mandates/{id}/charges/{transactionId}/report`:

```typescript
{
  txn_status: 'APPROVED' | 'DECLINED';
  txn_type?: 'PURCHASE'; // defaults to PURCHASE
  authorization_code?: string; // max 128
  response_code?: string; // max 2
  amount_paid?: string; // /^\d+(\.\d{1,2})?$/
}
```

The charge-report route, not the session `report-status` route, advances that mandate charge from `awaiting_result` to `completed` or `failed`. Never derive `txn_status` from browser callbacks, redirects, or other client-controlled assertions.

### Success Response (201 Created)

```json
{
  "session_id": "ses_01KKW...",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://sandbox.collect.prava.space?session=ses_01KKW...",
  "order_id": "ord_01KKW...",
  "expires_at": "2026-03-16T15:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | `string` | Unique session identifier — **required for polling payment result** |
| `session_token` | `string` | Short-lived JWT passed separately as `sessionToken` to the SDK |
| `iframe_url` | `string` | The backend-selected iframe URL; its `session` query parameter contains `session_id`, not the JWT |
| `order_id` | `string` | Unique order identifier for tracking |
| `expires_at` | `string` | ISO 8601 timestamp when the session expires |

Pass `iframe_url` to `PravaSDK.collectPAN()` or `window.open()` **verbatim**. Do not rebuild it, replace its `session` query parameter, or insert `session_token` into the URL.

### Error Responses

#### 401 Unauthorized
```json
{
  "error": {
    "code": "AUTH_1001",
    "message": "Invalid API key"
  }
}
```

```json
{
  "error": {
    "code": "AUTH_1002",
    "message": "Missing or invalid Authorization header"
  }
}
```

#### 400 Bad Request
```json
{
  "error": {
    "code": "VAL_2001",
    "message": "Invalid request body",
    "details": {
      "fieldErrors": {
        "total_amount": ["Must be a valid amount (e.g., \"99.99\")"],
        "currency": ["Must be 3 uppercase letters (ISO 4217, e.g., \"USD\")"]
      }
    }
  }
}
```

#### 409 Quote/Session Mismatch

When quote mode uses an amount or currency that differs from the validated quote:

```json
{
  "error": {
    "code": "QUOTE_SESSION_MISMATCH",
    "message": "Session amount and currency must match the quote",
    "quoted_amount": "99.99",
    "currency_iso": "USD"
  }
}
```

Retry with the returned canonical amount and currency. Unknown, expired, unauthorized, or malformed quotes fail before an order is created.

#### 429 Sandbox Limit Exhausted

```json
{
  "error": {
    "code": "TRIES_EXHAUSTED",
    "message": "You have exhausted your sandbox transaction limit. Contact support@prava.space for more tries."
  }
}
```

#### 500 Internal Server Error
```json
{
  "error": {
    "code": "SESSION_CREATE_ERROR",
    "message": "Failed to create session"
  }
}
```

---

## Get Payment Result

### `GET /v1/sessions/{session_id}/payment-result`

Returns the session lifecycle. For an ordinary **custom-mode checkout**, this endpoint exposes the one-time payment credential when the top-level status reaches `awaiting_result`. In **quote mode**, Core owns merchant checkout, suppresses credentials, and returns terminal state through the top-level status and `shop_pay`. Authorize-only `mandate_setup` is excluded: it produces no session credential, so do not poll this endpoint waiting for `awaiting_result`.

### Authentication

```
Authorization: Bearer {MERCHANT_SECRET_KEY}
```

> ⚠️ Uses your **secret key** (not the session token). This is a server-side only call.

### Path Parameters

| Parameter | Description |
|-----------|-------------|
| `session_id` | The `session_id` from the create session response (e.g., `ses_01KKW...`) |

### Custom-Mode Credential Response (200)

```json
{
  "session_id": "ses_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "awaiting_result",
  "transactions": [
    {
      "txn_id": "txn_01KKW...",
      "status": "awaiting_result",
      "line_items": [
        {
          "txn_ref_id": "tli_01KKW...",
          "merchant_name": "PackRight Supplies",
          "merchant_url": "https://packright-supplies.com",
          "total_amount": "99.99",
          "status": "credentials_generated",
          "token": "4323126882557932",
          "dynamic_cvv": "957",
          "expiry_month": "12",
          "expiry_year": "2027",
          "products": [
            {
              "product_ref_id": "ref_01KKW...",
              "external_product_id": null,
              "name": "Premium AI Assistant - Monthly",
              "unit_price": "99.99",
              "quantity": 1
            }
          ]
        }
      ]
    }
  ],
  "shop_pay": null
}
```

This is the actionable state for an ordinary custom checkout: charge the complete, non-null credential and then call `report-status`. Waiting for `completed` before charging creates a deadlock because reporting the processor outcome is what advances the transaction out of `awaiting_result`. This lifecycle does not apply to authorize-only `mandate_setup`.

### Quote-Mode Terminal Responses (200)

Quote-backed checkout never returns token/CVV rows while Core owns checkout. A successful merchant checkout can therefore complete with an empty `transactions` array:

```json
{
  "session_id": "ses_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "completed",
  "transactions": [],
  "shop_pay": {
    "status": "paid",
    "orderId": "shop_01KKW..."
  }
}
```

A quote failure uses a top-level error:

```json
{
  "session_id": "ses_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "failed",
  "transactions": [],
  "error": {
    "code": "MERCHANT_CHECKOUT_FAILED",
    "message": "The merchant could not complete the checkout."
  },
  "shop_pay": {
    "status": "failed"
  }
}
```

For quote mode, `shop_pay.status: "paid"` maps to top-level `completed`. `"failed"`, `"prepare_failed"`, and `"needs_human"` map to top-level `failed` with stable errors. `"pending"`, `"prepared"`, `"unknown"`, and other nonterminal merchant states never fabricate success; callers continue polling while the top-level status remains `pending` or `processing`.

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `session_id` | `string` | Session identifier |
| `order_id` | `string \| null` | Order identifier |
| `status` | `string` | `"pending"`, `"processing"`, `"awaiting_result"`, `"completed"`, or `"failed"` |
| `transactions` | `array` | Custom-mode transaction rows; empty before a transaction exists and throughout quote-mode checkout |
| `error` | `object \| undefined` | Top-level terminal error, especially for quote-backed checkout |
| `shop_pay` | `object \| null` | Quote checkout state: `{ status, orderId?, code?, message? }`; `null` for custom mode |

### Status Semantics

The custom-mode column below describes checkout sessions, not authorize-only `mandate_setup`.

| Top-level status | Custom mode | Quote mode |
|------------------|-------------|------------|
| `pending` | Nothing has started yet; continue polling | Quote checkout has not produced a transaction yet; continue polling |
| `processing` | Transaction exists but credentials are not ready; continue polling | Merchant checkout is nonterminal; continue polling with credentials suppressed |
| `awaiting_result` | Complete line-item credentials are actionable. Charge once, then report `APPROVED` or `DECLINED` | Not exposed while Core owns quote checkout |
| `completed` | Processor outcome was already confirmed; may be observed on a retry after `report-status` | Merchant checkout succeeded; `transactions` may be empty |
| `failed` | Terminal; inspect top-level `error` first, then transaction errors | Terminal; inspect top-level `error` and `shop_pay` |

Credential fields are nullable. Treat custom `awaiting_result` as actionable only when `token`, `dynamic_cvv`, `expiry_month`, and `expiry_year` are all non-null. If they are incomplete, do not charge; continue bounded polling or surface an integration error.

Before an order exists, the exact top-level shape is:

```json
{
  "session_id": "ses_01KKW...",
  "order_id": null,
  "status": "pending",
  "transactions": [],
  "shop_pay": null
}
```

### Transaction Object

| Field | Type | Description |
|-------|------|-------------|
| `txn_id` | `string` | Unique transaction identifier |
| `status` | `string` | Transaction lifecycle value; custom credentials are normally exposed when this is `"awaiting_result"` |
| `line_items` | `array` | One entry per merchant in the purchase context |
| `error` | `object \| undefined` | Present if `status` is `"failed"` — `{ code: string, message: string }` |

### Line Item Object

| Field | Type | Description |
|-------|------|-------------|
| `txn_ref_id` | `string` | Stable line item ID — use it for `report-status`, a durable unique payment-attempt claim, and the processor idempotency anchor |
| `merchant_name` | `string` | Merchant name from purchase context |
| `merchant_url` | `string` | Merchant URL from purchase context |
| `total_amount` | `string` | Line item total |
| `status` | `string` | Line item status |
| `token` | `string \| null` | **Visa network token** (16 digits) — not the user's real card number |
| `dynamic_cvv` | `string \| null` | **One-time CVV** (3 digits) — changes per transaction |
| `expiry_month` | `string \| null` | Token expiry month (2-digit MM, e.g., `"12"`) |
| `expiry_year` | `string \| null` | Token expiry year (4-digit YYYY, e.g., `"2027"`) |
| `products` | `array` | Products in this line item |

### Polling Pattern

Poll on the server with a bounded timeout. The stopping rule depends on the purchase-context mode:

```typescript
type PollOutcome =
  | { kind: 'credential'; lineItem: any }
  | { kind: 'quote_completed'; result: any };

async function pollPaymentResult(
  sessionId: string,
  mode: 'custom' | 'quote',
): Promise<PollOutcome> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(
      `${BACKEND_URL}/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`,
      {
        headers: { Authorization: `Bearer ${MERCHANT_SECRET_KEY}` },
        cache: 'no-store',
      }
    );
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message ?? `Payment-result failed (HTTP ${res.status})`);
    }

    if (data.status === 'failed') {
      throw new Error(
        data.error?.message ??
        data.transactions?.find((txn: any) => txn.error)?.error?.message ??
        'Payment failed'
      );
    }

    if (mode === 'quote' && data.status === 'completed') {
      return { kind: 'quote_completed', result: data };
    }

    if (mode === 'custom' && data.status === 'awaiting_result') {
      const lineItem = data.transactions?.flatMap((txn: any) => txn.line_items ?? [])
        .find((item: any) =>
          item.token &&
          item.dynamic_cvv &&
          item.expiry_month &&
          item.expiry_year
        );
      if (lineItem) return { kind: 'credential', lineItem };
    }

    await new Promise(r => setTimeout(r, 3000)); // 3s interval
  }
  throw new Error('Polling timed out');
}
```

For quote mode, do not read `transactions[0]`: Core suppresses quote credentials and terminal responses can have `transactions: []`. For custom mode, do not send the credential to a processor until the trusted worker has atomically claimed `txn_ref_id` in durable storage and established a stable processor idempotency key. Persist the processor operation/reference and outcome. A retry after a crash must query or replay that same idempotent operation, then report the stored outcome; it must never create a second charge.

### Error Responses

| Status | Meaning |
|--------|---------|
| `404` | Session not found |
| `401` | Invalid or missing secret key |

### cURL Example

```bash
curl -s https://sandbox.api.prava.space/v1/sessions/{session_id}/payment-result \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" | jq
```

---

## Validate Session (Internal)

### `GET /v1/sessions/validate`

> ⚠️ **This endpoint is used internally by the Prava iframe.** Merchants do not need to call this directly. To get payment results, use `GET /v1/sessions/{id}/payment-result` instead.

Validates a session token and returns session details.

### Authentication

```
Authorization: Bearer {session_token}
```

### Success Response (200)

```json
{
  "valid": true,
  "merchant_account_id": "ma_xxx",
  "customer_id": "cust_xxx",
  "external_user_id": "user_123",
  "expires_at": "2026-03-16T15:30:00.000Z",
  "allowed_domains": ["https://myaiapp.com"],
  "customer_email": "user@example.com",
  "customer_phone": null,
  "callback_url": "https://myaiapp.com/success"
}
```

---

## Report Payment Outcome

### `POST /v1/sessions/{session_id}/report-status`

After your server charges an ordinary **custom-mode checkout** credential, you **must** report either approval or decline so Prava can relay the result through the card-network confirmation flow. Do not call this endpoint for quote mode or authorize-only `mandate_setup`. Quote checkout is owned by Core; later mandate charges use `POST /v1/mandates/{id}/charges/{txnId}/report`.

`txn_status` must be derived from the **actual server-side payment processor response**. Never accept an approval/decline assertion from browser code, an SDK callback, redirect/query parameters, or other client-controlled input.

### Authentication

```
Authorization: Bearer {MERCHANT_SECRET_KEY}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txn_ref_id` | `string` | ✅ | Transaction line item ID from `payment-result` response (`line_items[].txn_ref_id`) |
| `txn_status` | `string` | ✅ | `"APPROVED"` or `"DECLINED"` |
| `txn_type` | `string` | | Only `"PURCHASE"`; defaults to `"PURCHASE"` |
| `authorization_code` | `string` | | Max 128 chars. Auth code from your payment processor |
| `response_code` | `string` | | Max 2 chars. Processor response code |
| `amount_paid` | `string` | | Actual amount charged (if different from order amount) |
| `product_statuses` | `array` | | Per-product status updates |
| `product_statuses[].product_id` | `string` | Conditional | External product ID, max 50 chars; each entry must contain this or `product_ref_id` |
| `product_statuses[].product_ref_id` | `string` | Conditional | Product ref ID from `payment-result`, max 50 chars; each entry must contain this or `product_id` |
| `product_statuses[].status` | `string` | ✅ | `"COMPLETED"`, `"FAILED"`, `"CANCELED"`, `"INPROGRESS"`, `"PENDING"`, or `"ONHOLD"` |
| `product_statuses[].amount_paid` | `string` | | Amount paid for that product |

Exact minimal body:

```json
{
  "txn_ref_id": "tli_01KKW...",
  "txn_status": "APPROVED"
}
```

Report `DECLINED` outcomes too. Skipping either outcome leaves a custom transaction in `awaiting_result`.

### Success Response (200)

```json
{
  "status": "confirmed",
  "txn_ref_id": "tli_01KKW...",
  "txn_status": "APPROVED",
  "visa_confirmation": "SUCCESS"
}
```

### cURL Example

```bash
curl -X POST "https://sandbox.api.prava.space/v1/sessions/ses_01KKW.../report-status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -d '{
    "txn_ref_id": "tli_01KKW...",
    "txn_status": "APPROVED",
    "txn_type": "PURCHASE",
    "authorization_code": "AUTH123",
    "response_code": "00",
    "amount_paid": "99.99",
    "product_statuses": [
      {
        "product_ref_id": "ref_01KKW...",
        "status": "COMPLETED",
        "amount_paid": "99.99"
      }
    ]
  }'
```

---

## List Customer's Saved Cards

### `GET /v1/listCards`

Retrieve saved cards for a customer. Useful for showing card-on-file before creating a session.

### Authentication

```
Authorization: Bearer {MERCHANT_SECRET_KEY}
```

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | `string` | ✅ | The `user_id` you used when creating sessions for this customer |
| `status` | `string` | | `"active"` (default) or `"all"` |
| `include_card_art` | `string` | | `"true"` or `"false"` (default). Include card art URLs |

### Success Response (200)

```json
{
  "cards": [
    {
      "card_id": "card_01KKW...",
      "card_last4": "1111",
      "card_brand": "VISA",
      "card_exp_month": 12,
      "card_exp_year": 26,
      "masked_card_number": "4111...1111",
      "status": "active",
      "created_at": "2026-04-16T..."
    }
  ],
  "count": 1
}
```

### cURL Example

```bash
curl "https://sandbox.api.prava.space/v1/listCards?customer_id=user_123" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY"
```

> **Tip:** Use `card_id` from this response in the `card.card_id` field when creating a session to pre-select a saved card.

---

## Revoke Session

### `POST /v1/sessions/:id/revoke`

Revokes an active session (for example, explicit Cancel, user logout, or timeout). A browser must call an authenticated application-server route that verifies the session belongs to the current application user; do not expose a blind revoke proxy keyed only by browser-supplied `session_id`. Close/reset the local UI only after revocation succeeds.

### Authentication

```
Authorization: Bearer {MERCHANT_SECRET_KEY}
```

### Success Response (200)

```json
{
  "success": true
}
```

---

## Health Check

### `GET /health`

Check if the Prava backend is online.

```json
{
  "status": "ok",
  "timestamp": "2026-03-16T15:00:00.000Z"
}
```

Use this in your integration to verify connectivity:

```typescript
const isHealthy = await fetch(`${BACKEND_URL}/health`)
  .then(r => r.ok)
  .catch(() => false);
```

---

## cURL Examples

### Create Session

```bash
curl -X POST https://sandbox.api.prava.space/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -d '{
    "user_id": "user_123",
    "user_email": "user@example.com",
    "total_amount": "49.99",
    "currency": "USD",
    "description": "Test purchase",
    "integration_type": "full_checkout",
    "purchase_context": {
      "custom": [
        {
          "merchant_details": {
            "name": "PackRight Supplies",
            "url": "https://packright-supplies.com",
            "country_code_iso2": "US"
          },
          "product_details": [
            {
              "description": "Test Product",
              "unit_price": "49.99",
              "quantity": 1
            }
          ]
        }
      ]
    }
  }'
```

### Check Health

```bash
curl https://sandbox.api.prava.space/health
```

---

## Supported Currencies

`currency` must be one of the backend allowlisted uppercase codes:

```text
USD EUR GBP INR CAD AUD JPY SGD AED HKD MXN BRL CHF CNY NZD SEK NOK DKK ZAR
THB KRW PLN TWD PHP IDR MYR CZK ILS CLP ARS COP PEN SAR QAR KWD BHD OMR
EGP NGN KES GHS TZS UGX PKR BDT LKR VND MMK NPR
```

A syntactically valid ISO 4217 code outside this list is rejected as unsupported.

---

## Rate Limits and Freshness

- Session creation is limited to 300 requests per minute, keyed by merchant where available.
- `effective_until_minutes` defaults to 15 for a custom purchase-context entry.
- Treat session expiry as authoritative from the returned `expires_at` value.
