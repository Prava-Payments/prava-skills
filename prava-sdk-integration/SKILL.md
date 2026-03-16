---
name: prava_sdk_integration
description: Integrate Prava — the payment stack for AI agents. Securely collect cards, enroll for tokenized payments, and enable repeat purchases with passkey verification. No card details ever exposed to the AI.
version: "1.0.0"
author: Prava Payments
tags:
  - payments
  - ai-agents
  - card-enrollment
  - pci-compliant
  - passkey
  - visa
---

# Prava SDK Integration Skill

> **Prava** is a payment stack for AI agents. It lets AI apps accept card payments without ever seeing raw card details. Cards are tokenized with the networks (Visa) and secured with passkeys (biometrics).

## When to Activate

Activate this skill when the user wants to:
- Integrate Prava payments into their app
- Add card enrollment / card collection to an AI agent
- Set up `@prava-sdk/core`
- Create a payment flow for an AI app
- Enable tokenized card payments with passkey verification

Trigger phrases: "integrate prava", "add prava sdk", "prava payments", "card enrollment", "add payment to my AI agent", "prava card collection"

---

## Required Inputs

Before starting, you MUST collect these from the user:

| Input | Format | Example |
|-------|--------|---------|
| **Publishable Key** | `pk_test_xxx` or `pk_live_xxx` | `pk_test_TaFAJcKaldaFoXErIEHw03p_7lAhXY94D3RsXgLV_3s` |
| **Secret Key** | `sk_test_xxx` or `sk_live_xxx` | `sk_test_zGzBj2QzZVaFtO4dkY2ZLAGe7wRSf1zgzUPBheBksA4` |
| **Backend URL** | Full URL | `https://sandbox.api.prava.space` |

If the user hasn't provided these, ask:
> "To integrate Prava, I need three things from you:
> 1. Your **Publishable Key** (starts with `pk_test_` or `pk_live_`)
> 2. Your **Secret Key** (starts with `sk_test_` or `sk_live_`)
> 3. Your **Prava Backend URL** (e.g., `https://sandbox.api.prava.space`)
>
> You should have received these when your merchant account was created."

---

## How Prava Works (Context for the Agent)

### The Core Concept
AI agents need to make purchases on behalf of users, but they should NEVER see raw card details. Prava solves this:

1. **Card details stay in a PCI-compliant iframe** — the AI app never touches them
2. **Cards are tokenized with Visa** — stored securely in a vault
3. **Passkeys (biometrics)** protect every transaction — the user must approve
4. **Session-based** — each flow starts with a server-side session creation

### First-Time Flow (Onboarding + Optional Purchase)
```
AI App (server) → POST /v1/sessions → gets session_token + iframe_url
                                              ↓
AI App (frontend) → opens iframe_url in new tab or embeds in page
                                              ↓
End User → enters card details in secure iframe
                                              ↓
Card tokenized with Visa → enrolled for VIC (Visa Intelligent Commerce)
                                              ↓
End User → approves passkey registration (biometric)
                                              ↓
Success → redirect back to merchant URL
         → if buy flow: payment completed
         → if registration only: card onboarded
```

### Repeat Flow (Saved Card + Passkey Verification)
```
AI App (server) → POST /v1/sessions → gets session_token + iframe_url
                                              ↓
AI App (frontend) → opens iframe in new tab or embeds
                                              ↓
End User → sees saved cards, picks one
                                              ↓
End User → verifies passkey (biometric from first time)
                                              ↓
Payment completed → redirect back
```

---

## Integration Steps

### Step 1: Detect the Framework

Scan the user's project to determine the framework:
- Check `package.json` for `next` → **Next.js**
- Check `package.json` for `express` → **Express.js**
- Check `package.json` for `react` (without Next) → **React SPA**
- No framework → **Vanilla JS**

### Step 2: Install the SDK

```bash
npm install @prava-sdk/core
```

For pnpm:
```bash
pnpm add @prava-sdk/core
```

For yarn:
```bash
yarn add @prava-sdk/core
```

### Step 3: Set Up Environment Variables

Create a `.env` or `.env.local` file (depending on framework):

```env
# Prava Configuration
NEXT_PUBLIC_BACKEND_URL=<backend_url>        # or VITE_BACKEND_URL, REACT_APP_BACKEND_URL
MERCHANT_SECRET_KEY=<secret_key>             # Server-side only — NEVER expose to client
NEXT_PUBLIC_PUBLISHABLE_KEY=<publishable_key> # or VITE_PUBLISHABLE_KEY, etc.
```

⚠️ **CRITICAL SECURITY RULE**: The `MERCHANT_SECRET_KEY` (sk_test_xxx / sk_live_xxx) must ONLY be used server-side. NEVER expose it in client-side code, environment variables prefixed with `NEXT_PUBLIC_`, or browser-accessible bundles.

### Step 4: Create Server-Side Session Endpoint

The server must call Prava's backend to create a session. This is where the secret key is used.

**Read the template for the detected framework:**
- Next.js → See `templates/nextjs/server-action.ts`
- Express → See `templates/express/session-route.ts`

**The session creation request requires:**

