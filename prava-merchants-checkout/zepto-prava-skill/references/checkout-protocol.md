# Checkout Protocol

Use this before cart mutation, Prava session creation, Zepto payment-link creation, or browser card payment. The ordering logic is host-independent; only MCP setup and browser-control tooling differ between Codex, Claude Code, Gemini CLI, and other CLI agents.

## Fast Checkout Path

Use this path when the user asks for a normal Zepto order and existing auth is already available:

1. Reuse visible Zepto MCP tools, or the direct stdio MCP fallback if the host has a configured `mcp-remote` bridge but tools are not surfaced in the current session.
2. Reuse an active Prava link. Do not reinstall, reconfigure, or call `prava setup` when `PRAVA_SKILL_VERSION=2.2.0 prava status` returns `active`.
3. Treat saved address labels in the user request as confirmation. For example, if the user says `Favourite Place`, select the saved address with that label and proceed.
4. Do not ask routine confirmation after the address is resolved. Ask only for unsafe substitutions, unavailable products, ambiguous addresses, or totals above a user-provided cap.

## Address and Product Discovery

1. Call Zepto MCP `list_saved_addresses`.
2. If the user already named a saved address label, select that address directly. Otherwise ask the user to choose/confirm the delivery address by label or number.
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
- Product descriptions: by default, one aggregate Zepto order line whose unit price equals the exact final total

Prefer one aggregate product line for faster command construction and clearer Prava approval screens. Multiple lines are allowed only when itemization is explicitly required or when they improve audit clarity without confusing the approval page.

Example:

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions create \
  --total-amount "291.00" --currency INR \
  --merchant-name "Zepto" \
  --merchant-url "https://www.zeptonow.com" \
  --merchant-country IN \
  --product '{"description":"Zepto order: Papaya, Daily Good Pumpkin Seeds, Amul Dark Chocolate","unit_price":"291.00","quantity":1}'
```

Show the Prava approval URL with an explicit action, then immediately run the poll command.

Use wording like:

```text
Open this Prava link and tap Approve. The page may show the already linked agent name from `prava status`.
```

```bash
PRAVA_SKILL_VERSION=2.2.0 prava sessions poll --session-id <session_id>
```

If polling is still waiting after the first short interval, remind once with the same direct instruction: "Please tap Approve on the Prava page." Do not describe it as "card entry" unless Prava actually asks the user to add a new card.

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

## Abort and Non-Approval

If the user says they did not approve, tapped Dismiss, or wants to stop while Prava polling is pending:

1. Stop the Prava poll if it is still running.
2. Do not create the Zepto payment link.
3. Report that no payment credentials were issued and no Zepto order was placed.
4. Leave the Zepto cart intact unless the user asks to clear or change it.

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
