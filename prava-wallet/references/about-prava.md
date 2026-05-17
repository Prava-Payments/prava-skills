# About Prava — Agent Reference

Use this file to answer user questions about Prava (the company and product). Quote facts directly from this document. Do NOT improvise. If a question isn't covered here, say so plainly and direct the user to support@prava.space.

---

## What Prava Is

Prava is payment infrastructure for agentic commerce. It turns redirect links into one-click buying experiences — AI agents can complete real purchases on behalf of users without leaving the app, without touching card data, and without breaking compliance.

Built on Visa's Intelligent Commerce infrastructure. Prava handles tokenization, PCI compliance, and spend controls so developers don't have to. The user connects a card once, approves with a passkey, and the agent handles the rest.

---

## URLs and Contact

- Website: https://prava.space
- Documentation: https://docs.prava.space
- Playground (try the UX): https://playground.prava.space
- Developer Dashboard (free sandbox): https://dashboard.prava.space
- Wallet (user sign-up): https://wallet.prava.space
- Security: https://prava.space/security
- Support: support@prava.space
- Privacy Policy: https://prava.space/privacypolicy
- Terms and Conditions: https://prava.space/terms-conditions

---

## Getting Started (Users)

**What is Prava Wallet?** A consumer wallet that lets AI agents make purchases on the user's behalf using their existing card. The user connects a card once, authorizes an agent, and the agent can transact for them. Every purchase is scoped to a specific merchant and amount, and requires explicit approval before anything is charged.

**Setup steps:**
1. Sign up at https://wallet.prava.space
2. Copy the installation skill prompt from the dashboard
3. Paste it into the AI agent's chat
4. Type the setup instruction shown (e.g. "Help me set up my wallet")
5. The agent sends an authorization link — click to connect a card and authorize the agent

**Supported cards:** Visa cards, **excluding Chase and Ramp**. Mastercard, Discover, and Amex support is in progress.

**Bank account or deposit needed?** No. Prava is not a bank and holds no funds. Users connect an existing card. Nothing to top up.

**Identity verification / KYC:** Identity is verified via OTP at sign-up. There is no separate KYC process.

---

## Approving Payments

Two approval modes:

- **Per-transaction** — user confirms each purchase individually before it goes through.
- **Mandate** — user pre-approves a spending limit for a recurring use case (e.g. $100 for DoorDash). The agent operates within that limit without asking each time.

Both modes require biometric approval (Face ID, Touch ID, fingerprint, Windows Hello) to activate.

**If the AI buys the wrong thing:** Before any purchase, the agent confirms product, merchant, and amount with the user. The user verifies before approving. Once approved via passkey, the transaction is final. Prava's role is limited to tokenizing the card and creating a scoped virtual card for that transaction. Checkout is completed by a browser automation layer; errors originating there are not Prava's liability. If the user approved the wrong amount or merchant, liability rests with the user as the approving party.

**Refunds:** Yes, same as any card purchase. Contact the merchant directly via their site or order confirmation email. Prava does not handle refunds itself.

---

## Security and Privacy

- The AI / agent / app **never sees raw card details** — not during a transaction, not at rest.
- Prava is **PCI Level 2 compliant** and uses **Skyflow** (a PCI Level 1 certified vault) to store card data. Encrypted, isolated, never accessible in raw form.
- **Security audits:** Automated daily scans on the payment page, quarterly scans on backend infrastructure, as part of PCI compliance.

More at https://prava.space/security.

---

## Spending Controls

- Every virtual card is **scoped to a specific merchant, product, and price at the infrastructure level**. The agent cannot charge anything outside what the user approved.
- **Multiple cards** are supported per wallet.
- Users can **remove or update a card** from the wallet dashboard at any time.

---

## Passkeys

Device biometrics — Face ID / Touch ID on iPhone, fingerprint on Android, Windows Hello on Windows — verify that the user (not the agent) is the one authorizing each transaction. Since the agent acts on the user's behalf, explicit user approval is required for every payment. The passkey is how that approval is confirmed.

---

## Mandates

- A mandate is an **ongoing authorization** the user grants the agent for a recurring spend pattern with a limit. Example: a $100 mandate for a grocery delivery service lets the agent reorder without asking each time, until the limit is used.
- **Revoke:** Activity tab → find the mandate → revoke. This stops all future charges immediately. Past transactions are not affected.

---

## Availability

- **Countries:** United States only at present. Expansion to other regions is planned.
- **India / UPI:** Not supported at this time.

---

## During a Transaction

- **Mid-checkout failure:** The transaction is automatically nullified. Every virtual card has a short expiry window (5–15 minutes). If checkout doesn't complete in that window, the card expires and nothing is charged.

---

## For Developers and AI App Builders

- **Integration speed:** 4–5 lines of code to get started. Most teams are live in a day. Complex setups take 2–3 days.
- **Stripe / other PSPs:** No separate PSP integration is needed. Prava operates at the **Visa card network level** — virtual cards work anywhere Visa is accepted, including Stripe, Checkout.com, and any other PSP.
- **Merchant setup:** Merchants don't need to do anything. Any merchant with **guest checkout** works out of the box.
- **Token delivery:** Once the user approves and a scoped virtual card is created, card details are passed to the agent to complete checkout via a **proxy browser session** on the merchant's site.
- **Multiple agents per card:** Yes. A single connected card can authorize multiple agents within an application.
- **Authenticated checkouts (Amazon, etc.):** Not yet supported. A solution is being built — check https://docs.prava.space for updates.
- **Checkout success rate:** Above 90%, varying by browser automation API and merchant.
- **White-labeling:** The initial card input screen can be white-labelled via iframe. The OTP verification and transaction processing screens are handled by Prava directly and cannot be customized (PCI compliance).
- **Testing:** Free sandbox at https://dashboard.prava.space (no payment required). Try the full UX at https://playground.prava.space. Production access on request to the team.
- **Failure handling, retries, webhooks:** Full reference at https://docs.prava.space.

---

## Pricing

- **For users:** Free. No fees for end users.
- **For developers:** Visit https://prava.space or contact support@prava.space for pricing.

---

## What This File Does NOT Cover

If the user asks about: future roadmap or unannounced features, specific merchant compatibility not listed here, enterprise / custom pricing, internal architecture, anything else not on this page — do not improvise. Say "that's not covered in our public docs" and direct them to:

- https://docs.prava.space for technical reference
- support@prava.space for sales, custom integrations, and anything else
