# Prava Skill Documentation Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Prava SDK skill documentation to match the current backend codebase — fix breaking field name mismatches, add missing endpoints, correct the payment-result response structure, and update PostMessage event tables.

**Architecture:** The skill repo has one main file (`SKILL.md`) that is the canonical source, plus `references/` (detailed API docs) and `templates/` (framework-specific code). Changes cascade: fix `SKILL.md` first, then references, then templates. Every file that sends `amount` to `POST /v1/sessions` needs to change to `total_amount`; every `product_details[].amount` needs to change to `unit_price`.

**Tech Stack:** Markdown, TypeScript (templates), HTML (vanilla template)

---

## File Map

**Files to modify:**

| File | Responsibility | What changes |
|------|---------------|-------------|
| `SKILL.md` | Canonical skill (quick ref + API ref + templates inline) | Field renames, new endpoints, new response shape, new events, version bump |
| `references/session-api-reference.md` | Detailed session API docs | Field renames, new `callback_url`/`card` fields, new `report-status` endpoint, new `listCards` endpoint, payment-result response restructure |
| `references/sdk-api-reference.md` | SDK types and PostMessage events | Add `PRAVA_REDIRECT` event, remove unimplemented commands, update version |
| `references/test-data.md` | Test cURL examples | Field renames in cURL (`amount` → `total_amount`, `amount` → `unit_price`) |
| `templates/nextjs/server-action.ts` | Next.js server action template | Field renames in request body + `PaymentTransaction` type update for `line_items` |
| `templates/express/session-route.ts` | Express route template | Field renames in request body |
| `templates/vanilla/integration.html` | Vanilla JS template | Field renames in request body |

---

### Task 1: Fix field names in `SKILL.md` quick reference block

**Files:**
- Modify: `SKILL.md:42-54`

- [ ] **Step 1: Replace `amount` with `total_amount` and `amount` with `unit_price` in the quick reference block**

In `SKILL.md`, find the quick reference session request shape (around line 43) and replace:

```
Session request shape (POST /v1/sessions):
  { user_id, user_email, amount, currency, description?,
    purchase_context: [{ merchant_details: { name, url, country_code_iso2, category_code?, category? },
                         product_details: [{ description, amount, quantity? }],
                         effective_until_minutes? }] }
```

Replace with:

```
Session request shape (POST /v1/sessions):
  { user_id, user_email, total_amount, currency, description?, callback_url?,
    purchase_context: [{ merchant_details: { name, url, country_code_iso2, category_code?, category? },
                         product_details: [{ description, unit_price, quantity? }],
                         effective_until_minutes? }] }
```

- [ ] **Step 2: Update the payment credential quick reference to show line_items nesting**

In `SKILL.md`, find the payment credential section (around line 50) and replace:

```
Payment credential (GET /v1/sessions/{id}/payment-result, status=completed):
  transactions[0].token         → Visa network token (16 digits, NOT real card number)
  transactions[0].dynamic_cvv   → one-time CVV (3 digits, changes per txn)
  transactions[0].expiry_month  → "12"
  transactions[0].expiry_year   → "2027"
```

Replace with:

```
Payment credential (GET /v1/sessions/{id}/payment-result, status=completed):
  transactions[0].line_items[0].token         → Visa network token (16 digits, NOT real card number)
  transactions[0].line_items[0].dynamic_cvv   → one-time CVV (3 digits, changes per txn)
  transactions[0].line_items[0].expiry_month  → "12"
  transactions[0].line_items[0].expiry_year   → "2027"
```

- [ ] **Step 3: Add `report-status` to the session lifecycle quick reference**

In `SKILL.md`, find the session lifecycle block (around line 31) and replace:

```
Session lifecycle (server-side, secret key):
  POST /v1/sessions                          → create session → returns session_id, session_token, iframe_url, order_id, expires_at
  GET  /v1/sessions/{session_id}/payment-result → poll for credential → returns token (16-digit Visa network token), dynamic_cvv, expiry_month, expiry_year
  POST /v1/sessions/{session_id}/revoke      → revoke active session
  GET  /health                               → backend health check
```

