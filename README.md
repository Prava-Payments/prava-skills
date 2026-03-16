# Prava Skills

This repository contains **skills** for the [Prava](https://prava.space) ecosystem — the payment stack for AI agents.

## What are Skills?

Skills are structured instruction sets designed for AI coding agents (like Cline, Cursor, etc.). They provide the context, templates, and step-by-step guidance an AI agent needs to integrate Prava into any application — without hallucinating APIs or inventing incorrect patterns.

Each skill includes:
- **`SKILL.md`** — The main instruction file with integration steps, security rules, and framework-specific guidance
- **`references/`** — Detailed API docs, flow diagrams, and test data
- **`templates/`** — Ready-to-use code templates for different frameworks

## Available Skills

| Skill | Description |
|-------|-------------|
| [`prava-sdk-integration`](./prava-sdk-integration/) | Integrate Prava's payment SDK — securely collect cards, enroll for tokenized payments (Visa), and enable repeat purchases with passkey (biometric) verification. No card details ever exposed to the AI. |

## Repository Structure

```
skills/
└── prava-sdk-integration/
    ├── SKILL.md                          # Main skill instructions
    ├── references/
    │   ├── sdk-api-reference.md          # Full PravaSDK class API
    │   ├── session-api-reference.md      # Session creation endpoint details
    │   ├── integration-flow.md           # Visual flow diagrams
    │   └── test-data.md                  # Test cards and sandbox data
    └── templates/
        ├── nextjs/                       # Next.js App Router templates
        │   ├── server-action.ts
        │   ├── card-form-component.tsx
        │   ├── page-integration.tsx
        │   └── env.example
        ├── express/                      # Express.js templates
        │   ├── session-route.ts
        │   └── env.example
        └── vanilla/                      # Vanilla JS template
            └── integration.html
```

## How to Use

1. Point your AI coding agent at this repository (or add it as a skill source)
2. Ask it to "integrate Prava payments" or "add card enrollment"
3. The agent will follow the skill instructions to set up the SDK, create server-side session endpoints, and build the frontend integration
4. Provide your Prava credentials (publishable key, secret key, backend URL) when prompted

## About Prava

[Prava](https://prava.space) enables AI apps to accept card payments without ever seeing raw card details. Cards are tokenized with the networks (Visa) and secured with passkeys (biometrics) — giving AI agents the ability to make purchases on behalf of users in a PCI-compliant, secure way.

---

*Built by [Prava Payments](https://prava.space)*
