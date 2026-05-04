# CLI Setup — Link Agent to Prava

Link this agent to a Prava account. One-time operation.

## Installation

```bash
npm install -g @prava/cli
```

## Command

```bash
prava setup --name "<name>" [--description "<desc>"]
```

- `--name` (required) — Descriptive name. "Claude Code", "Cursor", "Alice's Shopping Bot". Not generic like "My Agent".
- `--description` (optional) — Shown on the approval screen.

## Flow

### Step 1 — Start setup

```bash
prava setup --name "Claude Code" --description "Anthropic's coding agent"
```

The CLI:
- Generates a secure Ed25519 keypair locally
- Prints a linking URL pointing to `wallet.prava.space`
- Polls for approval automatically

Output:
```
To link this agent, open this URL and approve:
https://wallet.prava.space/link-agent?lid=lk_xxx&pk=xxx&n=Claude+Code
Waiting for approval...
```

Show the URL to the user:
> To connect to Prava, open this link and approve:
> [URL from output]

### Step 2 — CLI handles the rest

The CLI automatically detects when the user approves. No further
commands needed. Output continues:

```
Linked! Agent ID: aa_7kMnP2
Ready to create sessions.
```

If the link expires (15 minutes), output:
```
Link expired. Run `prava setup` again.
```

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
- Waiting for user to say "done" — the CLI polls automatically.