```typescript
// POST {BACKEND_URL}/v1/sessions
// Headers: Authorization: Bearer {MERCHANT_SECRET_KEY}
// Body:
{
  user_id: string,          // Your app's user identifier
  user_email: string,       // User's email
  amount: string,           // e.g., "99.99"
  currency: string,         // e.g., "USD" (ISO 4217, 3 uppercase letters)
  description?: string,     // e.g., "AI-assisted purchase"
  purchase_context: [       // At least one entry
    {
      merchant_details: {
        name: string,             // Your app/merchant name
        url: string,              // Your website URL
        country_code_iso2: string, // e.g., "US"
        category_code?: string,    // MCC code, e.g., "5411"
        category?: string,         // e.g., "Software Services"
      },
      product_details: [
        {
          description: string,   // Product description
          amount: string,        // Product amount
          quantity?: number,     // Default: 1
        }
      ],
      effective_until_minutes?: number, // Default: 15
    }
  ]
}
```

**The session response returns:**
```typescript
{
  session_token: string,    // JWT token for the session
  iframe_url: string,       // URL to open/embed — this is the card enrollment page
  order_id: string,         // Order tracking ID
  expires_at: string,       // ISO 8601 expiration timestamp
}
```

### Step 5: Create Frontend Integration

There are TWO integration approaches. Choose based on the user's needs:

#### Approach A: Embed iframe in the page (richer UX)

Use the `PravaSDK` class to mount an iframe inside a container in the page. This gives you real-time events (validation, success, errors).

```typescript
import { PravaSDK } from '@prava-sdk/core';

const prava = new PravaSDK({ publishableKey: 'pk_test_xxx' });

// After creating session on the server:
await prava.collectPAN({
  sessionToken: session.session_token,
  iframeUrl: session.iframe_url,
  container: '#card-form',        // DOM element or CSS selector
  onReady: () => { /* iframe loaded */ },
  onChange: (state) => { /* real-time validation state */ },
  onSuccess: (result) => { /* card enrolled! result.enrollmentId, result.last4 */ },
  onError: (error) => { /* handle error */ },
});
```

See `templates/nextjs/card-form-component.tsx` for a full React component.

#### Approach B: Open in new tab (simpler)

Just open the `iframe_url` in a new browser tab. The user completes everything there and gets redirected back.

```typescript
// After creating session on the server:
// iframe_url already contains the session token
window.open(session.iframe_url, '_blank');
```

The user enters their card, completes passkey registration, sees the success page, and is redirected back to the merchant's URL.

See `templates/vanilla/integration.html` for a complete example.

### Step 6: Handle Results

After successful enrollment:

**Embedded approach** — listen for the `onSuccess` callback:
```typescript
onSuccess: (result) => {
  console.log('Card enrolled:', result.enrollmentId);
  console.log('Card:', result.brand, '****', result.last4);
  // Store enrollmentId for future repeat purchases
}
```

**New tab approach** — the user is redirected back to your URL after completion.

### Step 7: Provide Test Data

For sandbox testing, use:
- **Card number**: `4111 1111 1111 1111`
- **Expiry**: `12/28`
- **CVV**: `123`

---

## Framework-Specific Instructions

### Next.js (App Router)

1. Create server action at `src/app/actions.ts` (or `src/lib/prava.ts`)
   → Use template: `templates/nextjs/server-action.ts`

2. Create card form component at `src/components/PravaCardForm.tsx`
   → Use template: `templates/nextjs/card-form-component.tsx`

3. Integrate into a page
   → Use template: `templates/nextjs/page-integration.tsx`

4. Add env vars to `.env.local`
   → Use template: `templates/nextjs/env.example`

### Express.js

1. Create session route at `routes/prava-session.ts`
   → Use template: `templates/express/session-route.ts`

2. Frontend: Use either embedded iframe or new-tab approach
   → Use template: `templates/vanilla/integration.html` or `templates/nextjs/card-form-component.tsx`

3. Add env vars to `.env`
   → Use template: `templates/express/env.example`

### Vanilla JS / Other

1. Backend: Create a session endpoint using any HTTP framework
   → Reference the session API in `references/session-api-reference.md`

2. Frontend: Open iframe URL in new tab
   → Use template: `templates/vanilla/integration.html`

---

## Common Issues & Troubleshooting

| Issue | Solution |
|-------|----------|
| `publishableKey must start with "pk_"` | Make sure you're using the publishable key (not secret key) on the frontend |
| `401 Invalid API key` on session creation | The secret key is wrong, or `Authorization: Bearer` header is malformed |
| Iframe not loading | Check that the `iframe_url` from the session response is valid, and CORS isn't blocking |
| `MERCHANT_SECRET_KEY not configured` | Add it to `.env.local` (Next.js) or `.env` — server-side only |
| Session expired | Sessions have a TTL (usually 15 mins). Create a new session if expired |
| Passkey not working | Ensure the browser supports WebAuthn. Test in Chrome/Edge/Safari |

---

## Security Checklist

Before going live, verify:

- [ ] `MERCHANT_SECRET_KEY` is ONLY used server-side (never in client bundles)
- [ ] `publishableKey` is the only key used client-side
- [ ] Session creation happens on your server, not from the browser
- [ ] You're using HTTPS in production
- [ ] CORS is properly configured on your server
- [ ] You validate the session response before using it

---

## Reference Files

For detailed API documentation, see:
- `references/sdk-api-reference.md` — Full PravaSDK class API
- `references/session-api-reference.md` — Session creation endpoint details
- `references/integration-flow.md` — Visual flow diagrams
- `references/test-data.md` — Test cards and sandbox data
