# Prava SDK API Reference

## Installation

```bash
npm install @prava-sdk/core
```

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

Collects card data via a secure iframe. Returns a Promise that resolves on successful enrollment.

```typescript
const result: CollectPANResult = await prava.collectPAN(options: CollectPANOptions);
```

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `sessionToken` | `string` | ✅ | Session token from your backend (from `POST /v1/sessions` response) |
| `iframeUrl` | `string` | ✅ | Iframe URL from your backend session response |
| `container` | `string \| HTMLElement` | ✅ | CSS selector or DOM element where the card form iframe will be mounted |
| `onReady` | `() => void` | | Called when the iframe is loaded and ready for input |
| `onChange` | `(state: CardValidationState) => void` | | Called on every input change with real-time validation state |
| `onSuccess` | `(result: CollectPANResult) => void` | | Called on successful card enrollment |
| `onError` | `(error: PravaError) => void` | | Called when an error occurs |
| `styles` | `CardFormStyles` | | Custom styles for the card form inside the iframe |

#### Return Value: `CollectPANResult`

```typescript
interface CollectPANResult {
  enrollmentId: string;  // Unique enrollment identifier
  last4: string;         // Last 4 digits of the card
  brand: string;         // Card brand: "visa", "mastercard", etc.
  expMonth: number;      // Expiry month (1-12)
  expYear: number;       // Expiry year (e.g., 2028)
}
```

#### Error Codes

| Code | Meaning |
|------|---------|
| `SDK_ALREADY_ACTIVE` | A card collection session is already in progress |
| `INVALID_CONFIG` | iframeUrl is missing or invalid |
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
| `PRAVA_SUCCESS` | `CollectPANResult` | Card enrolled successfully |
| `PRAVA_ERROR` | `PravaError` | An error occurred |
| `PRAVA_RESIZE` | `{ height: number }` | Iframe requests height change |
| `PRAVA_ENROLLMENT_COMPLETE` | Enrollment data | Full enrollment completed |
| `PRAVA_SAVED_CARDS_LOADED` | Cards list | Saved cards loaded (repeat flow) |
| `PRAVA_PASSKEY_VERIFY_REQUIRED` | Passkey data | Passkey verification needed |
| `PRAVA_TRANSACTION_COMPLETE` | Transaction data | Payment transaction completed |
| `PRAVA_TRANSACTION_CREATED` | Transaction data | Transaction created |

### SDK → Iframe Commands

| Command | Description |
|---------|-------------|
| `PRAVA_INIT` | Initialize iframe with publishableKey and styles |
| `PRAVA_SUBMIT` | Trigger form submission |
| `PRAVA_FOCUS` | Focus a specific field |
| `PRAVA_CLEAR` | Clear form fields |
| `PRAVA_PASSKEY_VERIFY_COMPLETE` | Passkey verification result |
| `PRAVA_PASSKEY_VERIFY_FAILED` | Passkey verification failed |

---

## Iframe Security

The SDK configures the iframe with strict security:

- **Sandbox**: `allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox`
- **Permissions**: `payment; publickey-credentials-get; publickey-credentials-create`
- **Origin validation**: PostMessage communication is restricted to the iframe's origin only
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
