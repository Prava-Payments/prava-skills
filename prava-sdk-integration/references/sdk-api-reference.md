# Prava SDK API Reference

## Installation

```bash
npm install @prava-sdk/core
```

Use `@prava-sdk/core` **0.1.2 or newer**. Version 0.1.2 requires a valid `iframeUrl` containing a `session` query parameter and emits current pass-through guidance. Application code must still pass the backend URL verbatim: the SDK does not authenticate that query value or convert a JWT into a session ID.

## Package Exports

```typescript
import {
  PravaSDK,              // Main SDK class
  type PravaSDKConfig,   // SDK constructor config
  IframeManager,         // (Advanced) Low-level iframe control
  type IframeConfig,
  PostMessageBridge,     // (Advanced) Low-level PostMessage handling
  type MessageHandler,
  // Types
  type CollectPANOptions,
  type CollectPANResult,
  type PravaError,
  type CardValidationState,
  type FieldState,
  type CardFormStyles,
} from '@prava-sdk/core';
```

---

## `PravaSDK` Class

### Constructor

```typescript
const prava = new PravaSDK(config: PravaSDKConfig);
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `publishableKey` | `string` | ✅ | Your publishable key. Must start with `pk_test_` (sandbox) or `pk_live_` (production). |

**Throws:** `Error` if publishableKey is missing or doesn't start with `pk_`.

---

### `prava.collectPAN(options)`

Mounts card collection in a secure iframe. The public type returns `Promise<CollectPANResult>`, but the current iframe emits `PRAVA_ENROLLMENT_COMPLETE` and `PRAVA_TRANSACTION_COMPLETE`, not the legacy `PRAVA_SUCCESS` event that resolves this Promise. Start the operation without awaiting it, catch failures, and use the server-side payment lifecycle as the completion authority.

```typescript
const session = await createSessionOnYourServer();

