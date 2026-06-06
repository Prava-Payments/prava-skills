# Setup Reference

Use this when the user asks to install/configure Zepto + Prava, when Zepto tools are missing, or when Zepto auth is absent/stale. Keep the Zepto server command identical across hosts and adapt only the MCP configuration mechanism to the current agent runtime.

## Fast-Path Setup Policy

Do the smallest check that proves the existing setup is usable.

- If `zepto` is already configured with `npx --yes mcp-remote https://mcp.zepto.co.in/mcp`, do not remove/re-add it.
- If `mcp-remote` connects and returns Zepto tools, do not ask the user to re-authenticate.
- If `PRAVA_SKILL_VERSION=2.2.0 prava status` returns `active`, do not run `prava setup`, relink the agent, or reinstall Prava.
- If `npm`, `npx`, or `prava` is not on PATH, check common existing install locations before installing anything: active shell profile, NVM Node versions under `~/.nvm/versions/node/*/bin`, Homebrew paths, and the current host's bundled runtime paths when available.
- Treat setup as a fallback, not the default path for every order.

For a quick read-only diagnosis, run the bundled doctor:

```bash
node <skill-dir>/scripts/zepto-prava-doctor.mjs
```

The doctor checks `npx`, `prava`, `prava status`, Codex Zepto MCP config when Codex is present, and Zepto MCP tool reachability. It must not install packages, relink Prava, mutate the Zepto cart, or create orders.

## Zepto MCP Setup

### Detect the current MCP host

First identify the host you are running in:

- **Codex**: Codex Desktop/CLI with `codex mcp ...` available.
- **Claude Code**: `claude mcp ...` available.
- **Gemini CLI**: Gemini CLI with a `settings.json` containing `mcpServers`.
- **Other MCP CLI/client**: any client that supports stdio MCP servers with a `command` and `args` shape.

The portable Zepto server definition is:

```json
{
  "command": "npx",
  "args": ["--yes", "mcp-remote", "https://mcp.zepto.co.in/mcp"]
}
```

Use this definition with the current host. Do not hard-code Codex commands when running in Claude Code, Gemini CLI, or another MCP client.

### Codex

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

If Codex lists `zepto` correctly but the current session does not expose Zepto tools, do not reinstall or re-auth by default. Use the direct stdio fallback below for the current order, then suggest a fresh Codex session only as a convenience for future runs.

### Claude Code

Check current MCP servers:

```bash
claude mcp list
claude mcp get zepto
```

Add the Zepto stdio bridge if missing:

```bash
claude mcp add --transport stdio zepto -- npx --yes mcp-remote https://mcp.zepto.co.in/mcp
```

Verify with:

```bash
claude mcp list
claude mcp get zepto
```

If Claude Code marks a project-scoped MCP server as pending approval, open Claude Code interactively and approve it from the MCP prompt or `/mcp` panel before shopping.

### Gemini CLI

Gemini CLI uses `mcpServers` in its active `settings.json`. Add or merge:

```json
{
  "mcpServers": {
    "zepto": {
      "command": "npx",
      "args": ["--yes", "mcp-remote", "https://mcp.zepto.co.in/mcp"],
      "timeout": 600000,
      "trust": false
    }
  }
}
```

Restart Gemini CLI or reload MCP discovery after editing settings. Use Gemini CLI's `/mcp` command or equivalent server list to verify that the `zepto` tools are visible.

### Other MCP CLI/client

Configure a stdio MCP server named `zepto` with:

```json
{
  "mcpServers": {
    "zepto": {
      "command": "npx",
      "args": ["--yes", "mcp-remote", "https://mcp.zepto.co.in/mcp"]
    }
  }
}
```

If the client requires TOML, YAML, or a CLI command instead of JSON, translate the same `command` and `args` fields without changing the underlying command. Prefer stdio because `mcp-remote` handles Zepto OAuth.

## Zepto Auth Setup

Trigger the mcp-remote OAuth flow. In normal MCP clients this happens when the Zepto MCP server starts. If the current agent session does not expose Zepto tools yet, run a manual smoke test:

```bash
npx --yes mcp-remote https://mcp.zepto.co.in/mcp
```

