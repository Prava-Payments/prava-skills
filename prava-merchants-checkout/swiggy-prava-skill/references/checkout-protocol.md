# Checkout Protocol

Use this before cart mutation, Prava session creation, and Swiggy card checkout.

## Address and Product Discovery

1. Fetch saved addresses with Swiggy MCP.
2. Resolve the requested address label exactly; if multiple labels fit, ask the user to choose.
3. Search restaurants/menu items with Swiggy MCP.
4. Resolve exact restaurant, item, size/variant, quantity, and required customizations.
5. If the exact item is unavailable, do not add substitutes. Show closest matches and ask.

## Cart Handling

Only add/update the cart after product identity is clear. Then fetch the cart and present a concise review:

```text
Address:
Restaurant:
Items:
Item total:
Delivery fee:
Taxes/charges:
Total to pay:
ETA:
```

If the user only asked to add to cart, stop after cart review.

If the user asked to order/pay, ask for or confirm the Prava cap. The cap must be greater than or equal to the Swiggy total and should be in INR.

Swiggy MCP can build the cart and may support pay-on-delivery placement. Do not use MCP pay-on-delivery placement when the user requested Prava/card payment. For card-based fulfillment, switch to browser automation for the final checkout.

## Browser Access Preflight

Before creating a Prava session, ask for and establish browser automation access. This avoids creating a short-lived Prava token before the checkout browser is ready.

Preferred order:

1. Use the Codex in-app browser if it is available and can reach Swiggy.
2. If the user has an already logged-in Swiggy session in their current browser, ask for permission to control that browser/session in the current environment.
3. If neither is available, explain that card checkout cannot be completed from MCP alone and ask the user to provide a controllable logged-in browser session.

Browser preflight checklist:

- Open or navigate to `https://www.swiggy.com/checkout`.
- Confirm the user is logged in.
- Confirm the pending cart is present.
- Confirm the requested address is already selected or can be selected.
- Confirm the visible total is less than or equal to the user-approved cap.

If the browser is not logged in, ask the user to log in inside the controllable browser, then continue from the checkout page. Keep the user in chat for approvals; do not ask them to manually search, rebuild the cart, or enter card details.

## Prava Session

Before creating a Prava session, confirm:

- Merchant name: `Swiggy`
- Merchant URL: `https://www.swiggy.com`
- Merchant country: `IN`
- Currency: `INR`
- Total amount: user-approved cap or exact Swiggy total
- Product description: clear Swiggy cart/payment authorization description

Example:

```bash
PRAVA_SKILL_VERSION=<version> prava sessions create \
  --total-amount "800.00" --currency INR \
  --merchant-name "Swiggy" \
  --merchant-url "https://www.swiggy.com" \
  --merchant-country IN \
  --product '{"description":"Swiggy food checkout authorization for confirmed cart","unit_price":"800.00","quantity":1}'
```

Show the payment URL, then immediately run:

```bash
PRAVA_SKILL_VERSION=<version> prava sessions poll --session-id <session_id>
```

Treat returned fields as sensitive:
- Token: use as card number.
- Cryptogram: use as CVV.
- Expiry: use as MM/YYYY, converting to MM/YY if Swiggy requires it.

Do not print the full token or cryptogram in final responses.

## Browser Checkout

Use Browser/in-app browser when available. If the user approved control of an already logged-in browser instead, use that browser according to the current environment's browser-control rules.

1. Open `https://www.swiggy.com/checkout`.
2. If not logged in, ask the user to log in inside the controllable browser and continue after they confirm.
3. Verify cart total, item(s), restaurant, and address match the Swiggy MCP cart.
4. Verify total is less than or equal to the Prava cap and in the approved currency.
5. Select the delivery address if needed; otherwise continue with the already selected address.
6. Click `Proceed to Pay`.
7. Choose `Credit & Debit Cards` / `Add New Card`.
8. Enter:
   - Card number: Prava token
   - CVV: Prava cryptogram
   - Expiry: Prava expiry
   - Name on card: visible account name if appropriate, otherwise ask the user
9. Uncheck any "save/secure card" option unless the user explicitly wants the token saved. Prefer "continue without saving" when offered, because Prava returns a one-time tokenized card.
10. Right before submitting card details, confirm with the user if they have not explicitly approved this payment action in the current flow.
11. Submit.
12. Follow the underlying payment gateway screens after submission. Do not assume the gateway is Razorpay; inspect each screen and continue only through payment-related prompts that match the approved transaction.
13. If the gateway asks whether to charge in multiple currencies, choose the currency the user approved in Prava. For an INR Prava cap, choose INR.
14. If an OTP/3DS/passkey/auth challenge appears, stop and ask the user to complete it in the browser. Do not ask for the OTP in chat.
15. Wait for order-tracking or confirmation page.

## Final Report

After success, report:

```text
Order id:
Restaurant:
Items:
Deliver to:
Paid amount:
Payment method:
ETA:
```

If checkout fails, report the exact stage and visible error. Keep the cart intact unless the user asks to change it.
