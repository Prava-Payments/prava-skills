# Prava Session API Reference

The Session API is the server-side entry point for every Prava payment flow. Your backend calls this endpoint to create a session, which returns the `session_token` and `iframe_url` needed for the frontend.

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

### Request Body

```json
{
  "user_id": "user_123",
  "user_email": "user@example.com",
  "amount": "99.99",
  "currency": "USD",
  "description": "AI-assisted purchase",
  "purchase_context": [
    {
      "merchant_details": {
        "name": "My AI App",
        "url": "https://myaiapp.com",
        "country_code_iso2": "US",
        "category_code": "5734",
        "category": "Software Services"
      },
      "product_details": [
        {
          "description": "Premium AI Assistant - Monthly",
          "amount": "99.99",
          "quantity": 1
        }
      ],
      "effective_until_minutes": 15
    }
  ]
}
```

### Field Reference

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| `user_id` | `string` | ✅ | 1-255 chars | Your app's unique identifier for the user |
| `user_email` | `string` | ✅ | Valid email | User's email address |
| `user_phone` | `string` | | Min 1 char | User's phone number |
| `user_country_code_iso2` | `string` | | 2 uppercase letters | User's country (ISO 3166-1 alpha-2, e.g., "US") |
| `amount` | `string` | ✅ | Regex: `^\d+(\.\d{1,2})?$` | Transaction amount (e.g., "99.99") |
| `currency` | `string` | ✅ | 3 uppercase letters (ISO 4217) | Currency code (e.g., "USD", "EUR", "GBP") |
| `external_order_ref` | `string` | | Max 255 chars | Your internal order reference ID |
| `description` | `string` | | | Order description |
| `purchase_context` | `array` | ✅ | Min 1 entry | Purchase context array (see below) |

### Purchase Context Entry

Each entry in `purchase_context` describes a merchant and their products:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `merchant_details` | `object` | ✅ | Merchant information |
| `merchant_details.name` | `string` | ✅ | Merchant/app name |
| `merchant_details.url` | `string` | ✅ | Merchant website URL (must be valid URL) |
| `merchant_details.country_code_iso2` | `string` | ✅ | 2 uppercase letters (ISO 3166-1 alpha-2) |
| `merchant_details.category_code` | `string` | | MCC code (max 10 chars) |
| `merchant_details.category` | `string` | | Human-readable category (max 100 chars) |
| `product_details` | `array` | ✅ | At least one product |
| `product_details[].description` | `string` | ✅ | Product description |
| `product_details[].amount` | `string` | ✅ | Product amount |
| `product_details[].quantity` | `number` | | Default: 1 |
| `effective_until_minutes` | `number` | | Default: 15. How long this context is valid |

### Success Response (201 Created)

```json
{
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://collect.prava.space",
  "order_id": "ord_abc123def456",
  "expires_at": "2026-03-16T15:30:00.000Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `session_token` | `string` | JWT session token — pass this to the frontend SDK or as a URL parameter |
| `iframe_url` | `string` | The URL to open/embed — this is the PCI-compliant card enrollment page |
| `order_id` | `string` | Unique order identifier for tracking |
| `expires_at` | `string` | ISO 8601 timestamp when the session expires |

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
        "amount": ["Must be a valid amount (e.g., \"99.99\")"],
        "currency": ["Must be 3 uppercase letters (ISO 4217, e.g., \"USD\")"]
      }
    }
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

## Validate Session

### `GET /v1/sessions/validate`

Validates a session token and returns session details. Used internally by the iframe.

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
  "customer_phone": null
}
```

---

## Revoke Session

### `POST /v1/sessions/:id/revoke`

Revokes an active session (e.g., on user logout or timeout).

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
    "amount": "49.99",
    "currency": "USD",
    "description": "Test purchase",
    "purchase_context": [
      {
        "merchant_details": {
          "name": "My App",
          "url": "https://myapp.com",
          "country_code_iso2": "US"
        },
        "product_details": [
          {
            "description": "Test Product",
            "amount": "49.99",
            "quantity": 1
          }
        ]
      }
    ]
  }'
```

### Check Health

```bash
curl https://sandbox.api.prava.space/health
```

---

## Supported Currencies

The `currency` field must be a valid ISO 4217 3-letter code. Common examples:

| Code | Currency |
|------|----------|
| `USD` | US Dollar |
| `EUR` | Euro |
| `GBP` | British Pound |
| `INR` | Indian Rupee |
| `CAD` | Canadian Dollar |
| `AUD` | Australian Dollar |
| `JPY` | Japanese Yen |

---

## Rate Limits

- Session creation: Reasonable use (no hard limit in sandbox)
- Sessions expire after the configured TTL (default: 15 minutes)
- Each session is single-use — once a card is enrolled, the session is consumed
