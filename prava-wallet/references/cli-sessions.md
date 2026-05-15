# CLI Sessions — Collect Card Payment

Create a payment session. The user enters their card on a secure
Prava page. The CLI returns tokenized card credentials for the agent
to complete checkout at the merchant.

## Prerequisites

1. Agent must be linked. Check with `prava status`.
2. You MUST have all purchase context before calling this command:
   - Merchant identified (name and URL)
   - Product(s) finalized with real, discovered prices
   - Total amount
   - Currency code
   - Clear description for each product

If any are missing, complete discovery first. Do NOT guess values.
The user sees the amount and description on the payment page —
wrong values cause the user to abandon and the session times out.

## Command

```bash
prava sessions create \
  --total-amount <amount> \
  --currency <CUR> \
  --merchant-name "<name>" \
  --merchant-url "<url>" \
  --merchant-country <XX> \
  --product '<json>' [--product '<json>' ...]
```

- `--total-amount` (required) — Total as string (e.g., "8.50").
- `--currency` (required) — ISO 4217 uppercase (USD, EUR, GBP).
- `--merchant-name` (required) — Merchant display name.
- `--merchant-url` (required) — Merchant website URL.
- `--merchant-country` (required) — 2-char country code (US, IN, GB).
- `--product` (required, repeatable) — JSON per product:
  `{"description":"...","unit_price":"...","quantity":1}`

## Examples

### Single product

```bash
prava sessions create \
  --total-amount "5.00" --currency USD \
  --merchant-name "Blue Bottle Coffee" \
  --merchant-url "https://bluebottlecoffee.com" \
  --merchant-country US \
  --product '{"description":"1x Latte","unit_price":"5.00"}'
```

### Multiple products

```bash
prava sessions create \
  --total-amount "8.50" --currency USD \
  --merchant-name "Blue Bottle Coffee" \
  --merchant-url "https://bluebottlecoffee.com" \
  --merchant-country US \
  --product '{"description":"1x Latte","unit_price":"5.00"}' \
  --product '{"description":"1x Croissant","unit_price":"3.50"}'
```

### Output (sessions create)

```
Session created.
Session ID: ses_abc123
Payment URL: https://collect.prava.space?session=eyJhbGciOiJI...

Share this URL to complete card entry.
Run `prava sessions poll --session-id ses_abc123` to wait for card entry.
```

Show the payment URL to the user, then IMMEDIATELY run the poll command — do NOT wait for the user to respond:

```bash
prava sessions poll --session-id ses_abc123
```

The user opens the payment URL in their browser while the poll waits.

### Output (sessions poll)

```
Waiting for card entry on session ses_abc123...
............

Card tokenized.

Token:        4323126882557932
Cryptogram:   957
Expiry:       12/2028
```

**Output fields:**

| Field | Format | Description |
|-------|--------|-------------|
| Token | 16-digit number | Visa network token — use where card number is expected |
| Cryptogram | 3-digit number | One-time dynamic CVV — use where CVV is expected |
| Expiry | MM/YYYY | Token expiry date |

The payment URL contains a JWT session token. It will be a long URL — this is expected.

## Timeouts

- The CLI polls for up to **10 minutes** waiting for the user to complete card entry.
- If the user doesn't complete in time, the CLI exits with code 1 and prints "Session expired."
- The returned credentials (token + cryptogram) have a **30-minute TTL** after issuance.

## After tokenization

IMMEDIATELY use the token, cryptogram, and expiry to complete the
purchase at the merchant via browser automation.

Do NOT pause between receiving the credentials and completing checkout.

## Auto-link-check

If the agent hasn't been marked as linked locally but the user already
approved via the wallet URL, `sessions create` will automatically detect
the approval and proceed. You don't strictly need to run `prava status`
before `sessions create` — but it's good practice.

## Error Cases

| Scenario | Output | Exit Code |
|----------|--------|-----------|
| No agent configured | "No agent configured. Run: prava setup" | 2 |
| Agent not approved | "Agent not linked. Run: prava setup" | 2 |
| Invalid product JSON | "Invalid product JSON: ..." with expected format | 1 |
| No products provided | "At least one --product is required." | 1 |
| Session creation fails | "Failed to create session: ..." | 1 |
| Tokenization fails | "Tokenization failed." | 1 |
| Timeout (10 min) | "Session expired. Run `prava sessions create` again." | 1 |
| CLI version too old | "Critical update required..." | 1 |

## Anti-Patterns

- Creating sessions before completing purchase discovery.
- Guessing or hallucinating amount, currency, or purchase context.
- Creating sessions before agent is linked.
- Handling raw card numbers (Prava handles all card input).
- Pausing after receiving credentials.
