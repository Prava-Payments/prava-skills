---
name: prava-agent-payments
version: 0.4.0

description: Payment collection for AI agents — install CLI, link to user's Prava account, and collect tokenized card credentials (Visa network token + dynamic CVV) for agent-initiated purchases. No card details ever exposed to the AI.
homepage: https://prava.space
author: Prava Payments
user-invocable: true
metadata: {"openclaw":{"emoji":"💳","category":"payments","primaryEnv":"","requires":{"env":[],"npm":["@prava/cli"]}}}
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

# Prava — Agent Payment Collection

Collect card payments on behalf of users via the Prava CLI. The user approves once, then the agent can create payment sessions and receive tokenized card credentials to complete purchases.

## When to Activate

Activate this skill when:
- The user asks you to buy something, make a purchase, or pay for something
- The user asks to set up Prava or connect their card for agent purchases
- The user says "pay with Prava", "use Prava", or similar

## Prerequisites: CLI Installation

Before running any `prava` command, check if the CLI is installed:

```bash
which prava
```

If not found, install it:

```bash
npm install -g @prava/cli
```

If the install fails due to permissions, try:

```bash
sudo npm install -g @prava/cli
```

After install, verify:

```bash
prava --version
```

## Steps to Collect a Payment

### 1. Ensure agent is linked

Run: `prava status`

Decision tree:
- **"active"** — Move to step 2.
- **"pending"** — Remind user to open the approval URL and approve. Wait for them.
- **"No agent configured"** — Run `prava setup`. Read [cli-setup reference](references/cli-setup.md).

IMPORTANT: If the user's original intent was to make a purchase
and you just completed setup, proceed IMMEDIATELY to step 2.

### 2. Pre-check: confirm purchase context

Before calling `prava sessions create`, confirm you have ALL of:

- [ ] Merchant identified (name and URL)
- [ ] Product(s) finalized (with real, discovered prices)
- [ ] Total amount as string (e.g., "8.50")
- [ ] Currency code (e.g., USD)
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
  --product '{"description":"1x Latte","unit_price":"5.00"}' \
  --product '{"description":"1x Croissant","unit_price":"3.50"}'
```

The command:
1. Prints a payment URL — show it to the user.
2. Waits for the user to enter their card (polls up to 10 minutes).
3. Returns tokenized card credentials.

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

## Important: This is a Payment Subroutine

Steps 1-4 are a SINGLE unbreakable sequence within the larger purchase flow.
The user's original intent (e.g., "buy coffee") must not be interrupted.

## CLI Quick Reference

```bash
prava setup --name "<name>" [--description "<desc>"]
prava status
prava sessions create --total-amount <amt> --currency <CUR> --merchant-name "<name>" --merchant-url "<url>" --merchant-country <XX> --product '<json>' [--product ...]
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

If you see a version error, run: `npm update -g @prava/cli`

## Anti-Patterns

- Running `sessions create` before agent is linked (check `prava status` first).
- Running `sessions create` before completing purchase discovery.
- Guessing or hallucinating amount, currency, or purchase context.
- Asking user for keys, card numbers, or credentials. The CLI handles all auth locally.
- Pausing between receiving credentials and completing checkout.
- Running `setup` when already linked (harmless — exits 0, but unnecessary).

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