void prava.collectPAN({
  sessionToken: session.session_token,
  iframeUrl: session.iframe_url, // pass the backend value verbatim
  container: '#prava-card-form',
  onReady: () => showCardForm(),
}).catch(showSdkError);
```

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `sessionToken` | `string` | ✅ | Short-lived JWT from `session_token`, passed separately to the SDK |
| `iframeUrl` | `string` | ✅ | Verbatim `iframe_url` from the backend; its `session` query value is `session_id`, not `session_token` |
| `container` | `string \| HTMLElement` | ✅ | CSS selector or DOM element where the card form iframe will be mounted |
| `onReady` | `() => void` | | Called when the iframe is loaded and ready for input |
| `onChange` | `(state: CardValidationState) => void` | | Called on every input change with real-time validation state |
| `onSuccess` | `(result: CollectPANResult) => void` | | Legacy callback tied to `PRAVA_SUCCESS`; current iframe builds do not emit that event, so do not rely on it |
| `onError` | `(error: PravaError) => void` | | Called when an error occurs |
| `styles` | `CardFormStyles` | | Accepted by the SDK type, but the current live iframe does not handle `PRAVA_INIT`, so these styles are presently a no-op |
| `onDismiss` | `(payload: { reason: string }) => void` | | Called when the user dismisses an agentic payment flow |

#### Iframe URL Contract

A create-session response has two distinct values:

```json
{
  "session_id": "ses_01KKW...",
  "session_token": "eyJhbGciOiJIUzI1NiIs...",
  "iframe_url": "https://sandbox.collect.prava.space?session=ses_01KKW..."
}
```

- Pass `session_token` as `sessionToken`.
- Pass `iframe_url` as `iframeUrl` without rebuilding, truncating, or replacing query parameters.
- The iframe looks up `?session=` as a `ses_...` database identifier. A JWT in that query parameter is invalid and produces a preview 404.
- The SDK adds the browser origin needed for PostMessage validation; application code must not add a backend URL.

#### Declared Return Value: `CollectPANResult`

```typescript
interface CollectPANResult {
  enrollmentId: string;  // Unique enrollment identifier
  last4: string;         // Last 4 digits of the card
  brand: string;         // Card brand: "visa", "mastercard", etc.
  expMonth: number;      // Expiry month (1-12)
  expYear: number;       // Expiry year (e.g., 2028)
}
```

The high-level SDK currently listens for `PRAVA_SUCCESS`, while the live iframe emits `PRAVA_ENROLLMENT_COMPLETE` and `PRAVA_TRANSACTION_COMPLETE`; therefore the declared Promise/result and `onSuccess` callback are not a reliable current completion signal. Even when that SDK event is restored, it would confirm iframe/enrollment progress, **not** merchant-processor approval. Obtain payment state from the server-side `payment-result` endpoint. For custom mode, charge the credential server-side at `awaiting_result` and send `report-status` from the actual processor response—never from a browser event, query parameter, or other client assertion.

#### Error Codes

| Code | Meaning |
|------|---------|
| `SDK_ALREADY_ACTIVE` | A card collection session is already in progress |
| `INVALID_CONFIG` | `iframeUrl` is missing, malformed, or lacks a `session` query parameter; pass the backend value verbatim. A present-but-wrong JWT value reaches the iframe and fails preview instead. |
| `IFRAME_LOAD_ERROR` | Failed to load the secure iframe |
| `SDK_INIT_ERROR` | General initialization error |

---

### `prava.destroy()`

Removes the iframe from the DOM, cleans up event listeners, and releases all resources.

```typescript
prava.destroy();
```

Always call this when:
- The component unmounts (React `useEffect` cleanup)
- You want to start a new session
- An error occurred and you need to reset

---

## Types

### `CardValidationState`

Real-time validation state sent via `onChange` callback:

```typescript
interface CardValidationState {
  cardNumber: FieldState;   // Card number field state
  expiry: FieldState;       // Expiry date field state
  cvv: FieldState;          // CVV field state
  isComplete: boolean;      // true when ALL fields are valid
}
```

### `FieldState`

Individual field state:

```typescript
interface FieldState {
  isEmpty: boolean;    // true if field has no input
  isValid: boolean;    // true if field passes validation
  isFocused: boolean;  // true if field is currently focused
  error?: string;      // Error message if invalid
}
```

### `CardFormStyles`

Custom styles for the card form:

```typescript
interface CardFormStyles {
  base?: Record<string, string>;     // Base styles for all fields
  invalid?: Record<string, string>;  // Styles when field is invalid
  focus?: Record<string, string>;    // Styles when field is focused
}
```

Example:
```typescript
const styles: CardFormStyles = {
  base: {
    'font-size': '16px',
    'color': '#1a1a1a',
    'font-family': 'Inter, sans-serif',
  },
  invalid: {
    'color': '#e53e3e',
  },
  focus: {
    'border-color': '#4f46e5',
  },
};
```

### `PravaError`

Error object:

```typescript
interface PravaError {
  code: string;                        // Machine-readable error code
  message: string;                     // Human-readable error message
  details?: Record<string, unknown>;   // Additional context
}
```

---

## PostMessage Events (Advanced)

The SDK communicates with the iframe via PostMessage. These are the event types:

### Iframe → SDK Events

| Event | Payload | Description |
|-------|---------|-------------|
| `PRAVA_READY` | `void` | Iframe is loaded and ready |
| `PRAVA_CHANGE` | `CardValidationState` | Card field validation changed |
| `PRAVA_SUCCESS` | `CollectPANResult` | Legacy event the high-level SDK listens for; current iframe builds do not emit it |
| `PRAVA_ERROR` | `PravaError` | An error occurred |
| `PRAVA_RESIZE` | `{ height: number }` | Iframe requests height change |
| `PRAVA_PASSKEY_VERIFY_REQUIRED` | Passkey request data | Saved-card flow requires passkey verification |
| `PRAVA_ENROLLMENT_COMPLETE` | Enrollment data | An enrollment record was created. This can occur before passkey/FIDO setup and can also precede a later flow failure; it is not payment success. |
| `PRAVA_SAVED_CARDS_LOADED` | Cards list | Saved cards loaded (repeat flow) |
| `PRAVA_TRANSACTION_CREATED` | Transaction data | Transaction created |
| `PRAVA_TRANSACTION_COMPLETE` | `{ callback_url?: string }` | Iframe transaction step completed; this is not processor approval. If `callback_url` is present, the SDK keeps the bridge alive for redirect |
| `PRAVA_REDIRECT` | `{ url: string }` | Iframe requests redirect to merchant callback URL — SDK navigates via `window.location.href` |
| `PRAVA_DISMISSED` | `{ reason: string }` | User dismissed the agentic payment flow; invokes `onDismiss` |
| `PRAVA_SESSION_IN_PROGRESS` | Session data | Session already has an active payment |
| `PRAVA_SESSION_COMPLETED` | Session data | Session was already completed |
| `PRAVA_TRANSACTION_CANCELLED` | Cancellation data | User cancelled the transaction |

### SDK → Iframe Commands

Only the two passkey-result commands are handled by the current live iframe. The other commands remain in the SDK protocol types, but the live iframe has no listener for them; do not build application behavior around them until both sides implement the contract.

| Command | Description |
|---------|-------------|
| `PRAVA_INIT` | Emitted by the SDK with publishable key/styles, but currently ignored by the live iframe |
| `PRAVA_SUBMIT` | Declared protocol command; currently ignored by the live iframe |
| `PRAVA_FOCUS` | Declared protocol command; currently ignored by the live iframe |
| `PRAVA_CLEAR` | Declared protocol command; currently ignored by the live iframe |
| `PRAVA_PASSKEY_VERIFY_COMPLETE` | Send passkey verification result (assuranceData) to iframe |
| `PRAVA_PASSKEY_VERIFY_FAILED` | Notify iframe that passkey verification failed |

---

## Iframe Security

The SDK configures the iframe with strict security:

- **Sandbox**: `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`
- **Permissions**: `payment; publickey-credentials-get; publickey-credentials-create`
- **Origin validation**: PostMessage communication is restricted to the iframe's origin only
- **Session identifier**: the backend-provided `iframe_url` keeps `?session=<session_id>`; `session_token` is never injected into the URL
- **Pass-through rule**: a missing `session` query parameter fails loudly instead of falling back to a JWT
- **No backend URL injection**: The iframe determines its backend URL from its own hostname (not from the merchant)

---

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 80+ |
| Firefox | 80+ |
| Safari | 14+ |
| Edge | 80+ |

WebAuthn/Passkey support requires a browser that supports the Web Authentication API.
