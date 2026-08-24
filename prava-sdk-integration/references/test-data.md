# Prava Test Data

Use this data when testing in the **sandbox** environment.

---

## Sandbox Backend URL

```
https://sandbox.api.prava.space
```

> Production is `https://api.prava.space` — `sk_test_` keys only work against the sandbox URL.

Use an allowlisted currency. The current list is:

```text
USD EUR GBP INR CAD AUD JPY SGD AED HKD MXN BRL CHF CNY NZD SEK NOK DKK ZAR
THB KRW PLN TWD PHP IDR MYR CZK ILS CLP ARS COP PEN SAR QAR KWD BHD OMR
EGP NGN KES GHS TZS UGX PKR BDT LKR VND MMK NPR
```

---

## Test Card Numbers

**Network test cards are provided by the Prava team** for your sandbox environment. Reach out to your Prava account manager or the Prava team during onboarding to receive your test card details.

Once you have your test card, the details will follow this format:

| Field | Format |
|-------|--------|
| Card Number | 16-digit card number provided by Prava |
| Expiry Date | Future date (e.g., `12/28`) |
| CVV | 3-digit code provided with the test card |

---

## Test OTP (Device Binding)

The **first** purchase from a new browser/device triggers device binding: the card issuer sends a one-time code before passkey registration.

```
456789
```

Enter this code on the OTP screen with any test card. Real codes only exist in production. Repeat purchases on the same browser skip the OTP.

---

## Credential Format

### Publishable Key (Client-Side)
- **Sandbox**: starts with `pk_test_`
- **Production**: starts with `pk_live_`
- Placeholder: `pk_test_YOUR_PUBLISHABLE_KEY`

### Secret Key (Server-Side ONLY)
- **Sandbox**: starts with `sk_test_`
- **Production**: starts with `sk_live_`
- Placeholder: `sk_test_YOUR_SECRET_KEY`

⚠️ **Never expose the secret key in client-side code!**

---

## Test Session Creation

Quick test with cURL:

```bash
curl -X POST https://sandbox.api.prava.space/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SK_TEST_KEY" \
  -d '{
    "user_id": "test_user_001",
    "user_email": "test@example.com",
    "total_amount": "9.99",
    "currency": "USD",
    "description": "Test checkout",
    "integration_type": "full_checkout",
    "purchase_context": {
      "custom": [
        {
          "merchant_details": {
            "name": "Test Store",
            "url": "https://example.com/catalog/test",
            "country_code_iso2": "US",
            "category_code": "5411",
            "category": "General"
          },
          "product_details": [
            {
              "product_id": "test-product-1",
              "description": "Test Product",
              "unit_price": "9.99",
              "quantity": 1
            }
          ],
          "effective_until_minutes": 15
        }
      ]
    }
  }'
```

The bare-array form of `purchase_context` is invalid. The URL above is accepted because `example.com` is a real ICANN domain; Prava stores it as the bare origin `https://example.com`.

Expected response:
```json
{
  "session_id": "ses_01KKW...",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://sandbox.collect.prava.space?session=ses_01KKW...",
  "order_id": "ord_01KKW...",
  "expires_at": "2026-03-16T15:30:00.000Z"
}
```

> **Important:** Store `session_id` — you'll need it to poll for the payment result via `GET /v1/sessions/{session_id}/payment-result`.
>
> Pass `iframe_url` verbatim. Its `session` query parameter is the `ses_...` session ID, not `session_token`.

---

## Quote-Mode Test Request

Use a real `quote_id` returned by the sandbox quote flow. The session amount and currency must exactly match that quote:

```json
{
  "user_id": "test_user_001",
  "user_email": "test@example.com",
  "total_amount": "9.99",
  "currency": "USD",
  "integration_type": "embedding",
  "purchase_context": {
    "quote": true,
    "quote_id": "qte_FROM_SANDBOX"
  }
}
```

Omit `access_grant` for a quote already owned by the authenticated Core caller. When present, it must use the exact grant returned by the quote flow and match `qag_<32 lowercase hex>.<43 base64url characters>`; do not fabricate it.

## Optional Mandate-Setup Test

Add this top-level block to a custom session when testing standing authorization:

```json
{
  "mandate_setup": {
    "intent": "mandate_setup",
    "recurring_frequency": "monthly",
    "max_charges": 3,
    "valid_until": "2027-08-21T00:00:00.000Z",
    "merchant_scope": "listed"
  }
}
```

