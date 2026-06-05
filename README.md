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
| [`prava-merchants-checkout/swiggy-prava-skill`](./prava-merchants-checkout/swiggy-prava-skill/) | **AI Agents** | Merchant checkout skill for Swiggy orders using Swiggy MCP cart setup and Prava tokenized card payment. |
| [`prava-merchants-checkout/zepto-prava-skill`](./prava-merchants-checkout/zepto-prava-skill/) | **AI Agents** | Merchant checkout skill for Zepto orders using Zepto MCP cart setup, Zepto/Juspay payment links, and Prava tokenized card payment. |

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

prava-merchants-checkout/          # Merchant-specific checkout skills
├── swiggy-prava-skill/
│   ├── SKILL.md                   # Swiggy MCP + Prava card checkout workflow
│   ├── agents/
│   │   └── openai.yaml            # UI metadata and MCP dependencies
│   └── references/
│       ├── setup.md               # Swiggy MCP, browser access, and Prava setup
│       └── checkout-protocol.md   # Cart, Prava session, and browser card checkout
└── zepto-prava-skill/
    ├── SKILL.md                   # Zepto MCP + Prava card checkout workflow
    ├── agents/
    │   └── openai.yaml            # UI metadata and MCP dependencies
    └── references/
        ├── setup.md               # Zepto MCP auth, browser access, and Prava setup
        └── checkout-protocol.md   # Cart, payment link, Prava session, and card checkout

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
# Prava wallet skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill prava-pay --global --yes --full-depth

# AI application SDK integration skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill prava-sdk-integration --global --yes --full-depth

# Swiggy merchant checkout skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill swiggy-prava-skill --global --yes --full-depth

# Zepto merchant checkout skill
npx skills add https://github.com/Prava-Payments/prava-skills --skill zepto-prava-skill --global --yes --full-depth
```

Use `--full-depth` when installing a single skill so sibling skills are not installed alongside the requested one.

### Merchant Checkout MCP Support

The merchant checkout skills use MCP servers to build and verify carts before Prava payment:

- **Swiggy**: `swiggy-prava-skill` supports Swiggy Food, Instamart, and Dineout MCP setup plus browser-based card checkout with Prava credentials.
- **Zepto**: `zepto-prava-skill` supports Zepto MCP setup via `npx --yes mcp-remote https://mcp.zepto.co.in/mcp`, Zepto OAuth/mobile OTP auth, Zepto cart/payment-link creation, and deterministic Zepto/Juspay card checkout with Prava credentials.

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
