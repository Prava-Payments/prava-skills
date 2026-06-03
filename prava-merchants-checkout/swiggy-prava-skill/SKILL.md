---
name: swiggy-prava-skill
description: End-to-end Swiggy ordering with Prava card-token checkout. Use when the user wants an AI agent to set up Swiggy MCP, browse/search Swiggy Food/Instamart/Dineout, choose a saved delivery address, add or review Swiggy cart items, create a Prava authorization/payment session, and complete Swiggy checkout using Prava-issued tokenized card credentials. Also use when the user asks to install or configure the Swiggy MCP plus Prava payment flow for agentic purchases.
---

# Swiggy Prava Skill

Use this skill to keep the user in the chat-driven flow while the agent handles Swiggy discovery, cart setup, Prava authorization, browser checkout, and card payment. Never ask the user for raw card details, seed phrases, bank credentials, or OTPs in chat.

## Required References

- Read [setup.md](references/setup.md) when Swiggy MCP or Prava is not already configured, or when the user asks to install/setup the flow.
- Read [checkout-protocol.md](references/checkout-protocol.md) before adding to cart, creating a Prava session, or entering tokenized card details into Swiggy.

## Operating Rules

1. Keep the user in chat for decisions. Do not send them to the Swiggy app/website for manual search, cart editing, or checkout unless browser/MCP access is unavailable.
2. Use Swiggy MCP for address discovery, restaurant/menu search, cart updates, and cart reads.
3. Treat MCP checkout as incomplete for Prava/card payments. Swiggy MCP can add/review carts and may place pay-on-delivery orders, but Prava card payment requires browser automation.
4. Ask for browser automation access before creating the Prava session. Prefer the Codex in-app browser. If the user is already logged in elsewhere, ask for permission to control that browser/session in the current environment.
5. Use Prava only after the cart, cap, and browser path are confirmed. The Prava session amount is the user-approved cap or exact cart total, in INR unless the user approves another currency.
6. Use browser automation only for checkout steps Swiggy MCP does not expose, especially selecting card payment and entering Prava tokenized credentials.
7. Stop and ask before transmitting tokenized card credentials to Swiggy unless the user has already explicitly confirmed that exact payment action in the current flow.
8. Do not save the card on Swiggy unless the user explicitly requests it. If "save/secure this card" is selected by default, uncheck it before paying when possible. Prefer any "continue without saving" path.
9. If Swiggy or the payment gateway offers multiple charge currencies, choose the currency the user approved for Prava.
10. Follow payment gateway screens after the user has approved the payment, but pause for OTP/3DS/passkey/user-auth challenges. Do not ask the user to paste OTPs into chat.
11. After checkout, report only non-sensitive facts: order id, merchant, items, total, payment status, address label, and ETA. Never print the full token or cryptogram.

## Workflow

### 1. First-time setup

If the user asks to set up this flow, or Swiggy/Prava tools are missing, follow [setup.md](references/setup.md). After installing MCP servers or skills, verify whether the current agent session can see the new tools. If not, use a fresh Codex subprocess or ask the user to restart/open a new agent session.

### 2. Address selection

Use Swiggy MCP `get_addresses`. Match the user-provided saved address label exactly when possible. If the user says a nickname like "special person's PG", find the closest saved label and confirm only if there is ambiguity.

### 3. Product selection and cart confirmation

Use Swiggy MCP search/menu tools to resolve the restaurant, item, variant, quantity, and required customizations. Do not substitute a restaurant, item, size, or variant without asking.

Before payment, show:
- Address label and restaurant
- Item(s), quantity, variant/customizations
- Item total, taxes/fees, delivery fee, and total to pay
- ETA if available

Ask for confirmation to proceed to browser checkout and Prava if the user has not already approved the cart, cap, and browser access.

### 4. Browser access preflight

Before creating the Prava session, establish the checkout browser path:

- Use the Codex in-app browser when available.
- If the user has a logged-in browser session, ask for permission to control that browser in the current environment.
- Open `https://www.swiggy.com/checkout` and verify the cart/address can be reached.
- If the browser is not logged in, ask the user to log in inside that browser and continue after they confirm.

Do not create the Prava token until the browser route is ready, because the token is short-lived.

### 5. Prava authorization

Use Prava CLI to create a Swiggy session after cart confirmation. The merchant fields are:

```bash
--merchant-name "Swiggy" \
--merchant-url "https://www.swiggy.com" \
--merchant-country IN
```

Show the Prava approval URL in chat, then immediately poll. After tokenization, proceed directly to Swiggy checkout because credentials expire quickly.

### 6. Swiggy card checkout

Open `https://www.swiggy.com/checkout` in the controllable browser. If the user is not logged in, ask them to log in there and continue after they confirm.

Verify the page still shows the same cart, address, and a total that is less than or equal to the Prava cap. Select the delivery address or continue with the already selected address, proceed to payment, choose card/add new card, enter the Prava token as the card number, cryptogram as CVV, and expiry as shown by Prava. Use a reasonable cardholder name from the user's Swiggy account header if visible; otherwise ask.

Before submitting, ensure the card is not saved. Submit payment, choose the user-approved currency if asked, continue through the payment gateway, and wait for either order tracking or an authentication challenge.
