<div align="center">

# <img src="logo.webp" alt="GemiNitro" width="40" height="40" align="top"> GemiNitro

**Lightweight Gemini API proxy with key pooling, automatic rotation, and a live web dashboard.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/socket.io-4-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Pool multiple Gemini API keys, rotate on rate limits, recover automatically. Integrates with AI coding agents via one command.

</div>

---

## What it does

GemiNitro sits between your AI coding agent (or any OpenAI-compatible client) and Google's Gemini API. You give it a pool of free API keys from [Google AI Studio](https://aistudio.google.com); it picks the least-recently-used key for each request, backs off on 429s automatically, and recovers keys after their cooldown expires.

- **Key rotation** — least-recently-used selection across N keys
- **Cooldown & retry** — on 429, marks key as cooling, tries the next one, recovers automatically
- **OpenAI-compatible** — works with `/v1/chat/completions` and any OpenAI-compatible client
- **Native Gemini REST** — also proxies `/v1/models/{model}:generateContent` paths directly
- **Model discovery** — fetches available models from Google's API on first key add, refreshes hourly
- **Web dashboard** — live traffic, key pool, model usage, and system logs at `http://localhost:7536/dashboard`
- **CLI** — `geminitro start`, `stats`, `install`, `key add/list/remove`
- **Coding agent integration** — `geminitro install` writes the provider config for your agent interactively

---

## Install

**Option A — Let an LLM do it**

Paste this into Claude Code, OpenCode, or any AI coding agent:

```
Install geminitro by following the instructions at:
https://raw.githubusercontent.com/jmvbambico/geminitro/main/README.md
```

**Option B — Manual**

```bash
git clone https://github.com/jmvbambico/geminitro.git
cd geminitro
npm install
npm link

# Start — creates .env with defaults if missing, detects first-run state, guides setup
geminitro start
```

> A `.env` file with default values (`PORT=7536`, `PROXY_API_KEY=geminitro`, `AUTO_UPDATE=false`) is created automatically if missing. Customize it anytime.
>
> `geminitro start` detects whether the server is configured. On first run it offers to register with your coding agent and add API keys via terminal or browser.

> Get free Gemini API keys at [aistudio.google.com](https://aistudio.google.com). Multiple keys multiply your free-tier throughput.

---

## First Run Flow

```
geminitro start
  ↓
Not registered to any coding agent?
  → Choose "Install now" → select agent → configure
Not registered?
  → Add your first key via terminal or browser setup wizard
Already configured?
  → Open browser dashboard or stay in terminal
```

---

## Coding Agent Integration

Run `geminitro install` and select your agent. Supported agents:

| Agent              | Config written                                          | How to use                                |
| ------------------ | ------------------------------------------------------- | ----------------------------------------- |
| **OpenCode**       | `~/.config/opencode/opencode.json` or `./opencode.json` | `--model geminitro/<model>`               |
| **Continue.dev**   | `~/.continue/config.yaml`                               | Select model in Continue's picker         |
| **Aider**          | `~/.aider.conf.yml`                                     | Automatic — runs via GemiNitro by default |
| **Codex CLI**      | `~/.codex/config.toml`                                  | Automatic — uses configured provider      |
| **OpenCrabs**      | `~/.opencrabs/config.toml` + `keys.toml`                | Select custom provider                    |
| **Kimi Code**      | `~/.kimi/config.toml`                                   | Uses `geminitro` provider                 |
| **Manual / Other** | `baseURL: http://localhost:7536/v1`                     | `apiKey: geminitro`                       |

### Supported Capabilities

GemiNitro provides a high-fidelity translation layer between the OpenAI spec and Gemini's native features, ensuring advanced coding agents work out-of-the-box.

| Capability                  | OpenAI Format                              | Gemini/Claude Mapping                       | Status |
| --------------------------- | ------------------------------------------ | ------------------------------------------- | ------ |
| **Tool Calls**              | `tools[]`, `tool_choice`                   | `functionDeclarations`, `toolConfig`        | ✅     |
| **Streaming Finish Reason** | `finish_reason: "tool_calls"`              | Signal emitted on terminal stream chunk     | ✅     |
| **JSON Mode**               | `response_format: { type: "json_object" }` | `responseMimeType: "application/json"`      | ✅     |
| **Reasoning / Thinking**    | `reasoning_effort` (o-series)              | `thinkingConfig` (budget tokens)            | ✅     |
| **Extended Thinking**       | `thinking: { budget_tokens: N }`           | Claude `thinkingBudgetTokens` (passthrough) | ✅     |
| **Usage Stats**             | `stream_options.include_usage`             | `usageMetadata` (tracked per-chunk)         | ✅     |
| **Stop Sequences**          | `stop: ["\n\nHuman:"]`                     | `stopSequences`                             | ✅     |
| **Vision**                  | `image_url`                                | `inlineData` / `image` parts                | ✅     |
| **Structured Outputs**      | `response_format: { type: "json_schema" }` | `responseSchema` (Gemini 1.5/2.0)           | ✅     |

### OpenCode

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "geminitro": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "GemiNitro",
      "options": {
        "baseURL": "http://localhost:7536/v1",
        "apiKey": "geminitro"
      },
      "models": {
        "gemini-2.0-flash": {
          "name": "gemini-2.0-flash (GemiNitro)",
          "limit": { "context": 1048576, "output": 65536 }
        }
      }
    }
  }
}
```

### Continue.dev

Appended to `~/.continue/config.yaml`:

```yaml
models:
  - name: GemiNitro / gemini-2.0-flash
    provider: openai
    model: gemini-2.0-flash
    apiBase: http://localhost:7536/v1
    apiKey: geminitro
    roles:
      - chat
      - edit
      - apply
