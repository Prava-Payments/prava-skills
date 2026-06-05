# Checkout Protocol

Use this before cart mutation, Prava session creation, Zepto payment-link creation, or browser card payment. The ordering logic is host-independent; only MCP setup and browser-control tooling differ between Codex, Claude Code, Gemini CLI, and other CLI agents.

## Address and Product Discovery

1. Call Zepto MCP `list_saved_addresses`.
2. Ask the user to choose/confirm the delivery address by label or number.
3. Call `select_saved_address` with the exact address ID returned by Zepto.
4. Call `get_past_order_items` once.
5. Resolve requested products:
   - Use exact past-order product names when there is a match.
   - Use `search_products` for one concrete product.
   - Use `search_multiple_products` for multiple distinct products.
   - Do not substitute a different brand/size/type unless the requested item cannot be resolved; then show the closest matches and ask.

## Cart Handling

Add/update products with `update_cart`, then call `view_cart` and `get_payment_methods`.

For the normal Prava/card flow, only continue if `Pay Online (UPI / Cards / Wallets)` is available. Do not use COD, wallet, or UPI reserve pay unless the user explicitly switches away from Prava/card payment.

Generate a preview:

```json
{
  "name": "create_online_payment_order",
  "arguments": {
    "confirmOrder": false,
    "riderTip": 0,
    "userAddressId": "<selected-address-id>",
    "useZeptoCash": false
  }
}
```

Show a concise preview:

```text
Address:
Items:
Delivery/fees:
Total to pay:
Payment method: Pay Online (UPI / Cards / Wallets)
```

Do not ask for another routine confirmation after address selection. Ask only if the total exceeds a user-provided cap, the selected address changed, or a requested product had to be substituted.

## Prava Session

Before creating the Prava session, confirm internally:

- Merchant name: `Zepto`
- Merchant URL: `https://www.zeptonow.com`
- Merchant country: `IN`
- Currency: `INR`
- Total amount: exact Zepto preview amount, formatted as rupees with two decimals
- Product descriptions: clear Zepto item/fee lines whose sum equals the total

Example:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions create \
  --total-amount "70.00" --currency INR \
  --merchant-name "Zepto" \
  --merchant-url "https://www.zeptonow.com" \
  --merchant-country IN \
  --product '{"description":"Coca-Cola Diet Coke Soft Drink Can | Low-Calorie & Fizzy","unit_price":"40.00","quantity":1}' \
  --product '{"description":"Zepto delivery fee","unit_price":"30.00","quantity":1}'
```

Show the Prava approval URL, then immediately run:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions poll --session-id <session_id>
```

Treat returned fields as sensitive:

- Token: use as card number.
- Cryptogram: use as CVV.
- Expiry: use as MM/YYYY, converting to MM/YY if the Zepto/Juspay form requires it.

Do not print the full token or cryptogram in chat or final responses.

## Create Zepto Payment Link

Only after Prava credentials are available, create the real Zepto online-payment order:

```json
{
  "name": "create_online_payment_order",
  "arguments": {
    "confirmOrder": true,
    "riderTip": 0,
    "userAddressId": "<selected-address-id>",
    "useZeptoCash": false
  }
}
```

Capture:

- `orderId`
- `orderCode`
- `paymentLink`
- `toPay`

Immediately open the `paymentLink` in the controllable browser for the current host. Zepto/Juspay payment links can be very short-lived, so do not delay between link creation and browser payment.

## Zepto/Juspay Browser Payment

The Zepto payment link usually opens a Juspay-hosted page with payment methods on the left and a card form on the right.

1. Open the returned `paymentLink`.
2. If a payment-method list is visible, choose `Add New Card` or the credit/debit card option.
3. Fill:
   - Card Number: Prava token
   - Expiry: Prava expiry, converted to the visible field format (`MM/YY` or `MM/YYYY`)
   - CVV: Prava cryptogram
   - Name on card, if required: use the Zepto profile name from `get_user_details`; ask only if no name is available and the field is required.
4. Uncheck any save-card option. If a saved-card prompt appears after submit, choose the non-saving path unless the user explicitly requested saving.
5. Click `Proceed to Pay`.
6. If a bank/3DS/passkey/OTP challenge appears, pause and ask the user to complete it in the browser. Do not ask for OTPs in chat.
7. Wait for a visible success/failure state or return to Zepto.

## Payment Status

After creating the online-payment order, follow the MCP instruction to call `check_payment_status`:

```json
{
  "name": "check_payment_status",
  "arguments": {
    "orderId": "<order-id>",
    "poll": false
  }
}
```

If Zepto returns `PENDING` and instructs polling, call again with `poll: true`. Do not claim success while status is pending. If polling times out, report:

- Order code/id
- Last payment status
- Payment link if still likely useful
- That the user may still be completing payment

## Final Report

After success, report:

```text
Order code/id:
Items:
Deliver to:
Paid amount:
Payment method:
Payment status:
ETA:
```

If checkout fails, report the exact stage and visible/MCP error. Keep the cart/order state intact unless the user asks to change it.
