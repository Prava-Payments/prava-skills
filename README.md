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
| [`prava-agent-payments`](./prava-agent-payments/) | **AI Agents** | Collect card payments via the Prava CLI. Install CLI, link agent to user's Prava account, create payment sessions, receive tokenized credentials (Visa network token + dynamic CVV), and complete purchases. |
| [`prava-sdk-integration`](./prava-sdk-integration/) | **Merchants / Developers** | Integrate Prava's payment SDK into web apps. Securely collect cards via PCI-compliant iframe, enroll for Visa tokenized payments, enable repeat purchases with passkey verification. Includes templates for Next.js, Express, and Vanilla JS. |

## Repository Structure

```
prava-agent-payments/              # Skill for AI agents (CLI-based)
├── SKILL.md                       # Main skill instructions
├── evals/
│   └── evals.json                 # Skill evaluation test cases
└── references/
    ├── cli-setup.md               # Agent linking flow
    ├── cli-status.md              # Status check states
    └── cli-sessions.md            # Payment session + credential output

prava-sdk-integration/             # Skill for merchants (SDK-based)
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
npx skills add https://github.com/Prava-Payments/prava-skills --global --yes
```

Or install a specific skill:

```bash
# Agent payment collection skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill prava-agent-payments --global --yes

# Merchant SDK integration skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill prava-sdk-integration --global --yes
```

### Install CLI (for Agent Payment Collection)

```bash
npm install -g @prava-sdk/cli
```

Then ask your AI agent to "buy something" or "pay with Prava". The agent skill guides agent linking and the full payment flow.

### For SDK Integration

Point your AI coding agent at this repository and ask it to "integrate Prava payments". The SDK skill guides the agent through setting up the SDK, creating server-side session endpoints, and building the frontend integration.

## About Prava

[Prava](https://prava.space) enables AI apps to accept card payments without ever seeing raw card details. Cards are tokenized with the networks (Visa) and secured with passkeys (biometrics) — giving AI agents the ability to make purchases on behalf of users in a PCI-compliant, secure way.

---

*Built by [Prava Payments](https://prava.space)*