Replace with:

```
Session lifecycle (server-side, secret key):
  POST /v1/sessions                                    → create session → returns session_id, session_token, iframe_url, order_id, expires_at
  GET  /v1/sessions/{session_id}/payment-result        → poll for credential → returns transactions[].line_items[].token, dynamic_cvv, expiry_month, expiry_year
  POST /v1/sessions/{session_id}/report-status         → report payment outcome (APPROVED/DECLINED) back to Visa
  POST /v1/sessions/{session_id}/revoke                → revoke active session
  GET  /v1/listCards?customer_id={id}                  → list a customer's saved cards (with secret key)
  GET  /health                                         → backend health check
```

- [ ] **Step 4: Update version from 1.0.0 to match actual SDK version**

In `SKILL.md`, replace the version in the frontmatter (line 3):

```
version: 1.0.0
```

Replace with:

```
version: 0.2.0
```

Also replace the quick reference header (line 21):

```
PRAVA SDK QUICK REFERENCE v1.0.0
```

Replace with:

```
PRAVA SDK QUICK REFERENCE v0.2.0
```

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "fix: correct field names and add missing endpoints in quick reference"
```

---

### Task 2: Fix field names in `SKILL.md` Session API Reference section

**Files:**
- Modify: `SKILL.md:277-410`

- [ ] **Step 1: Fix the field reference table for session creation**

In `SKILL.md`, find the field reference table (around line 285-295) and replace:

```markdown
| `amount` | `string` | ✅ | `^\d+(\.\d{1,2})?$` | Transaction amount (e.g., `"99.99"`) |
```

Replace with:

```markdown
| `total_amount` | `string` | ✅ | `^\d+(\.\d{1,2})?$` | Transaction total amount (e.g., `"99.99"`) |
```

- [ ] **Step 2: Add `callback_url` and `card` fields to the field reference table**

After the `purchase_context` row in the table (around line 295), add these rows:

```markdown
| `callback_url` | `string` | | HTTPS URL, max 2048 chars | Redirect URL after payment completion — user is sent here when transaction finishes |
| `card` | `object` | | | Pre-select a saved card (skip card entry) |
| `card.card_id` | `string` | | | ID of a previously saved card |
| `card.vault_ref_id` | `string` | | Valid UUID | Merchant-provided encrypted card reference from Skyflow vault |
```

- [ ] **Step 3: Fix `product_details[].amount` → `unit_price` in the purchase context table**

In `SKILL.md`, find the purchase context table (around line 306-308) and replace:

```markdown
| `product_details[].amount` | `string` | ✅ | Product amount |
| `product_details[].quantity` | `number` | | Default: 1 |
```

Replace with:

```markdown
| `product_details[].unit_price` | `string` | ✅ | Product unit price |
| `product_details[].product_id` | `string` | | Max 50 chars. Your internal product ID |
| `product_details[].quantity` | `number` | | Default: 1 |
```

- [ ] **Step 4: Fix the cURL example**

In `SKILL.md`, find the cURL example (around line 334-358) and replace:

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

Replace with:

```bash
curl -X POST https://sandbox.api.prava.space/v1/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -d '{
    "user_id": "user_123",
    "user_email": "user@example.com",
    "total_amount": "49.99",
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
        "unit_price": "49.99",
        "quantity": 1
      }],
      "effective_until_minutes": 15
    }]
  }'
