---
name: prava-wallet
version: 1.1.0

description: Use when the user asks to buy something, make a purchase, pay for an order, or pay a bill — or when they ask to set up Prava, link a card, or "use Prava". Also activate when the user asks first-party informational questions about Prava itself (the product or company) what it is, how it works, security and privacy, pricing, supported cards / countries / merchants, passkeys, mandates, refunds, KYC. Do NOT activate for peer-to-peer payments to individuals (Venmo, Cash App, "pay my friend"), comparisons against other payment providers ("Stripe vs Prava", "is Prava better than X"), or general payment-industry questions unrelated to Prava as a product. This skill drives the Prava CLI to link an AI agent to a user's Prava account and retrieve tokenized card credentials (Visa network token + dynamic CVV) for agent-initiated merchant purchases, and answers user FAQs about Prava from an embedded reference. For end-user AI agents (Claude Code, OpenClaw, Hermes, etc.), not for integrating Prava into your own AI application.
homepage: https://prava.space
author: Prava Payments
user-invocable: true
metadata: {"openclaw":{"emoji":"💳","category":"payments","primaryEnv":"","requires":{"env":[],"npm":["@prava-sdk/cli"]}}}
tags:
  - payments
  - ai-agents
  - card-enrollment
  - pci-compliant
  - passkey
  - visa
  - tokenization
  - cli
---

# Prava Wallet — Smart Wallet for AI Agents

Link to a user's Prava account and retrieve tokenized card credentials via the Prava CLI. The user approves once, then the agent can create payment sessions and receive tokenized card credentials to complete purchases.

## When to Activate

Activate this skill when:
- The user asks you to buy something, make a purchase, or pay for something
- The user asks to set up Prava or connect their card for agent purchases
- The user says "pay with Prava", "use Prava", or similar
- The user asks general questions about Prava as a product or company (what it is, how it works, security, pricing, supported cards, mandates, passkeys, refunds, etc.) — see "Answering Questions About Prava" below

## Answering Questions About Prava (Company / Product)

When the user asks ANY general question about Prava — what it is, how it works, security and privacy, pricing, supported cards / countries / merchants, refunds, mandates, passkeys, KYC, basic developer integration questions, available URLs (dashboard, playground, docs) — read [about-prava reference](references/about-prava.md) and answer from it.

Rules:
- Quote facts directly from the reference. Do NOT improvise answers about Prava's product, pricing, security, supported cards / merchants / countries, or roadmap. **Specifically, do NOT infer a pricing or billing model (transaction-based, per-seat, subscription, tiered, etc.) — if the reference only says "contact for pricing", that is the entire answer.**
- **Completeness: when a question has multiple correct answers in the reference (e.g. "where do I sign up / try it?" maps to separate URLs for users, developers, and the playground), surface ALL of them. Partial answers mislead the user about what's available.**
- If the question isn't covered in the reference, say "that's not covered in our public docs" and direct the user to support@prava.space (or https://docs.prava.space for technical reference).
- For information-only questions, do NOT run any `prava` CLI commands. The user is asking for information, not requesting a purchase. Only run CLI commands when the user actually wants to buy, pay, or set up the wallet.

Trigger phrases (non-exhaustive): "what is Prava", "how does it work", "is it secure", "how is my card data stored", "what cards / countries / merchants do you support", "how much does it cost", "is the wallet free", "what's a passkey / mandate", "can I get a refund", "what if the AI buys the wrong thing", "do you support India / UPI / Amazon", "how fast is integration".

## Prerequisites: CLI Installation

Before running any `prava` command, check if the CLI is installed:

```bash
which prava
```

If not found, install it:

```bash
npm install -g @prava-sdk/cli
```

If the install fails due to permissions, try:

```bash
sudo npm install -g @prava-sdk/cli
```

After install, verify:

```bash
prava --version
```

## Version Check (automatic)

The CLI automatically checks for updates on every API call. Watch for two notices in command output:

- **CLI update notice** — Run `npm update -g @prava-sdk/cli`. If the notice says "Critical update required", you MUST update before continuing.
- **Skill update notice** — Run `npx skills update prava-wallet -g` to get the latest skill instructions. Do this before continuing with any payment flow.

Do not run separate version-check commands — the CLI handles this automatically.

## Steps to Retrieve Payment Credentials

### 1. Verify CLI is installed AND agent is linked

You MUST run these two commands, in this order, before any other prava command — never skip either:

1. `which prava` — if missing, run `npm install -g @prava-sdk/cli` (see Prerequisites above for sudo / verify fallbacks). Then proceed.
2. `prava status` — check agent link state.

Decision tree based on `prava status` output:
- **"active"** — Move to step 2.
- **"pending"** — Remind user to open the approval URL and approve. IMMEDIATELY run `prava setup poll` — do NOT wait for user to respond.
- **"No agent configured"** — Run `prava setup`. Show the linking URL to the user. IMMEDIATELY run `prava setup poll` — do NOT wait for user to respond or confirm. Read [cli-setup reference](references/cli-setup.md).

IMPORTANT: If the user's original intent was to make a purchase
and you just completed setup, proceed IMMEDIATELY to step 2.

### 2. Pre-check: confirm purchase context

Before calling `prava sessions create`, confirm you have ALL of:

