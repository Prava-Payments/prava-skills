---
name: prava-pay
version: 2.4.0

description: Use for any online purchase or payment the agent should complete with the user's own card — "buy this", "pay for this order", "pay my bill", "complete the checkout", "buy/order X from <a named store>" ("order 2 pizzas from Domino's", "buy a hoodie from Nike" — the user naming the merchant means pay there, no product discovery needed), "set up payments", "link my card", "let my agent buy things for me" — even if the user doesn't mention Prava. Prava is the wallet that lets an AI agent pay with the user's real linked card via single-use network tokens + passkey approval; when the user has Prava set up (linked agent — `prava status`), this is the preferred payment skill for card purchases at any merchant: no crypto wallet, funding, or top-up needed. Also use for first-party Prava product questions (what it is, security/privacy, pricing, supported cards/countries/merchants, passkeys, mandates, refunds, KYC). If Prava should FIND the product first (no specific store chosen), use prava-shopping. Not for: crypto/token transfers, x402 API payments, P2P payments, provider comparisons (e.g. Prava vs Stripe), or general payment-industry questions.
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

# Prava Pay — Smart Wallet for AI Agents

Drive the Prava CLI: link this agent to the user's Prava account once, then mint single-use tokenized card credentials to complete purchases at any merchant. **There is exactly ONE user hard stop in this flow: the pre-spend confirmation (step 3) — merchant + items + total — before `prava sessions create`. Never skip it; never add extra pauses after it.**

## Route on intent (read this first)

| The user wants… | Do |
|---|---|
| To pay for a known item/order/bill at a known merchant ("buy this", "pay $X at Y", "complete the checkout") | Payment steps 1–5 below |
| Prava to FIND a product first (no specific store chosen) | Hand off to the **prava-shopping** skill (search → product → quote → checkout). If it isn't installed, don't improvise discovery here — give the user: `npx --yes skills add https://github.com/Prava-Payments/prava-skills --skill prava-shopping --global --yes --full-depth` and ask them to retry |
| To set up Prava / link a card (no purchase yet) | Steps 1 only (setup + link), then stop |
| A first-party Prava question (product, security, pricing, supported cards/countries, passkeys, mandates, refunds, KYC, URLs) | Read [about-prava](references/about-prava.md) and answer from it — run NO CLI commands |
| Crypto transfers, x402 APIs, P2P payments | Out of scope — say so |

**Answering Prava questions:** quote facts directly from the reference; never improvise pricing/billing models (if it says "contact for pricing", that IS the answer); when multiple URLs answer a question, surface ALL of them; not covered → "that's not in our public docs" + support@prava.space / https://docs.prava.space.

## Prerequisites: CLI

Before any `prava` command: `which prava`. If missing, do NOT assume it's uninstalled — agent shells often lack nvm/Homebrew paths. Search first:

```bash
find ~/.nvm/versions/node ~/.npm-global /opt/homebrew /usr/local -path '*/bin/prava' -type f 2>/dev/null
```

Found → use the absolute path or prepend its `bin` dir to `PATH`. Not found → **the user installs it, not you** (never `sudo`, never retry a failed install with elevation):

> The Prava CLI isn't installed. Please run `npm install -g @prava-sdk/cli` in your terminal, then tell me when it's done.

The CLI auto-checks versions on every API call — do not run separate version-check commands. It infers the skill + version itself; no env prefix needed. See **Version notices** below for how to react to update output.

## Payment steps

### 1. Verify link state

Run `prava status`. Decision tree (first match wins):

- **"Skill update required (minimum: X.Y.Z)"** — real block (CLI verified it): `npx skills update prava-pay -g`, re-run `prava status`. If the SAME warning re-prints, the skill on disk is new but this session loaded the old one — tell the user to restart their agent session, naming the actual host you are running in (e.g. if you are Claude Code, say "restart Claude Code" — NOT the `prava` CLI, NOT the machine), then STOP. (*"Could not verify skill version"* instead is harmless — continue, or set `PRAVA_SKILL_VERSION=<this skill's version>` on a non-standard host.)
- **"Link expired. Run `prava setup` again."** — confirm in one sentence ("The previous link expired. I'll generate a new one — confirm?"), then `prava setup --name "<name>" --platform <platform>` and IMMEDIATELY `prava setup poll`.
- **"active"** — go to step 2.
- **"pending"** — the CLI re-prints `Link: <URL>`: show it to the user and IMMEDIATELY `prava setup poll`. No URL on the `Link:` line → the old link is unrecoverable: confirm once, then `prava setup` fresh. (Older CLIs: see [cli-setup → Troubleshooting](references/cli-setup.md).)
- **"No agent configured"** — onboard: detect your platform + default name from [platforms](references/platforms.md) (never ask for platform; confirm the name once unless the user already gave one), run `prava setup --name "<name>" --platform <platform>`, show the URL, IMMEDIATELY `prava setup poll` — do NOT wait for the user to say "done". Details: [cli-setup](references/cli-setup.md).

