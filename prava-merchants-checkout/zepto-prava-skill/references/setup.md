# Setup Reference

Use this when the user asks to install/configure Zepto + Prava, when Zepto tools are missing, or when Zepto auth is absent/stale.

## Zepto MCP Setup

Check current MCP servers:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp list
/Applications/Codex.app/Contents/Resources/codex mcp get zepto
```

Zepto should be configured as a stdio bridge, not as a direct `url`, because `mcp-remote` handles the OAuth/mobile-OTP flow:

```toml
[mcp_servers.zepto]
command = "npx"
args = ["--yes", "mcp-remote", "https://mcp.zepto.co.in/mcp"]
```

If missing, add it:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp add zepto -- npx --yes mcp-remote https://mcp.zepto.co.in/mcp
```

If Zepto exists as a direct streamable HTTP URL and Codex OAuth login fails with dynamic-registration errors, replace it with the `mcp-remote` stdio bridge:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp remove zepto
/Applications/Codex.app/Contents/Resources/codex mcp add zepto -- npx --yes mcp-remote https://mcp.zepto.co.in/mcp
```

After setup, verify:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp list
/Applications/Codex.app/Contents/Resources/codex mcp get zepto
```

## Zepto Auth Setup

Trigger the mcp-remote OAuth flow. In normal Codex sessions this happens when the Zepto MCP server starts. If the current agent session does not expose Zepto tools yet, run a manual smoke test:

```bash
npx --yes mcp-remote https://mcp.zepto.co.in/mcp
```

Send an MCP initialize message if you are manually probing stdio:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"codex-zepto-auth-check","version":"0.1.0"}}}
```

The bridge should print an authorization URL like `https://auth.zepto.co.in/authorize?...`. Show that URL to the user and ask them to complete the Indian mobile number + OTP flow. Keep the process alive until it prints that it connected to the remote server and established the proxy. Then stop it with Ctrl-C; mcp-remote caches the auth state locally.

After successful auth, restart/open a fresh Codex session if the current session cannot see Zepto tools. Do not make the user manually shop in Zepto just because the active session cannot hot-load the tools.

## Zepto Tool Readiness Check

Once Zepto tools are visible, call read-only tools first:

1. `get_user_details` to confirm the user is registered. If `isRegistered` is false, ask for the user's full name and call `update_user_name`.
2. `list_saved_addresses` to confirm saved delivery addresses exist.
3. `get_past_order_items` before any product search.

If there are no saved addresses, use `add_saved_address` only with user-provided address details and coordinates. Do not fabricate address IDs or coordinates.

## Prava Setup

Read and follow the active `$prava-pay` skill. At minimum:

```bash
which prava
PRAVA_SKILL_VERSION=2.2.0 prava status
```

If `prava status` is not `active`, follow `$prava-pay` setup exactly. Do not ask for raw card details. Prava returns tokenized payment credentials only after the user approves the Prava authorization URL.

## Browser Automation Setup

The Zepto MCP creates the payment link, but Prava card fulfillment requires browser automation on the Zepto/Juspay payment page.

Preferred order:

1. Use the Codex in-app browser when available.
2. Use another controllable browser only with user permission.
3. If no browser control is available, stop before creating the real Zepto payment link and explain that card checkout cannot be completed.

Do not create the short-lived Zepto payment link until Prava credentials are ready and the browser route is available.
