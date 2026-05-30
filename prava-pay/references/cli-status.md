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

### Pending — link still fresh, URL re-printed (CLI 1.1+)

```
Agent:   Claude Code
Status:  pending
Link:    https://pay.prava.space/link-agent?lid=lk_xxx
```

Exit code: 2

### Pending — legacy CLI / no persisted URL

```
Agent:   Claude Code
Status:  pending
Link:    Waiting for approval.
```

Exit code: 2

### Expired — previous setup is past TTL (CLI 1.1+)

```
Link expired. Run `prava setup` again.
```

Printed to stderr. Exit code: 2.

The CLI checks this locally (no network needed) so it works offline. The same string is also emitted by `prava setup poll` when the server returns `expired`.

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
