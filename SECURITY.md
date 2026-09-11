# Security

These skills drive the Prava CLI (`@prava-sdk/cli`) so an AI agent can pay merchants with
tokenized cards. Because that means an agent handling payment credentials, here is exactly what
the skills do and the controls that bound them. If you find a vulnerability, email
**security@prava.space** — please don't open a public issue.

## What the agent can and cannot do

- **The agent never sees a raw card number.** The user enters card details on Prava's page
  (stored in a PCI Level 1 vault, Skyflow); the agent only ever receives a **single-use network
  token + dynamic cryptogram** scoped to one merchant and amount, expiring in ~30 minutes.
- **Every charge is scoped at the network level** to a specific merchant, product, and price. A
  token minted for `$8.50 at Blue Bottle` cannot be replayed elsewhere or for a different amount.
- **A human approves every payment with a passkey** (Face ID / Touch ID / Windows Hello) in their
  own browser. The agent cannot self-approve.
- **The skills add a second, in-conversation confirmation** before minting any session: the agent
  must state the merchant and total and get an explicit "yes" first (`prava-pay` step 3 /
  `prava-shopping` step 4). This catches a wrong merchant or mis-typed amount before it reaches the
  passkey prompt.

## Install & privileges

- **The agent does not install the CLI, and never uses `sudo`.** If `@prava-sdk/cli` is missing,
  the skills instruct the agent to *ask the user* to run `npm install -g @prava-sdk/cli` under
  their own control. Global installs and privilege escalation are out of scope for the agent.

## The CLI itself

- **One runtime dependency** (`commander`) — minimal supply-chain surface.
- **Requests are signed** with a locally generated Ed25519 keypair; the private key never leaves
  the machine (`~/.prava/agent.json`).
- **No telemetry.** The only outbound calls are to the Prava API to create/poll payment sessions.
  The CLI reports the driving skill name/version (via `X-Skill-Name` / `PRAVA_SKILL_VERSION`) only
  to check version compatibility.
- **PII stays server-side.** For shopping, delivery address and phone are stored and injected by
  the wallet at quote time; the agent only ever sees masked summaries.

## Reporting

Security issues → **security@prava.space**. Product/security docs → https://prava.space/security.
