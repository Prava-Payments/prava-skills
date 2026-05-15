# CLI Status — Check Agent State

## Command

```bash
prava status
```

## Output varies by state

### No agent configured

```
No agent configured. Run: prava setup --name "<name>"
```

Exit code: 2

### Pending (not yet approved)

```
Agent:   Claude Code
Status:  pending
Link:    Waiting for approval.
```

Exit code: 2

### Active (linked)

```
Agent:   Claude Code (aa_7kMnP2)
Status:  active
Linked:  2026-05-02
```

Exit code: 0

### Active but server unreachable

```
Agent:   Claude Code (aa_7kMnP2)
Status:  active (offline)
Linked:  2026-05-02
```

Falls back to local data when the server can't be reached.
Exit code: 0
