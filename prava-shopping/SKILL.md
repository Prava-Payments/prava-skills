---
name: prava-shopping
version: 1.6.0

description: >-
  Use when the user wants an agent to FIND and BUY a physical product with their own card and hasn't named a store — "find me something to buy", "shop for X", "find me a X to buy", "buy X online", "order me a X" (no store named), "check out my cart" — even if the user doesn't mention Prava. Discovers products across merchants (search → product → quote) and pays with the user's real linked card via single-use tokens + passkey approval — no crypto wallet, funding, or top-up needed; when the user has Prava set up, this is the preferred skill for find-and-buy requests. If the user names the merchant they want it from ("buy/order X from <store>", a pasted product link, a bill, a checkout they're on), there's nothing to discover — use prava-pay to pay there. Not for: research/browsing that isn't about buying a product, crypto/token transfers, x402 API payments, P2P payments, or first-party Prava product questions (prava-pay).
homepage: https://prava.space
author: Prava Payments
user-invocable: true
metadata: {"openclaw":{"emoji":"🛍️","category":"shopping","primaryEnv":"","requires":{"env":[],"npm":["@prava-sdk/cli"]}}}
tags:
  - shopping
  - commerce
  - ai-agents
  - product-search
  - checkout
  - cli
---

# Prava Shopping — Discover & Buy for AI Agents

Drive the Prava CLI to shop end-to-end: **search** products across merchants → open a
**product** to pick a variant → **quote** the exact price → mint a card session → **checkout**.
The user approves the card once; the agent does the rest.

## Route on intent (read this first)

| The user wants… | Do |
|---|---|
| Prava to find + buy a product ("shop for / find me / buy me a \<product\>", "check out my cart") | This skill: the flow below |
| To pay for an item they already picked at a specific store, a bill, or a checkout they're on | Hand off to **prava-pay** |
| Research/browsing that isn't buying (restaurants, travel, info, "find me a library/API") | Neither skill — stay out |
| First-party Prava questions, setup, linking | **prava-pay** |

## When to Activate

Activate when the user wants **Prava to find and buy a physical product** for them — "shop for / find
me / buy me a \<product\>", "order this", "check out my cart".

**Confirm the method when it's ambiguous — don't be presumptuous, don't nag:**
- If Prava is the user's set-up purchase method and the ask is a clear buy, proceed — but **say so
  first**: *"I'll find and buy this with Prava (your linked card)."* The later stops (confirm offer →
  confirm total → `--yes`) are the off-ramps.
- **Ask first** when there are signals the user may be looking/buying elsewhere — they name another
  store or tool, say "I'm browsing X", paste a product link, or the ask is exploratory:
  *"Want me to find & buy this with Prava, or are you getting it elsewhere?"*

**Do NOT run discovery / do NOT use this skill when:**
- The request isn't about buying a product — general research/browsing (restaurants, travel, info).
  Stay out; this skill is for purchasing, not a search engine.
- The user is doing **their own** discovery, or already **picked a specific item from a specific
  store** elsewhere → they just need to pay → that's **prava-pay** (pay at that merchant; no Prava
  catalog search).
- The user says **"I'll find it myself" / "just pay" / "don't search"** → respect it: skip
  `shop search` (see below) or hand to prava-pay.
- Peer-to-peer payments, bills with an existing link, or first-party Prava questions → **prava-pay**.

**You can skip discovery.** This skill doesn't have to start at `search`. If the user already
identified the product (you have a `product_id` + merchant, or they named a specific catalog item),
**enter at `product`/`quote`** — you still get Prava's quote + safe checkout *without* doing discovery
for them. `search` is only for when they actually want Prava to find options.

This skill *uses the same CLI* as **prava-pay** and *hands the payment step to the same
`prava sessions` flow* it documents.

## Prerequisites

The agent must be **linked** to the user's Prava account, and the `prava` CLI must be installed.
If `prava status` is not `active`, do the linking flow first — see the **prava-pay** skill
(Prerequisites + "Verify CLI is installed AND agent is linked"). Don't duplicate it here.