```

- [ ] **Step 5: Commit**

```bash
git add SKILL.md
git commit -m "fix: correct session creation field names and add callback_url/card fields"
```

---

### Task 3: Fix payment-result response and add report-status/listCards in `SKILL.md`

**Files:**
- Modify: `SKILL.md:361-420`

- [ ] **Step 1: Replace the payment-result response JSON and field table**

In `SKILL.md`, find the payment-result response (around line 368-393) and replace the entire response block and field table:

Old response JSON:
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

Replace with:

```json
{
  "session_id": "sess_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "completed",
  "transactions": [{
    "txn_id": "txn_01KKW...",
    "status": "completed",
    "line_items": [{
      "txn_ref_id": "tli_01KKW...",
      "merchant_name": "My AI App",
      "merchant_url": "https://myapp.com",
      "total_amount": "49.99",
      "status": "completed",
      "token": "4323126882557932",
      "dynamic_cvv": "957",
      "expiry_month": "12",
      "expiry_year": "2027",
      "products": [{
        "product_ref_id": "ref_01KKW...",
        "external_product_id": null,
        "name": "Premium Plan — Monthly",
        "unit_price": "49.99",
        "quantity": 1
      }]
    }]
  }]
}
```

Replace the old field table with:

```markdown
| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"pending"` → keep polling, `"awaiting_result"` → credential being generated, `"completed"` → credential ready, `"failed"` → error |
| `transactions[].txn_id` | `string` | Transaction identifier |
| `transactions[].status` | `string` | `"pending"`, `"awaiting_result"`, `"completed"`, or `"failed"` |
| `transactions[].line_items[]` | `array` | One entry per merchant in the purchase context |
| `transactions[].line_items[].txn_ref_id` | `string` | Transaction line item ID — **needed for `report-status`** |
| `transactions[].line_items[].merchant_name` | `string` | Merchant name from purchase context |
| `transactions[].line_items[].total_amount` | `string` | Line item total amount |
| `transactions[].line_items[].token` | `string \| null` | Visa network token (16 digits) — NOT the real card number |
| `transactions[].line_items[].dynamic_cvv` | `string \| null` | One-time CVV (3 digits) — changes per transaction |
| `transactions[].line_items[].expiry_month` | `string \| null` | Token expiry month (MM) |
| `transactions[].line_items[].expiry_year` | `string \| null` | Token expiry year (YYYY) |
| `transactions[].line_items[].products[]` | `array` | Products in this line item |
| `transactions[].error` | `object?` | Present if failed: `{ code, message }` |
```

- [ ] **Step 2: Update the inline polling code in Step 6**

In `SKILL.md`, find the polling code snippet (around line 256-262) and replace:

```typescript
// data.status: "pending" | "completed" | "failed"
// data.transactions[0].token         → Visa network token (16 digits)
// data.transactions[0].dynamic_cvv   → one-time CVV (3 digits)
// data.transactions[0].expiry_month  → "12"
// data.transactions[0].expiry_year   → "2027"
```

Replace with:

```typescript
// data.status: "pending" | "awaiting_result" | "completed" | "failed"
// data.transactions[0].line_items[0].token         → Visa network token (16 digits)
// data.transactions[0].line_items[0].dynamic_cvv   → one-time CVV (3 digits)
// data.transactions[0].line_items[0].expiry_month  → "12"
// data.transactions[0].line_items[0].expiry_year   → "2027"
```

- [ ] **Step 3: Add report-status endpoint section after the revoke section**

In `SKILL.md`, after the revoke endpoint section (around line 415), add:

```markdown
### `POST /v1/sessions/{session_id}/report-status` — Report Payment Outcome

After your server processes the payment credential (network token + dynamic CVV), you **must** report the outcome back so Prava can relay it to Visa.

**Auth:** `Authorization: Bearer {MERCHANT_SECRET_KEY}`

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `txn_ref_id` | `string` | ✅ | Transaction line item ID from `payment-result` response (`line_items[].txn_ref_id`) |
| `txn_status` | `string` | ✅ | `"APPROVED"` or `"DECLINED"` |
| `txn_type` | `string` | | Default: `"PURCHASE"` |
| `authorization_code` | `string` | | Max 128 chars. Auth code from your payment processor |
| `response_code` | `string` | | Max 2 chars. Processor response code |
| `amount_paid` | `string` | | Actual amount charged (if different from order amount) |
| `product_statuses` | `array` | | Per-product status updates |
| `product_statuses[].product_ref_id` | `string` | | Product ref ID from payment-result |
| `product_statuses[].status` | `string` | | `"COMPLETED"`, `"FAILED"`, `"CANCELED"`, `"INPROGRESS"`, `"PENDING"`, `"ONHOLD"` |

**Response (200):**

```json
{
  "status": "confirmed",
  "txn_ref_id": "tli_01KKW...",
  "txn_status": "APPROVED",
  "visa_confirmation": "SUCCESS"
}
```

**cURL Example:**

```bash
curl -X POST "https://sandbox.api.prava.space/v1/sessions/sess_01KKW.../report-status" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY" \
  -d '{
    "txn_ref_id": "tli_01KKW...",
    "txn_status": "APPROVED",
    "authorization_code": "AUTH123"
  }'
