# Internal: How an Agent Integrates Prava (End-to-End)

> Internal reference doc. Assumes all services are deployed and live.

## System Components

| Component | Domain | Repo | Purpose |
|---|---|---|---|
| Core Backend | `api.prava.space` | `prava-core-monorepo` | Agent APIs, session management, Visa tokenization |
| Wallet UI | `wallet.prava.space` | `prava-wallet-dashboard/wallet-ui` | User-facing dashboard, agent approval page |
| Wallet Backend | `wallet.prava.space/api` | `prava-wallet-dashboard/wallet-backend` | Wallet API, proxies approval to core backend |
| CLI | npm `@prava-sdk/cli` | `prava-skills/src` | Agent-side tool, installed globally |
| Skill | `npx skills add ...` | `prava-skills/prava-sdk-integration` | Instructions that teach AI agents the integration flow |

## How an Agent Gets Set Up

### Step 0: Skill installation

A user (or their AI coding agent) adds the prava skill:

```bash
npx skills add prava-skills --global --yes
```

This makes the `prava-sdk-integration` skill available. When the agent encounters a payment task, the skill activates and guides everything below.

### Step 1: CLI installation check

The skill tells the agent to check if the CLI exists before anything else:

```bash
which prava || npm install -g @prava-sdk/cli
```

If not installed, the agent runs `npm install -g @prava-sdk/cli` (public npm package under `@prava` org).

### Step 2: Agent linking (`prava setup`)

```bash
prava setup --name "Claude Code" --description "Anthropic's coding agent"
```

**What happens under the hood:**

1. CLI generates an Ed25519 keypair + a random `link_id` (`lk_...`)
2. Saves to `~/.prava/agent.json` (permissions 0600)
3. Constructs a URL:
   ```
   https://wallet.prava.space/link-agent?lid=lk_xxx&pk=<base64_pubkey>&n=Claude+Code&d=...
   ```
4. Prints the URL and starts polling `GET api.prava.space/v1/agents/link/status?lid=lk_xxx`

**What the user does:**

1. Opens the URL → lands on `wallet.prava.space/link-agent`
2. Authenticates via Clerk (login/signup)
3. Sees agent name, description, and permissions it's requesting
4. Clicks "Approve"
5. Wallet UI POSTs to `wallet.prava.space/api/agents/link` → proxied to core backend `POST /v1/wallet/agents/link/approve`
6. Core backend stores the agent's public key, marks link as approved

**Back on the CLI:**

- Polling detects `status: "approved"` + receives `agent_id`
- Updates `~/.prava/agent.json` with `agent_id`, sets `linked: true`
- Prints "Linked! Agent ID: aa_..."

**Timeout:** 15 minutes. If not approved, CLI exits with code 1.

### Step 3: Status check (`prava status`)

```bash
prava status
```

- Reads `~/.prava/agent.json`
- If linked, verifies with `GET api.prava.space/v1/agents/link/me` (signed request)
- Falls back to local data if server unreachable
- Exit 0 = active, Exit 2 = not configured or pending

### Step 4: Payment collection (`prava sessions create`)

```bash
prava sessions create \
  --total-amount "8.50" --currency USD \
  --merchant-name "Blue Bottle Coffee" \
  --merchant-url "https://bluebottlecoffee.com" \
  --merchant-country US \
  --product '{"description":"1x Latte","unit_price":"5.00"}' \
  --product '{"description":"1x Croissant","unit_price":"3.50"}'
```

**What happens:**

1. **Auto-link-check**: If local store says `linked: false`, CLI checks `GET /v1/agents/link/status?lid=...` to see if approval happened since last check. If approved, updates local store and continues. If not, exits with code 2.

2. **Signed request**: CLI POSTs to `api.prava.space/v1/sessions/agent` with:
   - Headers: `X-Agent-Id`, `X-Timestamp`, `X-Signature` (Ed25519 signature of `timestamp + body`)
   - Body: amount, currency, merchant details, products

3. **Response**: Backend returns `session_id`, `payment_url`, `expires_at`
   - `payment_url` is a URL to the Prava collect iframe (e.g., `https://collect.prava.space?session=<jwt>`)

4. **CLI prints the payment URL** → agent shows it to the user

5. **User opens URL**: Enters card (first time) or picks saved card (repeat). Passkey (biometric) verification. Card tokenized with Visa.

