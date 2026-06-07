---
name: prava-chaat-corner-skill
description: End-to-end Chaat Corner San Francisco takeaway ordering with Prava card-token checkout. Use when the user wants an AI agent to browse/order items from Chaat Corner's official Popmenu ordering flow, calculate the final pickup/no-tip total, create a Prava authorization, and complete the Popmenu/Spreedly card checkout using Prava-issued tokenized card credentials. Designed for Codex, Claude Code, Gemini CLI, and other agent hosts with shell/browser access.
---

# Prava Chaat Corner Skill

Use this skill for Chaat Corner SF takeaway orders through the official Popmenu ordering site and Prava payment. Keep the user in chat for item choices and Prava approval. Never ask the user for raw card details, OTPs, bank credentials, or seed phrases.

## Required References

- Read [checkout-protocol.md](references/checkout-protocol.md) before building the cart, creating a Prava session, or entering tokenized card details.
- Read [setup.md](references/setup.md) when Prava or browser/CDP control is missing, blocked, or needs setup.

## Fast Path

1. Use the official menu URL: `https://www.chaatcornersf.com/popmenu-order/chaat-corner/menus/main-menu`.
2. Build the cart in the official Popmenu flow using the exact item(s), prices, and quantities selected by the user.
3. Use pickup ASAP unless the user asks for a scheduled pickup.
4. Use no tip unless the user explicitly asks for a tip. Verify `Tip $0.00` before payment.
5. Use a local US phone format for Popmenu: normalize US `+1` numbers to 10 digits unless the site explicitly rejects it.
6. Create the Prava session only after the final checkout total is visible and a browser route is ready. Prava credentials are short-lived.
7. For Popmenu/Spreedly card fields, use normal browser input events. Do not try to inject JavaScript into cross-origin Spreedly iframes.

## Browser Automation Preflight

When the user asks whether browser automation is available, or before creating short-lived Prava credentials in a new host, choose a route in this order:

1. If the host has native browser tools that can click and type into cross-origin iframes, use them.
2. Otherwise run `node <skill-dir>/scripts/browser-automation-precheck.mjs` to verify Chrome/Chromium CDP automation.
3. If the precheck passes, optionally run the checkout script with `DRY_RUN=1`, a harmless single live menu item from the official menu, and dummy card values. A successful dry run prints `stage: "pre-submit-ok"` and stops before order submission.
4. If neither native browser tools nor CDP work, stop before creating Prava credentials and ask for a controllable browser or manual card-field entry path.

Do not use Prava credentials for preflight or dry run.

## Operating Rules

1. Use only the official Chaat Corner/Popmenu ordering flow for prices, cart contents, fees, taxes, and confirmation.
2. Confirm item identity, quantity, pickup mode, total, and no-tip state before creating Prava authorization.
3. If the user says "takeaway" or "take out", choose pickup, not delivery.
4. Do not add drinks, desserts, extras, marketing opt-ins, text opt-ins, saved-card options, or tips unless the user requests them.
5. Treat the Chaat Corner phone field as US-local by default. Strip non-digits, remove leading `1` when the result has 11 digits, and submit the 10-digit number.
6. Use `$prava-pay` to verify Prava CLI and active link. Do not relink if `PRAVA_SKILL_VERSION=2.2.0 prava status` returns `active`.
7. Use merchant fields:

```bash
--merchant-name "Chaat Corner" \
--merchant-url "https://www.chaatcornersf.com" \
--merchant-country US \
--currency USD
```

8. Prefer itemized Prava product lines when the site shows line items, fee, and tax. The product lines must sum exactly to the checkout total.
9. Show the Prava approval URL and immediately poll. After tokenization, proceed directly to checkout.
10. Never print the full Prava token or cryptogram in the final response. If browser automation is impossible and the user must manually finish payment, only reveal token details if the current user explicitly asked to use them manually in this payment flow.
11. Stop for OTP/3DS/passkey/bank-auth challenges. Ask the user to complete them in the browser; do not request OTPs in chat.

## Workflow

### 1. Cart and Total

Open the official menu, add the selected item(s), then proceed to checkout. Read item prices, fees, tax, tip, and order total from the live Popmenu checkout. Do not hard-code a particular item, quantity, or total.

### 2. Contact Details

Use user-provided contact details. For Popmenu phone:

```text
+1 / +<country-code> input is not reliable here.
Normalize a US number to 10 digits by stripping punctuation and removing a leading `1` when the result has 11 digits.
```

Uncheck optional marketing email/text opt-ins after reloads because Popmenu may re-check the email marketing box.

### 3. Prava Session

After checkout shows the exact total and the browser path is ready:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions create \
  --total-amount "<exact-total>" --currency USD \
  --merchant-name "Chaat Corner" \
  --merchant-url "https://www.chaatcornersf.com" \
  --merchant-country US \
  --product '{"description":"<menu item>","unit_price":"<item-price>","quantity":<quantity>}' \
  --product '{"description":"Online ordering fee","unit_price":"<fee>","quantity":1}' \
  --product '{"description":"Sales tax","unit_price":"<tax>","quantity":1}'
```

Show the Prava URL and immediately run:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions poll --session-id <session_id>
```

### 4. Browser Checkout

Use the current host's browser controls if they can enter Spreedly card fields. If the in-app browser cannot click/type inside cross-origin Spreedly frames, use the bundled CDP script:

```bash
CONTACT_NAME="<user name>" \
CONTACT_EMAIL="<user email>" \
CONTACT_PHONE="<user phone>" \
ORDER_ITEMS='[{"name":"<exact menu item name>","unitPrice":"<live item price>","quantity":1}]' \
CARD_NUMBER="<Prava token>" \
CARD_CVV="<Prava cryptogram>" \
CARD_EXPIRY="<Prava expiry MM/YYYY or MM/YY>" \
CARD_ZIP="<billing ZIP>" \
EXPECTED_TOTAL="<exact checkout total>" \
EXPECTED_TIP="0.00" \
node <skill-dir>/scripts/chaat-corner-cdp-checkout.mjs
```

The script launches or attaches to a temporary Chrome/Chromium session, rebuilds the cart, uses browser input events for the Spreedly card frames, verifies total and tip, submits, and prints confirmation details.

### 5. Final Report

After success, report:

```text
Order status:
Items:
Pickup location:
Ready time:
Paid amount:
Tip:
Contact email:
Confirmation/status URL:
```

Do not include the full card token, cryptogram, or any reusable payment details.