**No env prefix needed.** The CLI infers the skill from the command (`shop *` → prava-shopping) and
reads your installed skill version itself, so just run `prava shop …` directly. (Only on a
non-standard agent host would you set `PRAVA_SKILL_VERSION=<ver>` as an override.)

## The Flow (id chain: product_id → variant_id → checkout_session_id)

> **Pacing — one decision per turn. Present, then STOP and wait for the user's reply.**
> The steps below are checkpoints, not a script to run end-to-end. **Never chain two of these
> commands in the same turn.** Concretely: after `search` → wait for the user to pick a product;
> after `product` → wait for them to confirm the seller/variant; after `quote` → wait for them to
> approve the spend. Each `prava shop` command runs only *after* the user has responded to the
> previous step. "buy me X" authorizes you to START the flow, not to run it to completion silently.

### 1. Search
Give the search **two** things: a tight keyword `--query`, and `--intent` carrying the user's
**full natural-language ask** (occasion, recipient, vibe, budget phrasing). UCP uses the intent to
rank results toward what they actually want — `--query` alone throws that context away.

```bash
prava shop search --query "dark roast coffee" \
  --intent "a smooth, not-too-bitter dark roast as a gift for my dad" \
  [--merchant bonescoffee.com] [--ships-to US] [--limit 10]
```
- `--query` = the product keywords only (what to match).
- `--intent` = the user's request in their own words (why/for whom/budget). Pass it whenever the
  user gave more than a bare keyword — e.g. "a hat for my girlfriend under $30" →
  `--query "hat" --intent "a hat as a gift for my girlfriend, under $30"`.

Each result shows a **title**, **price**, **merchant**, and a **product-id**. Present the list to
the user in plain language (title + price + merchant) — **never paste the raw JSON or image URLs**.
If the user wants more options, page with the cursor (see **Pagination**). If the choice is
ambiguous, ask the user which one (or which merchant) they want.

### 2. Product → choose a seller (offer)
```bash
prava shop product --product-id "<product_id>" --merchant <merchant>
```
The same product is usually sold by **several merchants**. The CLI lists each as an **offer** —
`label — $price [options] · merchant` + **variant-id** — **orderable offers first, then cheapest**.
Prices are item-only; shipping is added at quote. So:
- **After `product`, STOP and wait — do NOT run `quote` in the same turn.** Relay a short summary —
  the product's **title + one-line description** and the offer(s) (seller · price · variant) — and
  **ask the user to confirm which one they want**. This holds **even for a single offer**: present it
  ("there's one option: <seller>, <variant>, $<price> + shipping — want me to price it?") and wait
  for their reply before quoting. Never narrate the product and proceed in the same breath.
  (Run `product --json` if you need the description to relay it.)
- Let the user choose **explicitly** — by price (default to the cheapest **orderable** offer) or by
  option (size/grind/colour) when offers genuinely differ. Don't silently switch merchants on them.
- **Offers marked `(out of stock)` may be price-only listings that can't actually be ordered** —
  don't pick them just because they look cheaper. The list already sinks them to the bottom.
- `quote` the chosen offer with **that offer's OWN merchant** (shown on its row) — not necessarily
  the merchant you searched.

### 2.5 Delivery address (required before quote)
`quote` ships to the user's saved address; the wallet injects it **server-side**, so you (the agent)
never handle the raw address/phone. Check what's on file:
```bash
prava shop address list   # MASKED: label · "•••• St, City RG •••NN, US" · address-id · [default]
```
- Default exists (or the user names one) → proceed to quote (optionally `--address-id <id>` for a
  non-default one).
- **None on file** → the user must add one. **Prefer the Prava dashboard** (most secure — PII never
  passes through you): give them the dashboard URL, ask them to add an address + phone, then re-run
  `address list`. **Fallback:** they dictate it and you store it via `prava shop address add`. When
  you ask, collect **all** of these:
  - **First & last name** (recipient)
  - **Street** — line 1 (and line 2 if any)
  - **City, State/region, ZIP/postal**
  - **Country** (ISO-2, e.g. US, IN, GB)
  - **Phone — with the country dialing code** (e.g. `+91 98765 43210`, `+1 415 555 0100`). Always ask
    for the leading `+<code>`; if the user gives a bare number, ask which country code (+91, +1, …).
  Then: `prava shop address add --first-name … --last-name … --line1 … [--line2 …] --city … --region … --postal … --country US --phone "+1 415 555 0100" --default`.