Allowed frequencies are `one_time`, `weekly`, `monthly`, and `yearly`. `max_charges` must be an integer ≥ 1, and `merchant_scope` is `any` or `listed`. The current charge route stores but does not enforce `max_charges`; add a trusted application-side count gate when testing that promise. Recurring mandates use `valid_until`, while `one_time` setup uses a fixed seven-day network window.

This intent is authorize-only: it activates a mandate but emits no Session API payment credential. Do not run the payment-result/report-status test below for this setup. Resolve the active mandate server-side, then test later charges with the mandate charge and charge-report endpoints documented in the Session API reference.

---

## Test Ordinary Checkout Payment-Result Lifecycle

Poll on the server:

```bash
curl -s "https://sandbox.api.prava.space/v1/sessions/ses_01KKW.../payment-result" \
  -H "Authorization: Bearer YOUR_SK_TEST_KEY" | jq
```

- `pending` / `processing`: continue bounded polling.
- Custom `awaiting_result`: find a line item whose `token`, `dynamic_cvv`, `expiry_month`, and `expiry_year` are all non-null. Charge it once, then report the result.
- Custom `completed`: already confirmed; do not wait for this state before charging.
- Quote `completed` / `failed`: terminal, credentials remain suppressed, and `transactions` may be empty. Read top-level `error` and `shop_pay`.

Minimal custom-flow report:

```bash
curl -X POST "https://sandbox.api.prava.space/v1/sessions/ses_01KKW.../report-status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SK_TEST_KEY" \
  -d '{
    "txn_ref_id": "tli_FROM_PAYMENT_RESULT",
    "txn_status": "APPROVED"
  }'
```

Use `DECLINED` when the processor declines the charge. The full optional schema includes `txn_type: "PURCHASE"`, `authorization_code` (max 128), `response_code` (max 2), `amount_paid`, and `product_statuses` entries. Each product status requires `status` plus either `product_id` or `product_ref_id`; supported statuses are `COMPLETED`, `FAILED`, `CANCELED`, `INPROGRESS`, `PENDING`, and `ONHOLD`.

Only the server that called the payment processor may choose `APPROVED` or `DECLINED`. Never report a status supplied by the browser, an SDK callback, a redirect/query parameter, or another client-controlled assertion.

---

## Health Check

Verify the sandbox backend is online:

```bash
curl https://sandbox.api.prava.space/health
```

Expected:
```json
{
  "status": "ok",
  "timestamp": "2026-03-16T15:00:00.000Z"
}
```

---

## Common Test User IDs

You can use any string as `user_id`. Some suggestions:

| user_id | Description |
|---------|-------------|
| `test_user_001` | Generic test user |
| `ai_agent_demo` | For AI agent testing |
| `repeat_customer` | For testing repeat purchase flow |

---

## Passkey Testing

- Passkeys require a browser with **WebAuthn support**
- Supported: Chrome 80+, Safari 14+, Firefox 80+, Edge 80+
- In sandbox, the passkey flow works with actual biometric prompts
- Make sure you're testing on a device with biometric hardware (Face ID, Touch ID, fingerprint reader)
- If testing on desktop without biometric, use a security key or platform authenticator

---

## Troubleshooting Test Issues

| Issue | Fix |
|-------|-----|
| Session creation returns 401 | Check your secret key is correct and starts with `sk_test_` |
| Session creation returns 400 for `purchase_context` | Use `{ "custom": [...] }` or `{ "quote": true, "quote_id": "..." }`; a bare array is rejected |
| Merchant URL/email validation fails | Use public HTTPS on a real ICANN domain and an email on a routable ICANN domain; IPs and reserved TLDs are rejected |
| Currency is rejected | Use one of the allowlisted uppercase codes above |
| Iframe doesn't load | Pass the returned `iframe_url` verbatim; its `session` value must be `ses_...`, not the JWT |
| Passkey prompt doesn't appear | Ensure you're on HTTPS (or localhost) and using a supported browser |
| Card validation fails | Use the exact test card provided by the Prava team. Reach out to your Prava account manager if you don't have one |
| "Session expired" error | Sessions last ~15 mins. Create a fresh session |
| "Authentication Failed" on the checkout page | Usually an expired session, not an auth problem — create a fresh session |
| OTP screen appears | Device binding on a new browser/device — enter the sandbox test code `456789` |
| Polling appears stuck | Continue through `pending`/`processing`; custom credentials are actionable at `awaiting_result` and must then be reported |