6. **CLI polls**: `GET api.prava.space/v1/sessions/agent/<session_id>/payment-result` (signed)
   - Backend returns encrypted payload (AES-256-GCM)
   - CLI derives AES key: `SHA-256(agent_public_key + nonce)`
   - Decrypts to get: `token` (16-digit Visa network token), `cryptogram` (3-digit dynamic CVV), `expiry_month`, `expiry_year`

7. **CLI prints credentials** → agent immediately uses them to complete checkout at the merchant

**Timeout:** 10 minutes polling. Exponential backoff from 3s to 20s.

### Step 5: Complete the purchase

The agent takes the token + cryptogram + expiry and completes checkout at the merchant (via browser automation or API). Token TTL is 30 minutes.

## Request Signing (All Authenticated Requests)

Every CLI request to agent-specific endpoints includes:

```
X-Agent-Id:   aa_xxx          # from ~/.prava/agent.json
X-Timestamp:  1714700000      # unix epoch seconds
X-Signature:  <base64>        # Ed25519 sign(privateKey, timestamp + body)
```

- No URL in the signature — only timestamp and body
- Server verifies using the agent's stored public key
- Stale timestamps are rejected (replay protection)

## Version Control

The core backend returns `X-Min-CLI-Version` header on every response (Fastify `onSend` hook).

- Configured via `MIN_CLI_VERSION` env var on backend (default: `0.0.1`)
- CLI compares against its own version from `package.json`
- Major version mismatch → hard block, `process.exit(1)`, forces `npm update -g @prava-sdk/cli`
- Minor/patch mismatch → warning, continues working

This is the server-side kill switch for deprecating old CLI versions.

## Data Flow Diagram

```
Agent (AI)                    CLI (~/.prava/)              Core Backend              Wallet Dashboard
    │                              │                      (api.prava.space)       (wallet.prava.space)
    │                              │                            │                          │
    │─ "buy coffee" ──────────────▶│                            │                          │
    │                              │                            │                          │
    │  [skill activates]           │                            │                          │
    │  check: which prava          │                            │                          │
    │  install if missing          │                            │                          │
    │                              │                            │                          │
    │─ prava setup ───────────────▶│                            │                          │
    │                              │── keygen + link_id ──────▶ │                          │
    │                              │                            │                          │
    │◀─ approval URL ─────────────│                            │                          │
    │                              │                            │                          │
    │─ show URL to user ─────────────────────────────────────────────────────────────────▶│
    │                              │                            │                          │
    │                              │                            │◀── user approves ────────│
    │                              │                            │                          │
    │                              │◀─ polling detects approval─│                          │
    │◀─ "Linked!" ────────────────│                            │                          │
    │                              │                            │                          │
    │─ prava sessions create ────▶│                            │                          │
    │                              │── signed POST ───────────▶│                          │
    │                              │◀─ session_id + pay_url ───│                          │
    │◀─ payment URL ──────────────│                            │                          │
    │                              │                            │                          │
    │─ show URL to user ──────────────────────────────────────▶│ (collect iframe)         │
    │                              │                            │◀─ card entry ────────────│
    │                              │                            │   visa tokenization      │
    │                              │◀─ encrypted credentials ──│                          │
    │                              │── decrypt (AES-256-GCM) ──│                          │
    │◀─ token + cvv + expiry ─────│                            │                          │
    │                              │                            │                          │
    │─ complete checkout at merchant (browser automation) ─────▶│                          │
```

## Local Storage

`~/.prava/agent.json` (permissions 0600):

```json
{
  "privateKey": "<base64 Ed25519 private key>",
  "publicKey": "<base64 Ed25519 public key>",
  "linkId": "lk_xxx",
  "name": "Claude Code",
  "description": "Anthropic's coding agent",
  "linked": true,
  "agentId": "aa_xxx",
  "linkedAt": "2026-05-03T..."
}
```

Single agent per machine. To switch agents, delete the file and re-run setup.

## Environment Variables (CLI)

| Var | Default | Purpose |
|---|---|---|
| `PRAVA_SERVER_URL` | `https://api.prava.space` | Override core backend URL |
| `PRAVA_DASHBOARD_URL` | `https://wallet.prava.space` | Override approval page URL |

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success (also: setup when already linked — no-op) |
| 1 | Error (network, timeout, invalid input, version mismatch) |
| 2 | Agent not configured or not yet approved |