Send an MCP initialize message if you are manually probing stdio:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"codex-zepto-auth-check","version":"0.1.0"}}}
```

The bridge should print an authorization URL like `https://auth.zepto.co.in/authorize?...`. Show that URL to the user and ask them to complete the Indian mobile number + OTP flow. Keep the process alive until it prints that it connected to the remote server and established the proxy. Then stop it with Ctrl-C if this was only a manual smoke test; mcp-remote caches the auth state locally.

If the bridge connects and `tools/list` returns Zepto tools, auth is already usable. Continue shopping through the direct stdio fallback if the active host cannot hot-load tools. Do not ask the user to restart before completing the current order.

### Direct Stdio MCP Fallback

Use this fallback when the host has Zepto configured through `mcp-remote` but does not expose callable Zepto tools in the current agent turn. Keep one `npx --yes mcp-remote https://mcp.zepto.co.in/mcp` process alive and send JSON-RPC messages over stdio:

1. Send `initialize`.
2. Send `notifications/initialized`.
3. Optionally call `tools/list` to confirm tool names.
4. Call tools with `tools/call`, e.g. `list_saved_addresses`, `select_saved_address`, `get_past_order_items`, `search_multiple_products`, `update_cart`, `view_cart`, `get_payment_methods`, `create_online_payment_order`, and `check_payment_status`.

Important behavior for speed:

- Reuse a single MCP process for the whole order instead of starting a new process for every tool call.
- Wait for the `initialize` response before sending later MCP calls, otherwise the remote server can reject requests for missing session headers.
- Parse `structuredContent` first; if absent, parse text content as JSON when possible.
- Close the process after the order completes or fails.

Prefer the bundled helper script instead of hand-writing the JSON-RPC bridge:

```bash
node <skill-dir>/scripts/zepto-mcp-runner.mjs --list-tools
node <skill-dir>/scripts/zepto-mcp-runner.mjs list_saved_addresses
node <skill-dir>/scripts/zepto-mcp-runner.mjs search_multiple_products '{"queries":["papaya","pumpkin seeds","Amul dark chocolate"],"pageNumber":0}'
```

For multi-step fallback flows, create a temporary batch JSON file and run it once so address selection, cart updates, cart view, payment methods, and preview share a single MCP process:

```bash
node <skill-dir>/scripts/zepto-mcp-runner.mjs --batch /tmp/zepto-calls.json
```

The helper auto-discovers `npx` from PATH, NVM versions under `~/.nvm/versions/node/*/bin`, `~/.npm-global/bin`, Homebrew paths, and Codex app resources. If `npx` is installed elsewhere, set `ZEPTO_NPX_PATH=/path/to/npx`. Do not install Node/npm just because the current shell PATH is incomplete.

## Zepto Tool Readiness Check

Once Zepto tools are visible or reachable through the direct stdio fallback, call only the read-only tools needed for the current order:

1. `list_saved_addresses` to resolve the delivery address.
2. `get_past_order_items` before product search.
3. `get_user_details` only if registration state blocks shopping or the payment form later requires a cardholder name.

If there are no saved addresses, use `add_saved_address` only with user-provided address details and coordinates. Do not fabricate address IDs or coordinates.

## Prava Setup

Read and follow the active `$prava-pay` skill. Use the Prava setup platform/name appropriate to the current host; do not hard-code Codex if you are running in Claude Code, Gemini CLI, or another agent.

First find an existing CLI:

1. Run `which prava`.
2. If not found, check common existing Node install paths such as `~/.nvm/versions/node/*/bin/prava` before installing.
3. Only install `@prava-sdk/cli` if no existing `prava` binary is available.

At minimum:

```bash
which prava
PRAVA_SKILL_VERSION=2.2.0 prava status
```

If `prava status` is `active`, reuse it. The approval page may show the linked agent name from that active Prava setup, even if it differs from the current host. If `prava status` is not `active`, follow `$prava-pay` setup exactly. Do not ask for raw card details. Prava returns tokenized payment credentials only after the user approves the Prava authorization URL.

## Browser Automation Setup

The Zepto MCP creates the payment link, but Prava card fulfillment requires browser automation on the Zepto/Juspay payment page.

Preferred order:

1. Use the Codex in-app browser when available.
2. Use another controllable browser only with user permission.
3. If no browser control is available, stop before creating the real Zepto payment link and explain that card checkout cannot be completed.

Do not create the short-lived Zepto payment link until Prava credentials are ready and the browser route is available.