```

### `GET /v1/listCards` — List Customer's Saved Cards

Retrieve saved cards for a customer. Useful for showing card-on-file before creating a session.

**Auth:** `Authorization: Bearer {MERCHANT_SECRET_KEY}`

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `customer_id` | `string` | ✅ | The `user_id` you used when creating sessions for this customer |
| `status` | `string` | | `"active"` (default) or `"all"` |
| `include_card_art` | `string` | | `"true"` or `"false"` (default). Include card art URLs |

**Response (200):**

```json
{
  "cards": [{
    "card_id": "card_01KKW...",
    "card_last4": "1111",
    "card_brand": "VISA",
    "card_exp_month": 12,
    "card_exp_year": 26,
    "masked_card_number": "4111...1111",
    "status": "active",
    "created_at": "2026-04-16T..."
  }],
  "count": 1
}
```

**cURL Example:**

```bash
curl "https://sandbox.api.prava.space/v1/listCards?customer_id=user_123" \
  -H "Authorization: Bearer sk_test_YOUR_SECRET_KEY"
```

> **Tip:** Use `card_id` from this response in the `card.card_id` field when creating a session to pre-select a saved card.
```

- [ ] **Step 4: Commit**

```bash
git add SKILL.md
git commit -m "fix: update payment-result response structure, add report-status and listCards endpoints"
```

---

### Task 4: Update PostMessage events in `SKILL.md`

**Files:**
- Modify: `SKILL.md:540-566`

- [ ] **Step 1: Add `PRAVA_REDIRECT` to iframe → SDK events table and remove unimplemented commands**

In `SKILL.md`, find the PostMessage events tables (around line 542-566).

Replace the "Iframe → SDK" table:

```markdown
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
```

Replace with:

```markdown
| Event | Payload | Description |
|-------|---------|-------------|
| `PRAVA_READY` | — | Iframe loaded and ready |
| `PRAVA_CHANGE` | `CardValidationState` | Validation changed |
| `PRAVA_ERROR` | `PravaError` | Error occurred |
| `PRAVA_RESIZE` | `{ height }` | Iframe requests height change |
| `PRAVA_ENROLLMENT_COMPLETE` | Enrollment data | Full enrollment completed |
| `PRAVA_SAVED_CARDS_LOADED` | Cards list | Saved cards loaded (repeat flow) |
| `PRAVA_TRANSACTION_CREATED` | Transaction data | Transaction created |
| `PRAVA_TRANSACTION_COMPLETE` | `{ callback_url?: string }` | Payment completed. If `callback_url` present, SDK keeps bridge alive for redirect |
| `PRAVA_REDIRECT` | `{ url: string }` | Iframe requests redirect to merchant callback URL — SDK navigates via `window.location.href` |
```

Replace the "SDK → Iframe" table:

```markdown
| Command | Description |
|---------|-------------|
| `PRAVA_INIT` | Initialize with publishableKey + styles |
| `PRAVA_SUBMIT` | Trigger form submission |
| `PRAVA_FOCUS` | Focus a specific field |
| `PRAVA_CLEAR` | Clear form fields |
| `PRAVA_PASSKEY_VERIFY_COMPLETE` | Passkey verification result |
| `PRAVA_PASSKEY_VERIFY_FAILED` | Passkey verification failed |
```

Replace with:

```markdown
| Command | Description |
|---------|-------------|
| `PRAVA_INIT` | Initialize iframe with publishableKey + styles |
| `PRAVA_PASSKEY_VERIFY_COMPLETE` | Send passkey verification result (assuranceData) to iframe |
| `PRAVA_PASSKEY_VERIFY_FAILED` | Notify iframe that passkey verification failed |
```

- [ ] **Step 2: Commit**

```bash
git add SKILL.md
git commit -m "fix: update PostMessage events — add PRAVA_REDIRECT, remove unimplemented commands"
```

---

### Task 5: Fix inline template code in `SKILL.md`

**Files:**
- Modify: `SKILL.md:629-1005` (all inline template code blocks)

- [ ] **Step 1: Fix field names in the Next.js server action template (inline in SKILL.md)**

In `SKILL.md`, find the `createPravaSession` function body (around line 695-731). Replace all occurrences of:

1. The `CreateSessionParams` interface's `amount` field:
   ```typescript
   amount?: string;
   ```
   Replace with:
   ```typescript
   totalAmount?: string;
   ```

2. The `product_details` type in `purchaseContext`:
   ```typescript
   product_details: Array<{
     description: string;
     amount: string;
     quantity?: number;
   }>;
   ```
   Replace with:
   ```typescript
   product_details: Array<{
     description: string;
     unit_price: string;
     quantity?: number;
   }>;
   ```

3. The function signature default:
   ```typescript
   amount = '99.99',
   ```
   Replace with:
   ```typescript
   totalAmount = '99.99',
   ```

4. The request body:
   ```typescript
   amount,
   ```
   Replace with:
   ```typescript
   total_amount: totalAmount,
   ```

5. The product_details default:
   ```typescript
   amount: amount,
   ```
   Replace with:
   ```typescript
   unit_price: totalAmount,
   ```

- [ ] **Step 2: Update the `PaymentTransaction` interface for line_items**

In `SKILL.md`, find the `PaymentTransaction` interface (around line 645-653) and replace:

```typescript
export interface PaymentTransaction {
  txn_id: string;
  status: 'completed' | 'failed' | string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  error?: { code: string; message: string };
}
```

Replace with:

```typescript
export interface PaymentLineItem {
  txn_ref_id: string;
  merchant_name: string;
  merchant_url: string;
  total_amount: string;
  status: string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  products: Array<{
    product_ref_id: string;
    external_product_id: string | null;
    name: string;
    unit_price: string;
    quantity: number;
  }>;
}

export interface PaymentTransaction {
  txn_id: string;
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
  line_items: PaymentLineItem[];
  error?: { code: string; message: string };
}
```

- [ ] **Step 3: Update `PaymentResultResponse` status union**

In `SKILL.md`, find:

```typescript
status: 'pending' | 'completed' | 'failed' | string;
```

Replace with:

```typescript
status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
```

- [ ] **Step 4: Update the checkout page's `completedTxn` access pattern**

In `SKILL.md`, find in the checkout page template (around line 922):

```typescript
const completedTxn: PaymentTransaction | null = isCompleted ? paymentResult.transactions[0] ?? null : null;
```

Replace with:

```typescript
const completedTxn = isCompleted ? paymentResult.transactions[0] ?? null : null;
const completedLineItem = completedTxn?.line_items?.[0] ?? null;
```

Then find the credential display section (around line 987-990):

```tsx
<p>Network Token: {completedTxn.token}</p>
<p>Dynamic CVV: {completedTxn.dynamic_cvv}</p>
<p>Expiry: {completedTxn.expiry_month}/{completedTxn.expiry_year}</p>
```

Replace with:

```tsx
<p>Network Token: {completedLineItem?.token}</p>
<p>Dynamic CVV: {completedLineItem?.dynamic_cvv}</p>
<p>Expiry: {completedLineItem?.expiry_month}/{completedLineItem?.expiry_year}</p>
```

- [ ] **Step 5: Fix field names in the inline Express template**

In `SKILL.md`, find the Express route inline template (around line 1035-1048). Replace:

```typescript
amount,
```
with:
```typescript
total_amount: amount,
```

