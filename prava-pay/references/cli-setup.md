# CLI Setup — Link Agent to Prava

Link this agent to a Prava account. One-time operation.

## Installation

```bash
npm install -g @prava-sdk/cli
```

## Command

```bash
prava setup --name "<name>" --platform <platform> [--description "<desc>"]
```

- `--name` (required) — Descriptive name. "Claude Code", "Cursor", "Alice's Shopping Bot". Not generic like "My Agent".
- `--platform` (required) — The agent platform. Must be one of: `claude-code`, `codex`, `cursor`, `gemini-cli`, `hermes`, `custom`. The agent determines this automatically from its own identity — never ask the user.
- `--description` (optional) — Shown on the approval screen.

## Flow

### Step 1 — Generate link

```bash
prava setup --name "Claude Code" --platform claude-code --description "Anthropic's coding agent"
```

The CLI:
- Generates a secure Ed25519 keypair locally
- Registers a pending link with the Prava backend (signing the request with the keypair) and receives a server-issued link id
- Prints a short linking URL pointing to `pay.prava.space`
- **Exits immediately** (does NOT block)

Output:
```
To link this agent, open this URL and approve:
https://pay.prava.space/link-agent?lid=lk_xxx

Link expires in 15 minutes.
Run `prava setup poll` to wait for approval.
```

The URL carries only an opaque link id (`lid`). The agent's name, platform, and description are stored on the backend and fetched by the dashboard when the user opens the link. The link expires 15 minutes after it is created; the backend rejects approval of an expired link.

Because the CLI registers the link with the server up front, `prava setup` requires network access. If the server is unreachable, it prints an error and exits non-zero — re-run once connectivity is restored.

Show the URL to the user:
> To connect to Prava, open this link and approve:
> [URL from output]

### Step 2 — Wait for approval

IMMEDIATELY after showing the URL, run — do NOT wait for the user to respond or confirm:

```bash
prava setup poll
```

The user opens the URL in their browser while the poll waits. Polls for up to 15 minutes. Output on success:
```
Waiting for approval of "Claude Code"...
...

Linked! Agent ID: aa_7kMnP2
Ready to create sessions.
```

If the link expires (15 minutes), the output is:
```
Link expired. Run `prava setup` again.
```

Printed to stderr by both `prava status` (local check, works offline) and `prava setup poll` (when server returns `expired`).

Alternatively, you can skip `setup poll` and just check with `prava status` —
it also detects approval for pending agents.

### Already linked

If agent is already linked, setup is a no-op:
```
Already linked as "Claude Code" (aa_7kMnP2).
```
Exit code: 0 (success, not an error).

## After setup

If the user's original intent was a purchase, proceed IMMEDIATELY
to `prava sessions create`. Do not pause.

Otherwise: "Agent linked! Ready to collect payments."

## Anti-Patterns

- Running setup when already linked (check `prava status` first).
- Asking user for credentials. The CLI handles all auth locally.
- Waiting for user to say "done" — run `prava setup poll` or check `prava status`.
