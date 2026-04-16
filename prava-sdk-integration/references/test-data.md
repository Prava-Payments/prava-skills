# Prava Test Data

Use this data when testing in the **sandbox** environment.

---

## Sandbox Backend URL

```
https://sandbox.api.prava.space
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

## Credential Format

### Publishable Key (Client-Side)
- **Sandbox**: starts with `pk_test_`
- **Production**: starts with `pk_live_`
- Example: `pk_test_TaFAJcKaldaFoXErIEHw03p_7lAhXY94D3RsXgLV_3s`

### Secret Key (Server-Side ONLY)
- **Sandbox**: starts with `sk_test_`
- **Production**: starts with `sk_live_`
- Example: `sk_test_zGzBj2QzZVaFtO4dkY2ZLAGe7wRSf1zgzUPBheBksA4`

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
    "purchase_context": [
      {
        "merchant_details": {
          "name": "Test Store",
          "url": "https://example.com",
          "country_code_iso2": "US",
          "category_code": "5411",
          "category": "General"
        },
        "product_details": [
          {
            "description": "Test Product",
            "unit_price": "9.99",
            "quantity": 1
          }
        ],
        "effective_until_minutes": 15
      }
    ]
  }'
```

Expected response:
```json
{
  "session_id": "sess_01KKW...",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://sandbox.collect.prava.space?session=eyJ...",
  "order_id": "ord_01KKW...",
  "expires_at": "2026-03-16T15:30:00.000Z"
}
```

> **Important:** Store `session_id` — you'll need it to poll for the payment result via `GET /v1/sessions/{session_id}/payment-result`.

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
| Iframe doesn't load | Verify `iframe_url` from session response; check browser console for errors |
| Passkey prompt doesn't appear | Ensure you're on HTTPS (or localhost) and using a supported browser |
| Card validation fails | Use the exact test card provided by the Prava team. Reach out to your Prava account manager if you don't have one |
| "Session expired" error | Sessions last ~15 mins. Create a fresh session |
