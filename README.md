# Prava Skills

This repository contains **skills** for the [Prava](https://prava.space) ecosystem — the payment stack for AI agents.

## What are Skills?

Skills are structured instruction sets designed for AI coding agents (like Claude Code, Cursor, etc.). They provide the context, templates, and step-by-step guidance an AI agent needs to integrate Prava into any application — without hallucinating APIs or inventing incorrect patterns.

Each skill includes:
- **`SKILL.md`** — The main instruction file with integration steps, security rules, and framework-specific guidance
- **`references/`** — Detailed API docs, flow diagrams, and test data
- **`templates/`** — Ready-to-use code templates for different frameworks (SDK skill only)

## Available Skills

| Skill | Audience | Description |
|-------|----------|-------------|
| [`prava-pay`](./prava-pay/) | **AI Agents** | Smart wallet for AI agents. Link to a user's Prava account, create payment sessions, and retrieve tokenized credentials (Visa network token + dynamic CVV) for agent-initiated purchases. For open-source or personal AI agent setups like OpenClaw, Hermes, Claude Code. |
| [`prava-sdk-integration`](./prava-sdk-integration/) | **AI Applications** | Integrate Prava's payment SDK into AI applications. Securely collect cards via PCI-compliant iframe, enroll for Visa tokenized payments, enable repeat purchases with passkey verification. Includes templates for Next.js, Express, and Vanilla JS. |

## Repository Structure

```
prava-pay/                      # Skill for AI agents (CLI-based)
├── SKILL.md                       # Main skill instructions
├── evals/
│   └── evals.json                 # Skill evaluation test cases
└── references/
    ├── cli-setup.md               # Agent linking flow
    ├── cli-status.md              # Status check states
    └── cli-sessions.md            # Payment session + credential output

prava-sdk-integration/             # Skill for AI applications (SDK-based)
├── SKILL.md                       # Main skill instructions
├── references/
│   ├── sdk-api-reference.md       # Full PravaSDK class API
│   ├── session-api-reference.md   # Session creation endpoint details
│   ├── integration-flow.md        # Visual flow diagrams
│   └── test-data.md               # Test cards and sandbox data
└── templates/
    ├── nextjs/                    # Next.js App Router templates
    ├── express/                   # Express.js templates
    └── vanilla/                   # Vanilla JS template

src/                               # CLI source code (@prava-sdk/cli)
```

## How to Use

### Install Skills (for AI Agents)

Install all skills globally:

```bash
npx --yes skills add https://github.com/Prava-Payments/prava-skills --global --yes --full-depth
```

If you are installing from Codex or another sandboxed/non-login agent shell and `npx` is not on PATH, use a PATH-resolving install command:

```bash
NPX="$(command -v npx || find "$HOME/.nvm/versions/node" "$HOME/.npm-global" /opt/homebrew /usr/local -path '*/bin/npx' -type f 2>/dev/null | sort -Vr | head -n 1)" && "$NPX" --yes skills add https://github.com/Prava-Payments/prava-skills --global --yes --full-depth
```

Or install a specific skill:

```bash
# Prava wallet skill
npx --yes skills add https://github.com/Prava-Payments/prava-skills --skill prava-pay --global --yes --full-depth

# AI application SDK integration skill
npx --yes skills add https://github.com/Prava-Payments/prava-skills --skill prava-sdk-integration --global --yes --full-depth
```

Use `--full-depth` when installing a single skill so sibling skills are not installed alongside the requested one.

### Install CLI

```bash
npm install -g @prava-sdk/cli
```

Then ask your AI agent to "buy something" or "pay with Prava". The agent skill guides agent linking and the full payment flow.

### For SDK Integration

Point your AI coding agent at this repository and ask it to "integrate Prava payments". The SDK skill guides the agent through setting up the SDK, creating server-side session endpoints, and building the frontend integration.

## About Prava

[Prava](https://prava.space) is the payment stack for AI agents — securely collect cards via PCI-compliant iframe, tokenize with Visa, protect transactions with passkeys (biometrics), and retrieve one-time payment credentials (network token + dynamic CVV) for agent-initiated purchases. No card details ever exposed to the AI.

---

*Built by [Prava Payments](https://prava.space)*