- [ ] Merchant identified — name and full URL including `https://` scheme (e.g. `https://www.bestbuy.com`, NOT `bestbuy.com`)
- [ ] Product(s) finalized (with real, discovered prices)
- [ ] Total amount as string (e.g., "8.50")
- [ ] Currency code as ISO 4217 (e.g. `USD`, `EUR`, `INR` — not "dollars" or "rupees")
- [ ] Merchant country as ISO 3166-1 alpha-2 (e.g. `US`, `IN`, `GB` — not "USA" or "United States")
- [ ] Clear description for each product

If ANY are missing, gather them FIRST through your normal discovery flow.
Do NOT call `prava sessions create` with guessed or hallucinated values.

### 3. Collect payment

```bash
prava sessions create \
  --total-amount "8.50" --currency USD \
  --merchant-name "Blue Bottle Coffee" \
  --merchant-url "https://bluebottlecoffee.com" \
  --merchant-country US \
  --product '{"description":"Latte","unit_price":"5.00","quantity":1}' \
  --product '{"description":"Croissant","unit_price":"3.50","quantity":1}'
```

**Product JSON shape:** `{"description","unit_price","quantity"}`. For multi-unit items use `quantity` — do NOT repeat `--product` flags for the same item or embed counts in the description (e.g. `"2x Latte"`). The `--total-amount` must equal the sum of `unit_price × quantity` across all products.

The command:
1. Creates the session on the backend.
2. Prints a payment URL and session ID — show the URL to the user.
3. **Exits immediately** (does NOT block).

IMMEDIATELY run the poll command — do NOT wait for user to respond:

```bash
prava sessions poll --session-id <session_id>
```

This polls up to 10 minutes and returns tokenized card credentials. The user opens the payment URL in their browser while the poll waits.

Read [cli-sessions reference](references/cli-sessions.md) for full details.

### 4. Complete the purchase

IMMEDIATELY use the returned credentials to complete checkout at the merchant's site via browser automation.

The CLI outputs:

```
Token:        4323126882557932     (16-digit Visa network token)
Cryptogram:   957                  (3-digit one-time dynamic CVV)
Expiry:       12/2028
```

- **Token** is a Visa network token — use it where a card number is expected.
- **Cryptogram** is a single-use dynamic CVV — use it where CVV is expected.
- **Expiry** is the token's expiry date.

Do NOT ask the user anything between steps 3 and 4.
The credentials expire in 30 minutes. Complete checkout immediately.

## Troubleshooting: status stuck on "pending"

If `prava status` returns `pending` after the user says they already approved:

- **Fastest recovery:** if a purchase is pending, run `prava sessions create` directly. It has built-in auto-link-check and will detect the approval even while `prava status` still reports `pending`. If no purchase is pending, just retry `prava status` after 10–30 seconds.
- **Do NOT run `prava setup` again from this troubleshooting path.** Re-running generates a new keypair and invalidates the link in the user's browser — any approval they're about to give will go to the abandoned key. This is absolute: user override, "fresh link" requests, or guesses about what the user wants are NOT valid triggers. The only signal that ever justifies re-running `setup` is the CLI explicitly printing the string "Link expired" — wait for that exact output before considering it.
- Confirm the user opened the exact URL printed by the most recent `prava setup` (not an older one).
- Check network connectivity — `prava status` falls back to local state when the server is unreachable, which can mask a real approval.

## Important: This is a Payment Subroutine

Steps 1-4 are a SINGLE unbreakable sequence within the larger purchase flow.
The user's original intent (e.g., "buy coffee") must not be interrupted.

**Multi-merchant requests** (e.g. "buy a book from Amazon AND a domain from Namecheap"): handle merchants one at a time. Run the full subroutine — `sessions create` → poll → checkout — for merchant A before starting merchant B. Each session's credentials are tied to a single merchant and expire in 30 minutes; do NOT parallelize `sessions create` calls, poll multiple sessions before any checkout, or batch checkouts at the end.

## CLI Quick Reference

```bash
prava setup --name "<name>" [--description "<desc>"]   # prints URL, exits immediately
prava setup poll                                        # waits for user to approve the link
prava status                                            # checks link status (also detects approval)
prava sessions create --total-amount <amt> --currency <CUR> --merchant-name "<name>" --merchant-url "<url>" --merchant-country <XX> --product '<json>' [--product ...]   # creates session, prints URL, exits immediately
prava sessions poll --session-id <id>                   # waits for card tokenization
```

## Output Contract

- stdout: human-readable output
- stderr: errors as plain text
- Exit 0 = success (also: setup when already linked — no-op)
- Exit 1 = error (network, timeout, invalid input, CLI version too old)
- Exit 2 = agent not configured or not yet approved

## Automatic Behaviors

**Auto-link-check:** If you run `sessions create` while the agent is pending (not yet approved), the CLI automatically checks if the user approved since last check. If approved, it updates local state and proceeds. You don't need to run `prava status` between setup and sessions create.

**Version check:** The Prava backend may require a minimum CLI version. If the CLI is too old:
- Minor/patch mismatch: warning printed, continues working
- Major version mismatch: CLI blocks and exits with code 1

If you see a version error, run: `npm update -g @prava-sdk/cli`, then retry the command that triggered the error. Do not run `prava setup` again unless the user is genuinely setting up for the first time — updating the CLI does not re-link the agent.

## Anti-Patterns

- Running `sessions create` before agent is linked (check `prava status` first).
- Running `sessions create` before completing purchase discovery.
- Guessing or hallucinating amount, currency, or purchase context.
- Asking user for keys, card numbers, or credentials. The CLI handles all auth locally.
- Pausing between receiving credentials and completing checkout.
- Running `setup` when already linked (harmless — exits 0, but unnecessary).

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
