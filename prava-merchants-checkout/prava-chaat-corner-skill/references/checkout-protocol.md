# Checkout Protocol

Use this before cart mutation, Prava session creation, or Popmenu/Spreedly card checkout.

## Control Model

The LLM/browser agent is the checkout controller. It should inspect the live page, make the next decision, act with browser tools, and verify the outcome after each meaningful action. Deterministic scripts are narrow helpers for diagnostics or difficult browser mechanics; they are not the main ordering actor.

## Merchant Facts

- Merchant: `Chaat Corner`
- Official site: `https://www.chaatcornersf.com`
- Official ordering URL: `https://www.chaatcornersf.com/popmenu-order/chaat-corner/menus/main-menu`
- Ordering platform: Popmenu
- Payment card fields: Spreedly secure iframes
- Pickup address observed: `320 3rd Street, San Francisco, CA 94107`
- Merchant country: `US`
- Currency: `USD`

## Discovery and Cart

1. Use the official Popmenu URL. Do not rely on third-party menu mirrors for final prices.
2. Confirm pickup, not delivery, for takeaway orders.
3. Add the exact item and quantity the user selected.
4. Resolve each selected menu item by visible item name and live item price on the official menu.
5. Prefer quantity controls inside each item modal. If quantity controls fail in browser automation, add one item and adjust the quantity in the cart.
6. Continue to checkout and read the live totals from the site. Do not hard-code totals from previous orders.
7. If the menu is unavailable for ASAP pickup and only scheduled pickup is offered, stop and tell the user the exact scheduled pickup time before proceeding.

Use this loop throughout discovery and cart building:

```text
Observe current visible page state.
Choose the smallest next action.
Act through native browser/computer-use tools.
Verify the expected page/cart change.
Stop on mismatch, unexpected totals, unavailable items, CAPTCHA, payment challenge, or unclear page state.
```

## Contact Details

Use user-provided name and email exactly. Normalize US phone numbers for Popmenu:

```js
function normalizeUsPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}
```

Why: in the observed Chaat Corner Popmenu flow, entering a `+1` phone number resulted in the page storing the digits without the `+`. For local US pickup, use the user's 10-digit local number instead of the `+1` form.

After every checkout reload, verify:

- Phone is still the intended local number.
- Marketing `Email` and `Text` opt-in boxes are unchecked unless requested.
- Order notification `Text notification` is unchecked unless requested.
- Expiry and ZIP may have reset and need refilling.

## No-Tip Rule

For takeout without tip:

1. Ensure the custom tip option is selected or the page shows `Tip $0.00`.
2. Do not click preset tips.
3. Verify `Tip $0.00` immediately before final submit.

## Prava Session

Create Prava only after the exact checkout total is visible and a controllable browser path is ready.

Required Prava context:

- Merchant name: `Chaat Corner`
- Merchant URL: `https://www.chaatcornersf.com`
- Merchant country: `US`
- Currency: `USD`
- Total: exact Popmenu checkout total

Build Prava product lines from the live checkout. Include each selected menu item and any displayed fee/tax lines. The product lines must sum exactly to the Popmenu order total:

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

Show the Prava approval URL and immediately poll:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions poll --session-id <session_id>
```

Do not create a Prava session for stale estimated menu totals. Fees and tax appear only at checkout.

## Spreedly Card Fields

Popmenu uses two secure cross-origin Spreedly iframes:

- Card number iframe: `iframe[id^="spreedly-number-frame"]`
- CVV iframe: `iframe[id^="spreedly-cvv-frame"]`

Do not attempt to inject JavaScript into these frames or bypass their origin isolation. The legitimate reliable path is to use normal browser input events:

1. Bring the browser tab to the front.
2. Scroll the number iframe into view.
3. Click inside the visible number iframe.
4. Send the Prava token as keyboard/text input.
5. Click inside the visible CVV iframe.
6. Send the Prava cryptogram as keyboard/text input.
7. Fill the parent-page expiry and ZIP fields normally.

In Codex's in-app browser, direct clicks into cross-origin iframes can be blocked. The submit-empty-card-then-reload trick only produced `Invalid payment` and did not expose editable card inputs in the parent DOM. If this happens, use a CDP-controlled browser or a narrowly scoped helper that sends normal input events. Do not let a script decide whether the order should proceed.

## Helper Script Policy

The bundled full-page script exists for diagnostics and fallback mechanics. Prefer native browser/computer-use tools for real checkout. If the script is used, the LLM must verify the page/cart state before running it and must inspect the result afterward.

By default, `scripts/chaat-corner-cdp-checkout.mjs`:

1. Finds or launches Chrome/Chromium with remote debugging.
2. Opens the official Chaat Corner menu URL.
3. Clears the temporary browser session cart/state.
4. Adds every item from `ORDER_ITEMS`, or the single `ORDER_ITEM_NAME` / `ORDER_ITEM_PRICE` fallback.
5. Proceeds to checkout.
6. Fills contact fields, normalizing phone to local US 10-digit format.
7. Unchecks marketing/text opt-ins.
8. Fills expiry and ZIP.
9. Uses CDP input events to click/type into Spreedly iframes.
10. Verifies expected total and tip when `EXPECTED_TOTAL` / `EXPECTED_TIP` are provided.
11. Prints `stage: "pre-submit-ok"` and stops before order submission.

It does not submit unless `ALLOW_SCRIPT_FINAL_SUBMIT=1` is explicitly set. Avoid that flag in ordinary agent use. The preferred final submit path is a fresh LLM/browser observation followed by a browser click after exact user approval.

Run pattern:

```bash
CONTACT_NAME="<user name>" \
CONTACT_EMAIL="<user email>" \
CONTACT_PHONE="<user phone>" \
ORDER_ITEMS='[{"name":"<exact menu item name>","unitPrice":"<live item price>","quantity":1}]' \
CARD_NUMBER="<Prava token>" \
CARD_CVV="<Prava cryptogram>" \
CARD_EXPIRY="06/2031" \
CARD_ZIP="<billing ZIP>" \
EXPECTED_TOTAL="<exact checkout total>" \
EXPECTED_TIP="0.00" \
DRY_RUN=1 \
node <skill-dir>/scripts/chaat-corner-cdp-checkout.mjs
```

Use `DRY_RUN=1` before creating Prava credentials if you only need to verify browser viability. Do not use Prava credentials for preflight.

## Final Submission Gate

Immediately before final submit, confirm:

- URL contains `/checkout`.
- Item summary matches the user-approved cart.
- Order total equals the Prava amount.
- Tip equals the user-approved tip, usually `$0.00`.
- Contact email/name/phone are correct enough for pickup.
- Marketing opt-ins are off unless requested.

Then submit using browser/computer-use control, not a blind script. After submit, wait for a confirmation/status page. A successful observed URL shape is:

```text
https://www.chaatcornersf.com/popmenu-order/chaat-corner/status/<status-id>
```

## Failure Handling

- `Invalid payment` before card entry: card number/CVV were not entered into Spreedly frames. Reloading alone does not solve this in the in-app browser.
- Prava DNS/network failure: rerun the same Prava CLI command with the host's network approval.
- Browser cannot launch Chrome/Chromium: read [setup.md](setup.md) and use a user-approved controllable browser route.
- Prava token expires: create a fresh Prava session only after the checkout browser route is ready again.
- Payment challenge appears: stop and ask the user to complete it in the browser.

Keep the cart intact on failure unless the user asks to clear or change it.
