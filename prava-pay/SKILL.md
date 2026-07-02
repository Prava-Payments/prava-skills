---
name: prava-pay
version: 2.3.1

description: Use when the user asks to buy something they've already chosen, pay for an order/bill, set up Prava, link a card, or use Prava. Also use for first-party Prava product questions about what it is, security/privacy, pricing, supported cards/countries/merchants, passkeys, mandates, refunds, or KYC. Do NOT use for peer-to-peer payments, provider comparisons, general payment-industry questions, or when the user wants Prava to FIND/SEARCH a product to buy (use the prava-shopping skill — it does discovery → quote → checkout). Drives the Prava CLI to link an AI agent to a Prava account and retrieve tokenized card credentials for agent-initiated merchant purchases.
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

Link to a user's Prava account and retrieve tokenized card credentials via the Prava CLI. The user approves once, then the agent can create payment sessions and receive tokenized card credentials to complete purchases.

## When to Activate

Activate this skill when:
- The user asks you to buy something, make a purchase, or pay for something
- The user asks to set up Prava or connect their card for agent purchases
- The user says "pay with Prava", "use Prava", or similar
- The user asks general questions about Prava as a product or company (what it is, how it works, security, pricing, supported cards, mandates, passkeys, refunds, etc.) — see "Answering Questions About Prava" below

