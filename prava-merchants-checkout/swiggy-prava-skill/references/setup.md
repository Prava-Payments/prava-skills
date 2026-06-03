# Setup Reference

Use this when the user asks to install or configure Swiggy + Prava, or when required tools are missing.

## Swiggy MCP Setup

Check current MCP servers:

```bash
codex mcp list
```

Add the Swiggy MCP servers if missing:

```bash
codex mcp add swiggy-instamart --url https://mcp.swiggy.com/im
codex mcp add swiggy-food --url https://mcp.swiggy.com/food
codex mcp add swiggy-dineout --url https://mcp.swiggy.com/dineout
```

If `codex mcp add` starts OAuth, show the authorization URL to the user and keep the command running until login succeeds.

After setup, verify:

```bash
codex mcp list
codex mcp get swiggy-food
codex mcp get swiggy-instamart
codex mcp get swiggy-dineout
```

If the current agent session cannot see newly added MCP tools, do one of:
- Start a fresh Codex subprocess with `codex exec` for Swiggy MCP read/cart work and relay results in the current chat.
- Ask the user to restart/open a fresh agent session if the host cannot hot-load MCP servers.

Do not make the user leave chat to search Swiggy or edit the cart. Use MCP once available.

## Browser Automation Setup

Swiggy MCP is not enough for Prava card fulfillment. It can prepare/read the cart and may place pay-on-delivery orders, but card checkout requires a browser because the Prava token must be entered into Swiggy's card payment flow.

At payment time, ask the user for browser automation access:

- Prefer the Codex in-app browser when available.
- If the user is already logged in to Swiggy in another local browser, ask for permission to control that browser/session in the current environment.
- If no controllable logged-in browser is available, ask the user to log in inside the controllable browser before creating the Prava session.

Do not create the Prava session until browser access is confirmed and the checkout page/cart can be reached. Prava credentials are short-lived.

## Prava Skill and CLI Setup

Install the Prava Pay skill if missing:

```bash
npx skills add https://github.com/Prava-Payments/prava-skills --skill prava-pay --global --yes
```

Install the Prava CLI if missing:

```bash
which prava
npm install -g @prava-sdk/cli
prava --version
```

If global npm install fails due to permissions, ask before using sudo:

```bash
sudo npm install -g @prava-sdk/cli
```

If the installed `prava-pay` skill is available on disk, read its `SKILL.md` and use its current version in the `PRAVA_SKILL_VERSION` environment variable. If the version cannot be discovered, run Prava commands without the variable and follow CLI update prompts.

Minimum Prava link check:

```bash
PRAVA_SKILL_VERSION=<version> prava status
```

Decision tree:
- `active`: continue to cart/payment flow.
- `active (offline)`: retry with network access before payment.
- `pending`: show the existing link if printed, then immediately run `prava setup poll`.
- `Link expired`: ask before generating a fresh setup link.
- `No agent configured`: run setup for the current agent platform, show the link, then immediately poll.

Codex setup example:

```bash
PRAVA_SKILL_VERSION=<version> prava setup --name "Codex" --platform codex
PRAVA_SKILL_VERSION=<version> prava setup poll
```

Never ask for the user's raw card number. Prava handles card entry/approval and returns a Visa network token, one-time cryptogram, and expiry for checkout.