```

Restart VS Code or reload the Continue extension to pick up the change.

### Aider

Written to `~/.aider.conf.yml`:

```yaml
openai-api-base: http://localhost:7536/v1
openai-api-key: geminitro
model: gemini-2.0-flash
```

### Codex CLI

Written to `~/.codex/config.toml`:

```toml
provider = "openai"
model = "gemini-2.0-flash"

[providers.openai]
base_url = "http://localhost:7536/v1"
api_key = "geminitro"
```

### OpenCrabs

Written to `~/.opencrabs/config.toml` and `~/.opencrabs/keys.toml`:

```toml
# config.toml
[providers.custom]
enabled = true
base_url = "http://localhost:7536/v1"
default_model = "gemini-2.0-flash"
```

```toml
# keys.toml (chmod 600)
[providers.custom]
api_key = "geminitro"
```

### Kimi Code

Written to `~/.kimi/config.toml`:

```toml
default_model = "geminitro"

[providers.geminitro]
type = "openai_legacy"
base_url = "http://localhost:7536/v1"
api_key = "geminitro"

[models.geminitro]
provider = "geminitro"
model = "gemini-2.0-flash"
max_context_size = 1048576
capabilities = ["thinking", "image_in"]
```

---

## Web Dashboard

A live dashboard is served at `http://localhost:7536/dashboard` when the server is running.

- **Overview** — traffic stats, live traffic chart, 7-day request history, model usage pie chart
- **API Keys** — inline key table with status badges, add/remove keys
- **System Logs** — live log stream with type-colored rows
- **Settings** — proxy API key management, server info
- **Setup Wizard** — browser-based first-run key setup at `/dashboard/setup`
- **Themes** — dark mode toggle + themeable OKLCH color palette
- **Live updates** — Socket.IO pushes key pool changes, traffic ticks, and log entries in real time

Build the dashboard from source:

```bash
npm run build
```

---

## CLI Reference

```
geminitro start              Start the proxy (smart first-run flow)
geminitro start --no-splash  Start without splash screen
geminitro stop               Stop the running server
geminitro restart            Restart the server
geminitro status             Quick health check
geminitro stats              Terminal stats: requests, keys, model usage, 7-day history
geminitro install            Register with a coding agent (interactive)
geminitro uninstall          Remove from all detected agent configs (auto-detected, one confirm)
geminitro update             Check for and apply the latest release
geminitro key add <key>      Add a Gemini API key (validates key, refreshes model cache)
geminitro key remove <frag>  Remove a key by its last 6+ characters
geminitro key list           List all keys with status
```