Replace in product_details:
```typescript
product_details: [{ description: description || 'Purchase', amount, quantity: 1 }],
```
with:
```typescript
product_details: [{ description: description || 'Purchase', unit_price: amount, quantity: 1 }],
```

- [ ] **Step 6: Fix field names in the inline Vanilla JS template**

In `SKILL.md`, find the Vanilla JS inline template (around line 1147-1153). Replace:

```typescript
amount: '49.99', currency: 'USD', description: 'Demo checkout',
```
with:
```typescript
total_amount: '49.99', currency: 'USD', description: 'Demo checkout',
```

Replace in product_details:
```typescript
product_details: [{ description: 'Test Product', amount: '49.99', quantity: 1 }],
```
with:
```typescript
product_details: [{ description: 'Test Product', unit_price: '49.99', quantity: 1 }],
```

- [ ] **Step 7: Commit**

```bash
git add SKILL.md
git commit -m "fix: update all inline template code with correct field names and response types"
```

---

### Task 6: Update `references/session-api-reference.md`

**Files:**
- Modify: `references/session-api-reference.md`

- [ ] **Step 1: Fix field names in request body JSON example**

In `references/session-api-reference.md`, find the request body JSON (around line 30-56). Replace:

```json
  "amount": "99.99",
```
with:
```json
  "total_amount": "99.99",
```

Replace in product_details:
```json
          "amount": "99.99",
```
with:
```json
          "unit_price": "99.99",
```

- [ ] **Step 2: Fix the field reference table**

Replace row (around line 67):
```markdown
| `amount` | `string` | ✅ | Regex: `^\d+(\.\d{1,2})?$` | Transaction amount (e.g., "99.99") |
```
with:
```markdown
| `total_amount` | `string` | ✅ | Regex: `^\d+(\.\d{1,2})?$` | Transaction total amount (e.g., "99.99") |
| `callback_url` | `string` | | HTTPS URL, max 2048 chars | Redirect URL after payment completion |
| `card` | `object` | | | Pre-select a saved card (skip card entry) |
| `card.card_id` | `string` | | | ID of a previously saved card |
| `card.vault_ref_id` | `string` | | Valid UUID | Encrypted card reference from Skyflow vault |
```

Replace in purchase context table (around line 87-88):
```markdown
| `product_details[].amount` | `string` | ✅ | Product amount |
| `product_details[].quantity` | `number` | | Default: 1 |
```
with:
```markdown
| `product_details[].unit_price` | `string` | ✅ | Product unit price |
| `product_details[].product_id` | `string` | | Max 50 chars. Your internal product ID |
| `product_details[].quantity` | `number` | | Default: 1 |
```

- [ ] **Step 3: Fix the error response example field name**

In `references/session-api-reference.md`, find (around line 140):
```json
        "amount": ["Must be a valid amount (e.g., \"99.99\")"],
```
Replace with:
```json
        "total_amount": ["Must be a valid amount (e.g., \"99.99\")"],
```

- [ ] **Step 4: Fix the payment-result response**

Replace the response JSON (around line 182-197) with the nested `line_items` structure:

```json
{
  "session_id": "sess_01KKW...",
  "order_id": "ord_01KKW...",
  "status": "completed",
  "transactions": [
    {
      "txn_id": "txn_01KKW...",
      "status": "completed",
      "line_items": [
        {
          "txn_ref_id": "tli_01KKW...",
          "merchant_name": "My AI App",
          "merchant_url": "https://myapp.com",
          "total_amount": "99.99",
          "status": "completed",
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
  ]
}
```

Replace the response fields table (around line 200-219) with:

