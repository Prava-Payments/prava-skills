# `prava shop` — command reference

Product discovery + checkout through the wallet. Every command is agent-signed (uses the linked
agent from `~/.prava/agent.json`) and sent to the wallet at `PRAVA_DASHBOARD_URL`
(default `https://pay.prava.space`; for local testing set `PRAVA_WALLET_URL` / `PRAVA_DASHBOARD_URL`
to e.g. `http://localhost:3004`).

Output is **curated** by default — only the fields needed to decide and to chain the next call.
Add `--json` to any command to get the raw passthrough (for capturing an id or cursor).

Exit codes: `0` success · `1` error / declined · `2` agent not linked.

---

## `prava shop search`

Search products across all merchants (or one, with `--merchant`).

| Flag | Req | Notes |
|------|-----|-------|
| `--query <text>` | ✓ | Tight keyword terms, e.g. `"dark roast coffee"` |
| `--intent <text>` | | The user's full NL request (occasion, recipient, budget phrasing). Sent to UCP as buyer intent (`catalog.context.intent`) for better ranking. ≤500 chars |
| `--limit <n>` | | Max results (default 10, max 50) |
| `--cursor <c>` | | Next-page cursor from a previous search's "More results" line |
| `--merchant <domain>` | | Restrict to one merchant domain |
| `--ships-to <country>` | | ISO 3166-1 alpha-2 destination (e.g. `US`) |
| `--json` | | Raw JSON (`results[]`, `next_cursor`, `has_more`) |

Curated output: numbered list of `title · price · merchant` + `product-id` per row, and — when more
exist — a ready-to-run next-page command with `--cursor`. **Pagination is cursor-based**: pass the
printed cursor verbatim; it is opaque (not an offset/page number).

```bash
prava shop search --query "coffee" --intent "a smooth medium roast for pour-over, gift for a friend" --limit 5
prava shop search --query "coffee" --cursor eyJvZmZzZXQiOjUs…   # next page
```

## `prava shop product`

Show a product's variants so you can choose one.

| Flag | Req | Notes |
|------|-----|-------|
| `--product-id <id>` | ✓ | `product-id` from a search result |
| `--merchant <domain>` | | Merchant domain from the search result (pass it; some ids need it) |
| `--json` | | Raw JSON (`product.variants[]` with `priceAmount` in cents, etc.) |

Curated output: merchant + short description, then each variant as `label — $price [options]
(availability)` + `variant-id`.

```bash
prava shop product --product-id "gid://shopify/p/3oFy…" --merchant bonescoffee.com
```

## `prava shop quote`

Price a specific variant and open a checkout session. **This spins a real browser on the merchant —
expect ~15–30s.** Quotes expire in ~5 minutes.

| Flag | Req | Notes |
|------|-----|-------|
| `--variant-id <id>` | ✓ | `variant-id` from product details |
| `--merchant <domain>` | ✓ | Merchant domain |
| `--quantity <n>` | | Default 1 (max 10) |
| `--email <email>` | | Buyer email (optional; demo defaults one) |
| `--retries <n>` | | Retry on timeout/5xx (default 1; `0` disables). Safe — quote only opens a session |
| `-y, --yes` | | **Required (non-interactive):** confirms the seller/variant. Without it, `quote` refuses (exit 2). In a TTY, prompts `[y/N]` instead. Pass only after the user confirmed |
| `--json` | | Raw JSON (full price breakdown, shipping options, etc.) |

Curated output: total, a one-line `subtotal + shipping + tax` breakdown, selected shipping, expiry,
and the `checkout-session-id` to pay against.

```bash
prava shop quote --variant-id "gid://shopify/ProductVariant/1555…" --merchant bonescoffee.com --yes
```

## `prava shop checkout`

Pay for a quoted checkout session with a tokenized card. Get the token + cryptogram from
`prava sessions create` → (user approves) → `prava sessions poll` for the quote's exact total.
The wallet binds the charge to the quoted amount — you do **not** pass an amount here.

| Flag | Req | Notes |
|------|-----|-------|
| `--checkout-session-id <cs>` | ✓ | From `quote` |
| `--token <token>` | ✓ | Network token from `sessions poll` |
| `--cryptogram <crypt>` | ✓ | Dynamic CVV from `sessions poll` |
| `--expiry-month <MM>` | | Card expiry month |
| `--expiry-year <YYYY>` | | Card expiry year |
| `--cardholder-name <name>` | | Optional |
| `-y, --yes` | | **Required (non-interactive):** confirms the charge. Without it, `checkout` refuses (exit 2). In a TTY, prompts `[y/N]`. Pass only after the user approved the total |
| `--json` | | Raw JSON |

Outcomes:
- **`✓ Paid`** (exit 0) — prints amount + order id.
- **Declined / failed** (exit 1) — prints the reason (e.g. "captcha required"). The session is
  terminal; re-`quote` to try again.
- **Already processed** (exit 1, "no new charge") — idempotent replay of a prior terminal result.
- **Expired** (exit 1) — quote lapsed; re-`quote`.

```bash
prava shop checkout --checkout-session-id checkout_7d5b… \
  --token 4111111111111111 --cryptogram 957 --expiry-month 12 --expiry-year 2028 --yes
```

---

## Full flow

```bash
prava shop search  --query "coffee" --intent "<the user's full request>"
prava shop product --product-id "<id>" --merchant <m>     # STOP — user confirms the seller/variant
prava shop quote   --variant-id "<vid>" --merchant <m> --yes
# → mint a card session for the quoted total, user approves, poll for the token:
prava sessions create --total-amount "<total>" --currency USD --merchant-name "<m>" \
  --merchant-url "https://<m>" --merchant-country US \
  --product '{"description":"<title>","unit_price":"<total>","quantity":1}'
prava sessions poll --session-id <id>
prava shop checkout --checkout-session-id "<cs>" --token <t> --cryptogram <c> \
  --expiry-month <MM> --expiry-year <YYYY> --yes
```
