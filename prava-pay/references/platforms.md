# Platform Detection — Agent Onboarding

Used by `prava setup --name "<name>" --platform <platform>`.

**Rules:**
- **Platform** — determine automatically from your own identity. NEVER ask the user.
- **Name** — if the user already gave one in their message, use it (skip confirmation). Otherwise pick the default from the table and confirm once before generating the link: *"Linking this agent to Prava as **"Claude Code"**. Want a different name, or should I proceed?"*
- Only ask the user for a name in the `custom` fallback — i.e. you genuinely cannot determine your own identity.

| If you are                | Default name        | --platform           |
|---------------------------|---------------------|----------------------|
| Anthropic Claude Code     | "Claude Code"       | claude-code          |
| OpenAI Codex CLI          | "Codex"             | codex                |
| Cursor                    | "Cursor"            | cursor               |
| Google Gemini CLI         | "Gemini CLI"        | gemini-cli           |
| Hermes                    | "Hermes"            | hermes               |
| Aider                     | "Aider"             | aider                |
| Goose (Block)             | "Goose"             | goose                |
| GitHub Copilot CLI        | "Copilot CLI"       | copilot-cli          |
| GitHub Copilot (IDE)      | "GitHub Copilot"    | github-copilot       |
| Windsurf                  | "Windsurf"          | windsurf             |
| Cline                     | "Cline"             | cline                |
| Continue                  | "Continue"          | continue             |
| Amazon Q Developer        | "Amazon Q"          | amazon-q             |
| Roo Code                  | "Roo Code"          | roo-code             |
| Kilo Code                 | "Kilo Code"         | kilo-code            |
| Sourcegraph Cody          | "Sourcegraph Cody"  | sourcegraph-cody     |
| Tabnine                   | "Tabnine"           | tabnine              |
| Augment Code              | "Augment Code"      | augment-code         |
| Amp                       | "Amp"               | amp                  |
| Zed                       | "Zed"               | zed                  |
| Kiro (AWS)                | "Kiro"              | kiro                 |
| BLACKBOX AI               | "BLACKBOX AI"       | blackbox             |
| OpenCode                  | "OpenCode"          | opencode             |
| Qwen Code                 | "Qwen Code"         | qwen-code            |
| Kimi CLI                  | "Kimi CLI"          | kimi-cli             |
| Mistral Vibe              | "Mistral Vibe"      | mistral-vibe         |
| Warp                      | "Warp"              | warp                 |
| Coro Code                 | "Coro Code"         | coro-code            |
| Devin                     | "Devin"             | devin                |
| OpenHands                 | "OpenHands"         | openhands            |
| Jules (Google)            | "Jules"             | jules                |
| SWE-Agent                 | "SWE-Agent"         | swe-agent            |
| Manus                     | "Manus"             | manus                |
| OpenAI Operator           | "OpenAI Operator"   | openai-operator      |
| Claude Computer Use       | "Claude Computer Use"| claude-computer-use |
| Replit Agent              | "Replit Agent"      | replit-agent         |
| Bolt (StackBlitz)         | "Bolt"              | bolt                 |
| v0 (Vercel)              | "v0"                | v0                   |
| Lovable                   | "Lovable"           | lovable              |
| Unknown / custom agent    | Ask the user        | custom               |