```markdown
| Field | Type | Description |
|-------|------|-------------|
| `session_id` | `string` | Session identifier |
| `order_id` | `string \| null` | Order identifier |
| `status` | `string` | `"pending"`, `"awaiting_result"`, `"completed"`, or `"failed"` |
| `transactions` | `array` | Array of transaction objects |

### Transaction Object

| Field | Type | Description |
|-------|------|-------------|
| `txn_id` | `string` | Unique transaction identifier |
| `status` | `string` | `"pending"`, `"awaiting_result"`, `"completed"`, or `"failed"` |
| `line_items` | `array` | One entry per merchant in the purchase context |
| `error` | `object \| undefined` | Present if `status` is `"failed"` — `{ code: string, message: string }` |

### Line Item Object

| Field | Type | Description |
|-------|------|-------------|
| `txn_ref_id` | `string` | Line item ID — **use this for `report-status`** |
| `merchant_name` | `string` | Merchant name from purchase context |
| `merchant_url` | `string` | Merchant URL from purchase context |
| `total_amount` | `string` | Line item total |
| `status` | `string` | Line item status |
| `token` | `string \| null` | **Visa network token** (16 digits) — not the user's real card number |
| `dynamic_cvv` | `string \| null` | **One-time CVV** (3 digits) — changes per transaction |
| `expiry_month` | `string \| null` | Token expiry month (MM) |
| `expiry_year` | `string \| null` | Token expiry year (YYYY) |
| `products` | `array` | Products in this line item |
```

- [ ] **Step 5: Update the polling code example**

In `references/session-api-reference.md`, find the polling code (around line 235):
```typescript
    if (data.status === 'completed') return data.transactions[0];
```
Replace with:
```typescript
    if (data.status === 'completed') return data.transactions[0].line_items[0];
```

- [ ] **Step 6: Fix the cURL example**

In `references/session-api-reference.md`, find the cURL example (around line 341-366). Replace `"amount"` with `"total_amount"` and `"amount"` (in product_details) with `"unit_price"`.

- [ ] **Step 7: Add report-status and listCards sections**

After the Revoke Session section (around line 310), add the same `report-status` and `listCards` docs as written in Task 3 Step 3.

- [ ] **Step 8: Add `callback_url` to the validate session response**

In `references/session-api-reference.md`, find the validate session response (around line 276-287) and add to the JSON:
```json
  "callback_url": "https://merchant.com/success"
```

- [ ] **Step 9: Commit**

```bash
git add references/session-api-reference.md
git commit -m "fix: update session API reference with correct fields and new endpoints"
```

---

### Task 7: Update `references/sdk-api-reference.md`

**Files:**
- Modify: `references/sdk-api-reference.md`

- [ ] **Step 1: Update the PostMessage events tables**

In `references/sdk-api-reference.md`, find the "Iframe → SDK Events" table (around line 183-194) and replace with the corrected table from Task 4 Step 1 (adding `PRAVA_REDIRECT`, removing `PRAVA_SUCCESS` and `PRAVA_PASSKEY_VERIFY_REQUIRED`).

Find the "SDK → Iframe Commands" table (around line 198-205) and replace with the corrected table from Task 4 Step 1 (removing `PRAVA_SUBMIT`, `PRAVA_FOCUS`, `PRAVA_CLEAR`).

- [ ] **Step 2: Commit**

```bash
git add references/sdk-api-reference.md
git commit -m "fix: update SDK PostMessage events — add PRAVA_REDIRECT, remove unimplemented"
```

---

### Task 8: Update `references/test-data.md`

**Files:**
- Modify: `references/test-data.md`

- [ ] **Step 1: Fix field names in the test cURL example**

In `references/test-data.md`, find the cURL example (around line 50-78). Replace:

```json
    "amount": "9.99",
```
with:
```json
    "total_amount": "9.99",
```

Replace in product_details:
```json
            "amount": "9.99",
```
with:
```json
            "unit_price": "9.99",
```

- [ ] **Step 2: Commit**

```bash
git add references/test-data.md
git commit -m "fix: correct field names in test cURL example"
```

---

### Task 9: Update `templates/nextjs/server-action.ts`

**Files:**
- Modify: `templates/nextjs/server-action.ts`

- [ ] **Step 1: Update the `PaymentTransaction` interface**

In `templates/nextjs/server-action.ts`, replace the `PaymentTransaction` interface (lines 30-38):

```typescript
export interface PaymentTransaction {
  txn_id: string;
  status: 'completed' | 'failed' | string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  error?: { code: string; message: string };
}
```

