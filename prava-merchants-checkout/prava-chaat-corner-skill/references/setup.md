# Setup Reference

Use this when Prava is missing/not linked, browser automation is blocked, Chrome/Chromium cannot be launched, or the user asks to install/configure the flow.

## Prava Setup

Follow the active `$prava-pay` skill. Do the smallest check that proves Prava is usable:

```bash
which prava
PRAVA_SKILL_VERSION=2.2.0 prava status
```

If `which prava` fails, search common locations before installing:

```bash
find ~/.nvm/versions/node ~/.npm-global /opt/homebrew /usr/local -path '*/bin/prava' -type f 2>/dev/null
```

If `prava status` is `active`, reuse it. Do not run `prava setup`, relink the agent, or reinstall the CLI.

If network/DNS fails in a sandboxed host, rerun the exact Prava command with the host's network approval. Do not change amounts or recreate cart context during that retry.

## Browser Control Requirements

Chaat Corner checkout requires entering card details into Spreedly secure iframes. The parent page cannot and should not expose these card fields to JavaScript. The agent needs one of:

1. A browser tool that can click/type into cross-origin iframes using normal user-like input.
2. A local Chrome/Chromium process with DevTools Protocol access.
3. User manual entry as a fallback.

Prefer a real browser/CDP route when available. Use the in-app browser for menu/cart discovery if it works, but switch to the bundled CDP script when iframe input is blocked.

## Browser Automation Decision Tree

Use this before creating Prava credentials in a new host:

1. **Native browser tool available**: If the host exposes browser/computer-use/playwright tools, run a harmless checkout dry run or equivalent host-native probe. The important capability is user-like click/type into the visible Spreedly card number and CVV iframes, not DOM access inside those frames.
2. **Native browser tool blocked at Spreedly**: If clicks or keyboard input into cross-origin iframes fail, do not try to bypass the iframe. Run the CDP precheck below.
3. **No native browser tool**: Run the CDP precheck below. If it passes, use `chaat-corner-cdp-checkout.mjs` for checkout.
4. **No CDP/browser route**: Stop before creating Prava credentials. Ask the user to provide a controllable browser session or complete card-field entry manually after Prava approval.

Run the dependency-free CDP precheck:

```bash
node <skill-dir>/scripts/browser-automation-precheck.mjs
```

Expected success shape:

```json
{
  "ok": true,
  "recommendation": "CDP browser automation is available..."
}
```

Useful options:

```bash
node <skill-dir>/scripts/browser-automation-precheck.mjs --no-launch
CHROME_PATH="/path/to/chrome" node <skill-dir>/scripts/browser-automation-precheck.mjs
CDP_PORT=9222 node <skill-dir>/scripts/browser-automation-precheck.mjs
```

`--no-launch` only checks static prerequisites. The full precheck briefly launches `about:blank` in a temporary Chrome profile and verifies DevTools Protocol connectivity; it does not contact Chaat Corner or Prava.

## Chrome/Chromium Discovery

The bundled script auto-detects common browser paths:

- macOS:
  - `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - `/Applications/Chromium.app/Contents/MacOS/Chromium`
  - `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
  - `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`
- Linux:
  - `google-chrome`
  - `chromium`
  - `chromium-browser`
  - `microsoft-edge`
  - `brave-browser`
- Windows:
  - common Chrome/Edge install paths under `Program Files`

If auto-detection fails, set:

```bash
CHROME_PATH="/path/to/chrome-or-chromium"
```

The script launches a temporary profile by default. Override if needed:

```bash
CHROME_USER_DATA_DIR="/tmp/chaat-corner-profile"
CDP_PORT=9222
```

If the host already has Chrome running with remote debugging, use:

```bash
CDP_URL="http://127.0.0.1:9222"
```

## Host Notes

### Codex

- Use Browser/in-app browser for ordinary inspection when available.
- If in-app browser cannot enter Spreedly iframes, use the CDP script.
- Shell commands that open Chrome or use local debug ports may need escalation/approval.
- Do not leave temporary checkout scripts or Prava tokens in files.

### Claude Code

- Use Claude Code browser/computer-use/Playwright tools if they are available and can type into the visible Spreedly card iframes.
- If native tools cannot type into those iframes, run `browser-automation-precheck.mjs`, then the Node CDP checkout script if precheck passes.
- Ask for permission before launching a local Chrome window or controlling an existing one.
- If Claude Code is running in a terminal-only remote host without GUI/Chrome/CDP, stop before Prava and ask for a controllable browser or manual-entry path.

### Gemini CLI

- Use available browser automation if configured.
- If Gemini has no browser tool or cannot enter Spreedly iframes, run `browser-automation-precheck.mjs`.
- Use the Node CDP script with `CHROME_PATH` if Gemini's shell PATH cannot find Chrome.
- If Gemini runs in a restricted environment with no GUI browser, stop before creating Prava credentials and ask the user for a controllable browser/manual-entry path.

### Other CLI Agents

The script has no npm dependencies. It needs:

- Node.js 18+
- A reachable Chrome/Chromium-family browser
- Permission to open/control a local browser process
- Network access to Chaat Corner and Prava

If the host provides browser-use, computer-use, Playwright, Selenium, or MCP browser tools, use those first only if they can send real input to cross-origin iframe fields. If they expose DOM-only evaluation, expect Spreedly to remain inaccessible and use CDP instead.

## Preflight Without Prava

Use dry run to validate that browser automation can reach the checkout, type into Spreedly card fields, and verify the cart before creating short-lived Prava credentials. Use a harmless single live menu item from the official menu and `DRY_RUN=1`; the script must stop at `stage: "pre-submit-ok"` and must not place an order:

```bash
DRY_RUN=1 \
CONTACT_NAME="<user name>" \
CONTACT_EMAIL="<user email>" \
CONTACT_PHONE="<user phone>" \
ORDER_ITEMS='[{"name":"<exact menu item name>","unitPrice":"<live item price>","quantity":1}]' \
CARD_NUMBER="<test card or Prava token>" \
CARD_CVV="<test CVV or Prava cryptogram>" \
CARD_EXPIRY="12/30" \
CARD_ZIP="<billing ZIP>" \
EXPECTED_TIP="0.00" \
node <skill-dir>/scripts/chaat-corner-cdp-checkout.mjs
```

Do not use Prava credentials for preflight. Do not use test card values for a real order. For real checkout, use Prava tokenized credentials returned by `prava sessions poll`.

## Cleanup

The script launches Chrome with a temporary profile and closes the browser process it started when possible. If a host interruption leaves a browser behind, close the temporary Chrome/Chromium window manually or kill the process that uses the configured `CHROME_USER_DATA_DIR`.

Do not delete the user's normal browser profile. Only use temporary profiles for automated checkout unless the user explicitly approves controlling an existing session.