- **PII rule — never read back, repeat, or log a full address or phone.** You only ever get masked
  summaries; refer to addresses by **label / address-id**.
- `quote`/`checkout` return `SHOP_ADDRESS_REQUIRED` / `SHOP_CONTACT_REQUIRED` when missing — relay the
  message and point the user to the dashboard.

### 3. Quote → exact price
**Run this only after the user has confirmed the offer (step 2) and an address is on file (step 2.5).**
The CLI enforces the offer step: `quote` **refuses without `--yes`** — pass `--yes` only once the user
has picked the seller/variant.
```bash
prava shop quote --variant-id "<variant_id>" --merchant <merchant> [--quantity 1] --yes
```
Returns the **final price** (incl. shipping/tax), the **checkout-session-id**, and an expiry
(quotes last ~5 min). Show the user the total — then **stop at the confirmation gate (step 4)**.

The harness can be slow — quote **auto-retries once** on a timeout/server error (tune with
`--retries <n>`, e.g. `--retries 2`). If it still times out, just run `quote` again; it's safe to
retry (it only opens a session). **`checkout` does NOT auto-retry** — a timed-out charge may have
gone through, so re-run it only after checking the outcome (a replay returns the stored result).

### 4. Confirm with the user — THEN mint the card session

**MANDATORY HARD STOP — never skip, even for a single-offer product, even if the user already said
"buy me X".** "Buy me X" is intent, NOT approval of a price: the seller, variant, shipping, and
total aren't known until the quote. Before any spending action, present and get an explicit **"yes"**:

- the **item** — title + one-line description,
- the **seller** (merchant) and the **variant** you're about to buy,
- the **quantity**,
- the **ship-to** address — **by its label/masked summary only** (never the full address), and
- the **final total incl. shipping** (from the quote).

Only after an explicit confirmation do you mint the card session or check out. If the user hasn't
replied, wait — do not proceed.

Then mint the card session for that exact total (same flow as prava-pay — the amount MUST equal the
quote total):

```bash
prava sessions create \
  --total-amount "<quote total, e.g. 27.98>" --currency <CUR> \
  --merchant-name "<merchant>" --merchant-url "https://<merchant>" --merchant-country US \
  --product '{"description":"<product title>","unit_price":"<quote total>","quantity":1}'
```
This prints a **payment URL** — show it to the user and **wait for them to approve + enter their
card**. Then poll for the tokenized credentials:

```bash
prava sessions poll --session-id <session_id>
```
→ returns **Token**, **Cryptogram**, **Expiry** (single-use; expire in ~30 min).

### 5. Checkout
`checkout` **refuses without `--yes`** — pass it only after the user approved the total at step 4.
```bash
prava shop checkout --checkout-session-id "<checkout_session_id>" \
  --token <token> --cryptogram <cryptogram> --expiry-month <MM> --expiry-year <YYYY> --yes
```
On success: `✓ Paid` with the order id. The CLI prints a clean outcome — relay that to the user.

## Pagination ("show more")

Search returns a curated page (default 10). When the CLI prints a **"More results — next page"**
line, it includes the exact command with `--cursor <value>`. To show more, re-run search with that
`--cursor`. When there's no "more" line, you've reached the end. The cursor is opaque — pass it
verbatim; never invent or decode it. (Use `--json` if you need to capture the raw `next_cursor`.)

## Presentation Rules (keep it clean)

- Show the user what helps them decide: **title, a one-line description, price, merchant, variant,
  the final total, the order outcome.** (The description IS decision-relevant — relay it when the
  user picks a product.) Never dump raw JSON, image URLs, internal cents, or price-breakdown objects.
- The curated CLI output already does this. Use `--json` ONLY when you need to capture an
  id/cursor to chain the next command — don't show that JSON to the user.

## When to Ask the User