Replace with:

```typescript
export interface PaymentLineItem {
  txn_ref_id: string;
  merchant_name: string;
  merchant_url: string;
  total_amount: string;
  status: string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
  products: Array<{
    product_ref_id: string;
    external_product_id: string | null;
    name: string;
    unit_price: string;
    quantity: number;
  }>;
}

export interface PaymentTransaction {
  txn_id: string;
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
  line_items: PaymentLineItem[];
  error?: { code: string; message: string };
}
```

- [ ] **Step 2: Update `PaymentResultResponse` status**

Replace:
```typescript
  status: 'pending' | 'completed' | 'failed' | string;
```
with:
```typescript
  status: 'pending' | 'awaiting_result' | 'completed' | 'failed' | string;
```

- [ ] **Step 3: Fix `CreateSessionParams` and request body field names**

Replace in the interface (around line 52-53):
```typescript
  amount?: string;
```
with:
```typescript
  totalAmount?: string;
```

Replace in the purchaseContext type (around line 68):
```typescript
      amount: string;
```
with:
```typescript
      unit_price: string;
```

Replace in the function signature (around line 87):
```typescript
  amount = '99.99', currency = 'USD', description, purchaseContext,
```
with:
```typescript
  totalAmount = '99.99', currency = 'USD', description, purchaseContext,
```

Replace in the JSON body (around line 110):
```typescript
      amount,
```
with:
```typescript
      total_amount: totalAmount,
```

Replace in default product_details (around line 125):
```typescript
              amount: amount,
```
with:
```typescript
              unit_price: totalAmount,
```

- [ ] **Step 4: Commit**

```bash
git add templates/nextjs/server-action.ts
git commit -m "fix: correct field names and response types in Next.js server action template"
```

---

### Task 10: Update `templates/express/session-route.ts`

**Files:**
- Modify: `templates/express/session-route.ts`

- [ ] **Step 1: Fix field names in the request body**

In `templates/express/session-route.ts`, find the JSON.stringify body (around line 78-103). Replace:

```typescript
        amount,
```
with:
```typescript
        total_amount: amount,
```

Replace in product_details (around line 95-96):
```typescript
                amount: amount,
```
with:
```typescript
                unit_price: amount,
```

- [ ] **Step 2: Commit**

```bash
git add templates/express/session-route.ts
git commit -m "fix: correct field names in Express session route template"
```

---

### Task 11: Update `templates/vanilla/integration.html`

**Files:**
- Modify: `templates/vanilla/integration.html`

- [ ] **Step 1: Fix field names in the createSession function**

In `templates/vanilla/integration.html`, find the request body (around line 197-217). Replace:

```javascript
          amount: '49.99',
```
with:
```javascript
          total_amount: '49.99',
```

Replace in product_details (around line 212):
```javascript
              amount: '49.99',
```
with:
```javascript
              unit_price: '49.99',
```

- [ ] **Step 2: Commit**

```bash
git add templates/vanilla/integration.html
git commit -m "fix: correct field names in Vanilla JS integration template"
```

---

### Task 12: Final review pass

**Files:**
- All modified files

- [ ] **Step 1: Grep for any remaining `"amount"` that should be `"total_amount"`**

Run: `grep -rn '"amount"' . --include='*.md' --include='*.ts' --include='*.tsx' --include='*.html' | grep -v node_modules | grep -v '.git'`

Any match in a session creation request body that still says `"amount"` needs to be fixed. Matches in `product_details` context should say `"unit_price"`, not `"amount"`.

- [ ] **Step 2: Grep for any remaining flat `transactions[0].token` patterns**

Run: `grep -rn 'transactions\[0\]\.token\|transactions\[0\]\.dynamic_cvv' . --include='*.md' --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v '.git'`

All should now use `transactions[0].line_items[0].token` pattern.

- [ ] **Step 3: Verify no broken markdown tables**

Skim each modified `.md` file to ensure table columns are aligned and no rows are missing pipes.

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: final review pass — catch any remaining field name mismatches"
```
