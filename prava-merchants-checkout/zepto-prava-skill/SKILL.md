---
name: zepto-prava-skill
description: End-to-end Zepto ordering with Zepto MCP and Prava card-token checkout. Use when the user wants an AI agent to set up or verify Zepto MCP, authenticate Zepto via mcp-remote OAuth/OTP, search/add Zepto grocery or quick-commerce products, choose a saved delivery address, create a Zepto online payment order, authorize a Prava payment session, and complete the deterministic Juspay/Zepto card payment link using Prava-issued tokenized card credentials.
---

# Zepto Prava Skill

Use this skill to order Zepto items through Zepto MCP, keep the user in chat for address selection and Prava approval, and complete the short-lived Zepto/Juspay payment link with Prava tokenized card details. The workflow should work in Codex, Claude Code, Gemini CLI, and other MCP-capable CLI agents by adapting only the MCP installation/configuration commands to the current host. Never ask the user for raw card details, seed phrases, bank credentials, or OTPs in chat.

## Required References

- Read [setup.md](references/setup.md) when Zepto MCP or Prava is missing, not authenticated, not visible in the current agent session, or when the user asks to install/setup the flow.
- Read [checkout-protocol.md](references/checkout-protocol.md) before searching products, mutating the cart, creating a Zepto payment link, creating a Prava session, or entering tokenized card details into the Zepto/Juspay payment page.

## Fast Path First

Most user requests should not run the setup path. Before installing, reconfiguring, or asking the user to redo auth, try the existing working path:

1. If Zepto tools are visible, call them directly. If the user named a saved address label such as `Favourite Place`, select that label when it appears in `list_saved_addresses` and do not ask for another address confirmation.
2. If Zepto tools are not visible but the host already has `zepto` configured as `npx --yes mcp-remote https://mcp.zepto.co.in/mcp`, use the direct stdio MCP fallback in [setup.md](references/setup.md) instead of reinstalling or asking the user to restart.
3. Check Prava with `which prava` and `PRAVA_SKILL_VERSION=2.2.0 prava status`. If status is `active`, do not run `prava setup`, reinstall the CLI, or change the linked agent.
4. Only use setup instructions after the fast path proves one of these is truly missing: Zepto server config, Zepto auth, Prava CLI, Prava active link, or a controllable browser route.

## Operating Rules

1. Use Zepto MCP for saved addresses, product search, cart mutation, order preview, online-payment order creation, and payment-status checks.
2. Prefer the fast path. Verify Zepto/Prava only enough to prove they are usable; do not reinstall, reconfigure, or relink when an existing active setup works.
3. Ask the user to choose or confirm the Zepto delivery address only when they did not already name a saved address label or when the named label is missing/ambiguous. This is the only routine chat confirmation before checkout.
4. Do not ask the user to manually search, edit the cart, or enter card details. Use MCP and browser automation.
5. If product identity is clear, make a best-effort exact selection. Use Zepto past-order preference data before searching. Ask only when the requested product cannot be resolved safely, all plausible matches are unavailable, or the cart total exceeds a user-provided cap.
6. Use `create_online_payment_order` with `confirmOrder: false` to get the final amount before Prava. Do not create the real Zepto payment link until Prava credentials are ready, because the Zepto/Juspay link is short-lived.
7. Create the Prava session for the exact final Zepto amount in INR, with merchant `Zepto`, URL `https://www.zeptonow.com`, and country `IN`. Use one clear aggregate product line by default, e.g. `Zepto order: papaya, pumpkin seeds, Amul dark chocolate`, so the Prava approval screen shows the whole purpose instead of only the first cart item. Show the Prava approval URL with explicit wording: "Open this link and tap Approve." Then immediately poll.
8. After Prava returns the Visa network token, one-time cryptogram, and expiry, immediately create the Zepto online-payment order with `confirmOrder: true`, open the returned payment link in a controllable browser, and pay using the Prava credentials.
9. On the Zepto/Juspay payment page, choose card/add new card, enter the Prava token as card number, the cryptogram as CVV, and the expiry as required by the form. Do not save the card.
10. Pause for OTP/3DS/passkey/user-auth challenges. Ask the user to complete them in the browser; never ask them to paste OTPs into chat.
11. After submitting payment, call Zepto MCP `check_payment_status` as instructed by the order response. Do not claim the order is paid or confirmed until Zepto reports a successful terminal status.
12. Report only non-sensitive facts: order code/id, items, total, payment status, address label, payment method, and ETA if available. Never print the full Prava token or cryptogram.

## Workflow

### 1. Setup and Auth Gate

Before any Zepto shopping work, use the fast path to ensure both integrations are ready:

- Zepto MCP is configured as a stdio command using `npx --yes mcp-remote https://mcp.zepto.co.in/mcp`.
- Zepto MCP auth has completed through the mcp-remote OAuth URL and Indian mobile OTP.
- The current agent host can see or otherwise reach Zepto MCP tools.
- Prava CLI is installed and linked according to `$prava-pay`.

If a condition is already true, reuse it. If the host cannot see Zepto tools but the configured bridge exists, use the direct stdio MCP fallback in [setup.md](references/setup.md). Only use install/auth setup after confirming the existing setup cannot be reached.

### 2. Address Selection

Use Zepto MCP `list_saved_addresses`. If the user already specified a saved label, select the matching address ID directly. If there is exactly one saved address and the user did not specify a preference, use it. Otherwise show saved address labels/numbers and ask which one to use.

### 3. Product and Cart

Call `get_past_order_items` once before product search. Use exact past-order names when they match the user's request. Then use `search_products` for one item or `search_multiple_products` for multiple distinct items. Add chosen items with `update_cart`, then call `view_cart`.

### 4. Zepto Preview

Call `get_payment_methods`. If `Pay Online (UPI / Cards / Wallets)` is available, call `create_online_payment_order` with `confirmOrder: false`. Show the user the amount and line items, but do not ask for another confirmation unless the amount is higher than a user-provided cap or the product/address changed.

### 5. Prava Authorization

Use `$prava-pay` to check Prava setup and create a Prava session for the final Zepto preview total. If Prava is already active, do not relink it even if the linked agent name differs from the current host; tell the user the approval page may show that existing agent name.

For speed and approval-screen clarity, default to a single aggregate product line whose amount equals the final Zepto total, such as `Zepto order: papaya, pumpkin seeds, Amul dark chocolate`. Use multiple product/fee lines only when a merchant or audit requirement needs itemized lines. The product lines must always sum exactly to the Zepto total.

### 6. Zepto Payment Link and Browser Payment

After Prava credentials are available, call `create_online_payment_order` with `confirmOrder: true`. Open the returned Zepto/Juspay payment link immediately in a controllable browser and fill the card form with Prava credentials. See [checkout-protocol.md](references/checkout-protocol.md) for the exact browser sequence.

### 7. Payment Status and Final Report

Call `check_payment_status` with the returned Zepto order ID. If the first status is pending and the tool instructs polling, poll until success, failure, cancellation, or timeout. On timeout, report that payment is still pending and include the order code/link if it is still useful.