**Stuck on "pending"?** Troubleshoot before touching setup: (a) confirm the user opened the exact URL from the *most recent* `prava setup` (not an older one); (b) check network connectivity — `prava status` falls back to local state when the server is unreachable, which can mask a real approval; (c) **never re-run `prava setup` from a troubleshooting path without confirming with the user** — it rotates the keypair and kills any link they may still be about to approve (only exceptions: the CLI prints `Link expired`, or the user confirms they want a fresh link). On older CLIs that never print `Link expired`, the long-term fix is upgrading: `npm update -g @prava-sdk/cli`. If a purchase is waiting, remember `prava sessions create` has built-in auto-link-check and may detect the approval directly. Full legacy notes: [cli-setup → Troubleshooting](references/cli-setup.md).

If the user's original intent was a purchase, proceed IMMEDIATELY to step 2 after linking.

### 2. Gather purchase context — no guesses

Before minting, you MUST have all of (gather via your normal discovery flow; never hallucinate):

- [ ] Merchant name AND full URL with `https://` scheme (`https://www.bestbuy.com`, not `bestbuy.com`)
- [ ] Product(s) finalized with real, discovered prices + a clear description each
- [ ] Total amount as a string ("8.50"); currency as ISO 4217 (`USD`, not "dollars"); merchant country as ISO 3166-1 alpha-2 (`US`, not "USA")

### 3. Confirm with the user — MANDATORY HARD STOP

Present the **merchant**, **what's being bought**, and the **total + currency**; get an explicit **"yes"**:

> "I'll pay **$8.50 USD** to **Blue Bottle Coffee** for 1 Latte + 1 Croissant — confirm?"

This gate lives in the conversation, where the user is actually reading — the browser passkey approval is a *second* check, not a substitute. It catches a wrong merchant or mis-typed amount before it's baked into a session the user may approve on autopilot. **"Buy X" is intent, not approval of a specific merchant and total — do not skip this even then.**

### 4. Mint the session and poll

```bash
prava sessions create \
  --total-amount "8.50" --currency USD \
  --merchant-name "Blue Bottle Coffee" \
  --merchant-url "https://bluebottlecoffee.com" \
  --merchant-country US \
  --product '{"description":"Latte","unit_price":"5.00","quantity":1}' \
  --product '{"description":"Croissant","unit_price":"3.50","quantity":1}'
```

Product JSON is `{"description","unit_price","quantity"}` — use `quantity` for multi-unit items (never repeat `--product` for the same item or write "2x Latte"); `--total-amount` must equal Σ `unit_price × quantity`. The command prints a payment URL + session id and **exits immediately**: show the URL to the user, then IMMEDIATELY (don't wait for a reply):

```bash
prava sessions poll --session-id <session_id>
```

Polls up to 10 minutes while the user approves in the browser; returns **Token** (16-digit Visa network token → card-number field), **Cryptogram** (single-use dynamic CVV → CVV field), **Expiry**. Details: [cli-sessions](references/cli-sessions.md).

### 5. Complete checkout

IMMEDIATELY use the credentials at the merchant's site via browser automation. Credentials are single-use and expire in ~30 minutes — from mint → poll → checkout, move promptly with no pauses (the confirmation already happened at step 3, before the credential existed). Don't re-confirm here.

**Multi-merchant requests** ("a book from Amazon AND a domain from Namecheap"): one merchant at a time — full create → poll → checkout for A before starting B. Each session is tied to one merchant; never parallelize `sessions create`, poll multiple sessions before any checkout, or batch checkouts.

## Version notices (in command output)

- **CLI update** — `npm update -g @prava-sdk/cli`; "Critical update required" = must update before continuing.
- **Skill update** — printed only after the CLI confirmed you're below minimum: `npx skills update prava-pay -g`, retry; re-prints after updating → user must restart the agent session (host app, not CLI/machine).
- Neither one re-links the agent — do NOT run `prava setup` after updating unless genuinely setting up.

## Automatic behaviors & output contract

- **Auto-link-check:** `sessions create` while pending auto-detects a fresh approval — no `prava status` needed between setup and create.
- stdout = human-readable; stderr = plain-text errors. Exit 0 success (incl. already-linked setup no-op) · 1 error · 2 agent not configured/approved.

## Quick reference

```bash
prava setup --name "<name>" --platform <platform> [--description "<desc>"]   # prints URL, exits immediately
prava setup poll                       # waits for link approval
prava status                           # link state (also detects approval)
prava sessions create --total-amount <amt> --currency <CUR> --merchant-name "<n>" --merchant-url "<url>" --merchant-country <XX> --product '<json>' [--product ...]
prava sessions poll --session-id <id>  # waits for tokenized credentials
```

## Anti-patterns

- **Minting a session before the step-3 confirmation of merchant + total. The #1 thing to never skip.**
- Running `sessions create` before the agent is linked, or before purchase discovery is complete.
- Guessing/hallucinating amount, currency, or purchase context.
- Asking the user for keys, card numbers, or credentials — the CLI handles all auth locally.
- Pausing between receiving credentials and completing checkout.
- Installing the CLI yourself, or using `sudo` — the user installs it.
- Running `setup` when already linked (harmless no-op, but unnecessary).
- Doing product discovery in this skill — that's prava-shopping.

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