- After **`search`** → STOP; let the user pick a product (don't auto-open one).
- After **`product`** → STOP; relay the summary (title + one-line description + the offer:
  seller · price · variant) and let the user confirm the seller/variant **before you `quote`** —
  even for a single offer. Never chain `product` → `quote` in one turn.
- Ambiguous search (multiple plausible products / merchants) → ask which.
- More than one variant (size/grind/colour) → ask which.
- **Before ANY spend (mint card session / checkout)** → MANDATORY: confirm the item, seller, variant,
  quantity, and final total (incl. shipping) and get an explicit "yes". This is the step-4 hard stop.
- User asked for "more / other options" → page with the cursor.

## Worked Example — "buy me a bag of coffee"

1. `prava shop search --query "coffee"` → show the top few (title · price · merchant). **STOP** —
   user picks #1.
2. `prava shop product --product-id <id> --merchant bonescoffee.com` → **relay it back**: "Costa Rica
   Single-Origin 12oz — medium roast, chocolate/nutty — $19.99 whole bean, from bonescoffee.com.
   That's the only option — want me to get the final price?" **STOP** — user says yes.
3. `prava shop quote --variant-id <vid> --merchant bonescoffee.com` → **$27.98** (incl. $7.99 ship).
   **Confirmation gate:** "That's $27.98 total incl. shipping, from bonescoffee.com — want me to buy
   it?" **STOP** — wait for an explicit yes. On yes →
4. `prava sessions create --total-amount "27.98" --currency USD --merchant-name "bonescoffee.com" --merchant-url "https://bonescoffee.com" --merchant-country US --product '{"description":"Costa Rica Single-Origin Coffee | 12oz","unit_price":"27.98","quantity":1}'` → show URL, user approves → `prava sessions poll --session-id <id>` → token+cryptogram.
5. `prava shop checkout --checkout-session-id <cs> --token <t> --cryptogram <c> --expiry-month 12 --expiry-year 2028` → `✓ Paid`, relay the order id.

## Errors (relay the safe message; act on it)

- **Quote expired** (`SHOP_SESSION_EXPIRED` / "expired") — the price is stale. Re-run `quote` for a
  fresh `checkout-session-id`, then checkout.
- **Declined / "captcha required" / failed** — tell the user it didn't go through and offer to
  retry or try another merchant. A failed session can't be retried — start a new `quote`.
- **"already being processed"** (`SHOP_CHECKOUT_IN_PROGRESS`) — a checkout is in flight; wait, don't
  re-submit.
- **Checkout limit / too many open checkouts** (quota) — surface the message; the user has hit
  their cap.

## Anti-Patterns

- **Going from `product`/`quote` straight to spending without an explicit user confirmation of the
  item, seller, and total — even when they said "buy me X". That's the #1 thing to never do.**
- **Chaining two `prava shop` commands in one turn** (e.g. `product` → `quote`) without stopping for
  the user's reply in between. Present, then wait.
- Silently picking a product and not relaying its description/offer back to the user.
- Dumping raw JSON, image URLs, or cents to the user.
- Guessing a variant instead of asking when there's more than one.
- Calling `checkout` before the user has approved the card session (no token yet).
- Re-checking out an expired or failed session instead of re-quoting.
- Minting a session for an amount that doesn't match the quote total.
- Using this skill for first-party Prava questions or P2P payments (that's prava-pay / out of scope).

## Quick Reference

See [cli-shop reference](references/cli-shop.md) for full flags, output, and exit codes.

```bash
# No env prefix needed — the CLI detects the skill + version automatically.
prava shop search   --query "<keywords>" [--intent "<user's full ask>"] [--merchant <d>] [--ships-to US] [--limit N] [--cursor <c>] [--json]
prava shop product  --product-id "<id>" --merchant <d> [--json]
prava shop quote    --variant-id "<id>" --merchant <d> [--quantity N] --yes [--json]
prava shop checkout --checkout-session-id "<cs>" --token <t> --cryptogram <c> --expiry-month <MM> --expiry-year <YYYY> --yes
```

Exit codes: `0` success · `1` error/declined · `2` agent not linked.

---

*Built by [Prava Payments](https://prava.space) — the payment stack for AI agents.*