> `key add`, `key list`, and `key remove` work without the server running — they operate directly on `.geminitro/keys.json`.

---

## Configuration

| Variable        | Default     | Description                                        |
| --------------- | ----------- | -------------------------------------------------- |
| `PORT`          | `7536`      | Proxy server port (C₇H₅N₃O₆ — TNT)                 |
| `PROXY_API_KEY` | `geminitro` | Bearer token clients send to this proxy            |
| `AUTO_UPDATE`   | `false`     | Check for and apply updates automatically on start |

Set in `.env` or as environment variables. Copy `.env.example` to get started.

### OAuth Setup (for Antigravity / Gemini CLI accounts)

To use OAuth-based accounts (Antigravity or Gemini CLI), you need Google OAuth credentials. Add them to your `.env`:

```
OAUTH_CLIENT_ID=your-client-id-here
OAUTH_CLIENT_SECRET=your-client-secret-here
```

**Where to get them:**

1. **From the OpenCode Antigravity plugin** (easiest) — copy `ANTIGRAVITY_CLIENT_ID` and `ANTIGRAVITY_CLIENT_SECRET` from the plugin source at [`src/constants.ts`](https://github.com/NoeFabris/opencode-antigravity-auth/blob/main/src/constants.ts)
2. **Create your own** — set up an OAuth 2.0 client at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with the `cloud-platform`, `userinfo.email`, and `userinfo.profile` scopes

> OAuth credentials are only needed for Antigravity/Gemini CLI account features. Standard Gemini API keys from [AI Studio](https://aistudio.google.com) work without them.

---

## API Reference

| Method   | Path                                       | Auth   | Description                              |
| -------- | ------------------------------------------ | ------ | ---------------------------------------- |
| `GET`    | `/api/health`                              | None   | Server health, key pool summary, version |
| `POST`   | `/v1/chat/completions`                     | Bearer | OpenAI-compatible inference              |
| `POST`   | `/v1/models/{model}:generateContent`       | Bearer | Native Gemini REST                       |
| `POST`   | `/v1/models/{model}:streamGenerateContent` | Bearer | Native Gemini REST (streaming)           |
| `GET`    | `/v1/models`                               | Bearer | List available models                    |
| `GET`    | `/api/stats`                               | Bearer | Full usage statistics                    |
| `GET`    | `/api/keys/safe`                           | Bearer | List key pool (tails only, no raw keys)  |
| `POST`   | `/api/keys`                                | Bearer | Add and validate a key                   |
| `DELETE` | `/api/keys/:fragment`                      | Bearer | Remove a key by last 6+ chars            |
| `POST`   | `/api/refresh-models`                      | Bearer | Force model list refresh                 |

All authenticated routes require `Authorization: Bearer <PROXY_API_KEY>` (default: `geminitro`).

---

## Development

```bash
git clone https://github.com/jmvbambico/geminitro.git
cd geminitro
npm install
cp .env.example .env
npm run dev        # auto-reload backend on file changes
npm run build      # build dashboard → public/
npm run lint       # lint root + dashboard
npm run format     # format all files with Prettier
npm run audit      # security audit (moderate+ vulns)
```

The server starts on `:7536`. Dashboard source lives in `dashboard/` (Vite + React + Tailwind v4).

### CI/CD

- **GitHub Actions** — lint, security audit, build (Node 18/20/22 matrix) on every push/PR
- **Dependabot** — weekly npm updates, monthly GitHub Actions updates
- **Pre-commit hooks** — ESLint + Prettier + npm audit on every commit

---

## Credits

- **[KeyStream-Gemini](https://github.com/billtruong003/KeyStream-Gemini)** by billtruong003 — the original Gemini key-pooling proxy that inspired GemiNitro's core architecture: LRU key rotation, automatic cooldown recovery, and the OpenAI-compatible interface.
- **[opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** by NoeFabris — reverse-engineered the Antigravity OAuth flow and API spec that GemiNitro's OAuth service and Antigravity integration are built on.

---

## License

MIT