**Discovery vs. payment (hand-off to prava-shopping):** if the user wants Prava to **find/search** a product to buy (they haven't chosen a specific item/merchant yet — "shop for / find me / buy me a \<product\>"), that's the **prava-shopping** skill (it does search → product → quote → checkout). This skill, prava-pay, is for **completing payment once the product + merchant + price are known** — a bill, an order they've finalized, or a checkout you're already on. The two share the same CLI, onboarding, and `prava sessions` mint, so once prava-shopping reaches its payment step it uses exactly the flow documented here.

> **If the prava-shopping skill isn't available to you**, do **not** attempt discovery with prava-pay. Tell the user it lives in a separate skill and give them the one-line install, then ask them to retry:
> ```
> npx --yes skills add https://github.com/Prava-Payments/prava-skills --skill prava-shopping --global --yes --full-depth
> ```

## Answering Questions About Prava (Company / Product)

When the user asks ANY general question about Prava — what it is, how it works, security and privacy, pricing, supported cards / countries / merchants, refunds, mandates, passkeys, KYC, basic developer integration questions, available URLs (dashboard, playground, docs) — read [about-prava reference](references/about-prava.md) and answer from it.

Rules:
- Quote facts directly from the reference. Do NOT improvise answers about Prava's product, pricing, security, supported cards / merchants / countries, or roadmap. **Specifically, do NOT infer a pricing or billing model (transaction-based, per-seat, subscription, tiered, etc.) — if the reference only says "contact for pricing", that is the entire answer.**
- **Completeness: when a question has multiple correct answers in the reference (e.g. "where do I sign up / try it?" maps to separate URLs for users, developers, and the playground), surface ALL of them. Partial answers mislead the user about what's available.**
- If the question isn't covered in the reference, say "that's not covered in our public docs" and direct the user to support@prava.space (or https://docs.prava.space for technical reference).
- For information-only questions, do NOT run any `prava` CLI commands. The user is asking for information, not requesting a purchase. Only run CLI commands when the user actually wants to buy, pay, or set up the wallet.

Trigger phrases (non-exhaustive): "what is Prava", "how does it work", "is it secure", "how is my card data stored", "what cards / countries / merchants do you support", "how much does it cost", "is the wallet free", "what's a passkey / mandate", "can I get a refund", "what if the AI buys the wrong thing", "do you support India / UPI / Amazon", "how fast is integration".

## Prerequisites: CLI Installation

Before running any `prava` command, check whether the CLI is available in the current agent shell:

```bash
which prava
```

If `which prava` fails, do **not** assume Prava is uninstalled. Agent hosts often run non-login or sandboxed shells where `nvm`, Homebrew, and user npm paths are not loaded. First look for an existing binary in common install locations:

```bash
find ~/.nvm/versions/node ~/.npm-global /opt/homebrew /usr/local -path '*/bin/prava' -type f 2>/dev/null
```

If you find an existing `prava` binary, use its absolute path or prepend its `bin` directory to `PATH`, then run status:

```bash
PATH=/path/to/prava/bin:$PATH PRAVA_SKILL_VERSION=<this skill's version> prava status
```

Only if no existing `prava` binary is found does it need installing — and **the user installs it, not you.** A global npm install (and the card/passkey setup that follows) should happen under the user's control, so ask them to run it rather than installing it yourself:

> The Prava CLI isn't installed. Please run `npm install -g @prava-sdk/cli` in your terminal, then tell me when it's done.

**Never run the install with `sudo` or otherwise elevate privileges.** If a plain `npm install -g` fails on permissions, that's the user's Node setup to sort out (an nvm/Homebrew node, or an npm prefix they own) — surface the error and let them handle it. Do not retry with `sudo`.

Once the user confirms it's installed, verify:

```bash
prava --version
```

## Version Check (automatic)

The CLI automatically checks for updates on every API call. Watch for two notices in command output:

- **CLI update notice** — Run `npm update -g @prava-sdk/cli`. If the notice says "Critical update required", you MUST update before continuing.
- **Skill update notice** — "Skill update required (minimum: X.Y.Z)". The CLI prints this **only after confirming your installed version is actually below the minimum**, so trust it literally: run `npx skills update prava-pay -g`, then continue. (If instead you see "Could not verify … version", the CLI just couldn't locate your installed skill on this host — harmless; update only if it's genuinely old.)

**No env prefix needed.** The CLI infers the skill from the command (`setup`/`sessions`/`status` → prava-pay) and reads your installed skill version itself, so just run `prava …` directly. (Only on a non-standard agent host would you set `PRAVA_SKILL_VERSION=<ver>` as an override.)

Do not run separate version-check commands — the CLI handles this automatically.

## Steps to Retrieve Payment Credentials

### 1. Verify CLI is installed AND agent is linked

You MUST run these two commands, in this order, before any other prava command — never skip either:

1. `which prava` — if missing, search common existing install locations first. If still not found, ask the user to install it (see Prerequisites above — never install it yourself, and never use `sudo`). Then proceed.
2. `prava status` — check agent link state.

Decision tree based on `prava status` output (check in this order — first matching condition wins):

- **CLI prints "Skill update required (minimum: X.Y.Z)"** — the CLI has verified the version you reported is genuinely below the minimum, so this is a real block: run `npx skills update prava-pay -g`, then run `prava status` again. If the SAME warning re-prints after updating, the new skill file is on disk but this session still has the old one loaded — tell the user: "I've updated the prava-pay skill, but most agent hosts only load skills at session start. Please restart your agent session (the host you're running in — for example Claude Code, Cursor, Codex, or whichever it is), then re-run your original request." Then STOP — do not proceed. (Do NOT say "restart the CLI" or "restart your machine" — it's the agent host process that needs to reload the skill.) *If instead the CLI says "Could not verify skill version", you simply omitted the `PRAVA_SKILL_VERSION=<ver>` prefix — add it and continue; you're not out of date.*
- **"Link expired. Run `prava setup` again."** — the previous setup link is dead. Confirm with the user that they want a fresh setup link (one sentence: "The previous link expired. I'll generate a new one — confirm?"). On confirmation, run `prava setup --name "<name>" --platform <platform>` then IMMEDIATELY `prava setup poll`.
- **"active"** — Move to step 2.
- **"pending"** — A previous setup attempt is still pending and not expired. The CLI re-prints the link as `Link: <URL>` in this case. Show the URL to the user and IMMEDIATELY run `prava setup poll`. If the CLI does NOT include a URL on the `Link:` line (only "Waiting for approval."), the previous link is unrecoverable: confirm with the user once ("I see an unfinished setup attempt with no recoverable link. Generate a fresh one?"), then run `prava setup` to generate a new link.
- **"No agent configured"** — Run the agent onboarding flow below, then show the linking URL to the user. IMMEDIATELY run `prava setup poll` — do NOT wait for user to respond or confirm. Read [cli-setup reference](references/cli-setup.md).

#### Agent Onboarding (when "No agent configured")

**Platform** — determine automatically from your own identity. Never ask the user.

**Name** — use this priority:
1. If the user already specified a name in their message (e.g., "set up Prava as my Shopping Bot"), use that name and skip confirmation.
2. Otherwise, pick the default name from the table below and **confirm before generating the link**:
   > Linking this agent to Prava as **"Claude Code"**. Want a different name, or should I proceed?
3. On confirmation (or if the user provides a new name), run `prava setup`.

| If you are                | Default name        | --platform           |
|---------------------------|---------------------|----------------------|
| Anthropic Claude Code     | "Claude Code"       | claude-code          |
| OpenAI Codex CLI          | "Codex"             | codex                |
| Cursor                    | "Cursor"            | cursor               |
| Google Gemini CLI         | "Gemini CLI"        | gemini-cli           |
| Hermes                    | "Hermes"            | hermes               |
| Aider                     | "Aider"             | aider                |
| Goose (Block)             | "Goose"             | goose                |
| GitHub Copilot CLI        | "Copilot CLI"       | copilot-cli          |
| GitHub Copilot (IDE)      | "GitHub Copilot"    | github-copilot       |
| Windsurf                  | "Windsurf"          | windsurf             |
| Cline                     | "Cline"             | cline                |
| Continue                  | "Continue"          | continue             |
| Amazon Q Developer        | "Amazon Q"          | amazon-q             |
| Roo Code                  | "Roo Code"          | roo-code             |
| Kilo Code                 | "Kilo Code"         | kilo-code            |
| Sourcegraph Cody          | "Sourcegraph Cody"  | sourcegraph-cody     |
| Tabnine                   | "Tabnine"           | tabnine              |
| Augment Code              | "Augment Code"      | augment-code         |
| Amp                       | "Amp"               | amp                  |
| Zed                       | "Zed"               | zed                  |
| Kiro (AWS)                | "Kiro"              | kiro                 |
| BLACKBOX AI               | "BLACKBOX AI"       | blackbox             |
| OpenCode                  | "OpenCode"          | opencode             |
| Qwen Code                 | "Qwen Code"         | qwen-code            |
| Kimi CLI                  | "Kimi CLI"          | kimi-cli             |
| Mistral Vibe              | "Mistral Vibe"      | mistral-vibe         |
| Warp                      | "Warp"              | warp                 |
| Coro Code                 | "Coro Code"         | coro-code            |
| Devin                     | "Devin"             | devin                |
| OpenHands                 | "OpenHands"         | openhands            |
| Jules (Google)            | "Jules"             | jules                |
| SWE-Agent                 | "SWE-Agent"         | swe-agent            |
| Manus                     | "Manus"             | manus                |
| OpenAI Operator           | "OpenAI Operator"   | openai-operator      |
| Claude Computer Use       | "Claude Computer Use"| claude-computer-use |
| Replit Agent              | "Replit Agent"      | replit-agent         |
| Bolt (StackBlitz)         | "Bolt"              | bolt                 |
| v0 (Vercel)              | "v0"                | v0                   |
| Lovable                   | "Lovable"           | lovable              |
| Unknown / custom agent    | Ask the user        | custom               |

```bash
prava setup --name "<name>" --platform <platform>
```

Do NOT prompt the user for platform — it is always automatic.
Only ask the user for a name if you are in the "custom" fallback (i.e., you genuinely cannot determine your own identity).

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

### 2.5 Confirm with the user before spending — MANDATORY HARD STOP

Before `prava sessions create`, present these to the user and get an explicit **"yes"**:

- the **merchant** (name),
- **what's being bought** (each product description), and
- the **total amount and currency**.

> "I'll pay **$8.50 USD** to **Blue Bottle Coffee** for 1 Latte + 1 Croissant — confirm?"

Only after an explicit confirmation do you mint the session. **This gate lives in the conversation, where the user is actually reading** — the browser passkey approval is a *second* check, not a substitute for this one. Confirming here catches a wrong merchant or a mis-typed amount **before** it's baked into a payment session and shown on a passkey prompt the user may approve on autopilot. Do not skip it even if the user already said "buy X" — "buy X" is intent, not approval of a specific merchant and total.

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

You already confirmed the merchant and total at the step 2.5 gate, so don't re-confirm here — the credentials are single-use and expire in 30 minutes, so complete checkout promptly once you have them.

## Troubleshooting: status stuck on "pending"

The "stuck pending" failure mode has been eliminated in CLI 1.1+ / skill 2.1+: `prava status` now returns either `Link expired` (when the previous setup is past its 15-minute TTL) or a `Link: <URL>` line you can re-show the user (when still fresh). The decision tree above handles both. The notes below cover legacy CLI versions only:

- If you're stuck because the CLI does NOT print `Link expired` but the user can't find the URL, ask the user to upgrade: `npm update -g @prava-sdk/cli`. After the upgrade, `prava status` will either re-print the URL or return `Link expired`.
- **Do NOT run `prava setup` again from a troubleshooting path without confirming with the user.** Re-running rotates the keypair and invalidates any link the user might still be about to approve. The exceptions are: (1) the CLI explicitly prints `Link expired`, OR (2) the user confirms in this session that they want a fresh link.
- If a purchase is pending and the CLI is on an older version that doesn't recognize `Link expired`, run `prava sessions create` directly — it has built-in auto-link-check.
- Confirm the user opened the exact URL printed by the most recent `prava setup` (not an older one).
- Check network connectivity — `prava status` falls back to local state when the server is unreachable, which can mask a real approval.

## Important: This is a Payment Subroutine

There is exactly one place to stop for the user: the **step 2.5 confirmation gate**, before you mint the session. Once you have the tokenized credentials (after step 3's poll), the token is single-use and expires in 30 minutes — so from mint → poll → checkout, move promptly and don't pause. The confirmation happens *before* the credential exists, so this immediacy never runs ahead of the user's approval.

**Multi-merchant requests** (e.g. "buy a book from Amazon AND a domain from Namecheap"): handle merchants one at a time. Run the full subroutine — `sessions create` → poll → checkout — for merchant A before starting merchant B. Each session's credentials are tied to a single merchant and expire in 30 minutes; do NOT parallelize `sessions create` calls, poll multiple sessions before any checkout, or batch checkouts at the end.

## CLI Quick Reference

No env prefix needed — the CLI detects the skill + version automatically:

```bash
prava setup --name "<name>" --platform <platform> [--description "<desc>"]   # prints URL, exits immediately
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

**Version check:** The Prava backend may require a minimum CLI version, and the CLI may require a minimum skill version. Two separate error families:

- **CLI version error** — "Critical update required. Current: X, Required: Y" or similar. Run `npm update -g @prava-sdk/cli`, then retry the command that triggered the error.
- **Skill version error** — "Skill update required (minimum: X.Y.Z)." The CLI prints this only after confirming the version you reported is below the minimum, so run `npx skills update prava-pay -g`, then retry. If it re-prints after updating, the disk is updated but this session still holds the old skill — ask the user to restart their agent session (the host app — Claude Code, Cursor, Codex, Gemini CLI, etc., whichever this agent runs inside), then retry. Do NOT tell them to restart the `prava` CLI or their machine. *("Could not verify skill version" instead? You just omitted the `PRAVA_SKILL_VERSION` prefix — add it and proceed; nothing to update.)*

In both cases, do NOT run `prava setup` again unless the user is genuinely setting up for the first time — updating the CLI or skill does not re-link the agent.

## Anti-Patterns

- **Minting a session (`sessions create`) before confirming the merchant and total with the user — see the step 2.5 hard stop. This is the #1 thing to never skip.**
- Running `sessions create` before agent is linked (check `prava status` first).
- Running `sessions create` before completing purchase discovery.
- Guessing or hallucinating amount, currency, or purchase context.
- Asking user for keys, card numbers, or credentials. The CLI handles all auth locally.
- Pausing between receiving credentials and completing checkout (the confirm happens *before* minting, not after).
- Installing the CLI yourself, or using `sudo` to install it — ask the user to install it.
- Running `setup` when already linked (harmless — exits 0, but unnecessary).

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
