<div align="center">

# <img src="logo.webp" alt="GemiNitro" width="40" height="40" align="top"> GemiNitro

**Production-grade Gemini API proxy with intelligent key pooling, quota management, and enterprise resilience features.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Socket.IO](https://img.shields.io/badge/socket.io-4-010101?logo=socket.io&logoColor=white)](https://socket.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Pool multiple Gemini API keys with intelligent rotation strategies, automatic quota tracking, and comprehensive usage analytics. Built for reliability and scale.

</div>

---

## What it does

GemiNitro is a production-grade reverse proxy for Google's Gemini API that sits between your AI coding agent (or any OpenAI-compatible client) and Google's Gemini API. It intelligently manages multiple API keys, tracks usage quotas, handles rate limits automatically, and provides comprehensive analytics.

### Core Features

- **Intelligent key rotation** — weighted random, LRU, or sequential selection with configurable tolerance
- **Cross-source routing** — automatic fallback across API keys, Antigravity OAuth, and Gemini CLI OAuth
- **Dynamic model discovery** — per-key model fetching with 6-hour refresh, eliminates stale model errors
- **Model aliasing** — create user-friendly aliases (e.g., `flash` → `gemini-2.0-flash`)
- **Priority tiers** — free/standard/premium/enterprise with concurrency multipliers
- **Usage quota management** — per-model caps with per-account tracking and combined limits
- **Quota groups** — share limits across model variants (e.g., gemini-2.0-flash + gemini-2.5-flash)
- **Background quota refresh** — proactive 5-minute polling prevents rate limit errors for OAuth keys
- **Automatic cooldown & retry** — on 429 errors, marks key as cooling, tries next available key
- **Duplicate detection** — prevents adding the same API key or OAuth account twice
- **OpenAI-compatible** — works with `/v1/chat/completions` and any OpenAI SDK
- **Native Gemini REST** — also proxies `/v1/models/{model}:generateContent` paths directly
- **Live web dashboard** — real-time traffic, quota meters, key pool status, and system logs
- **Comprehensive CLI** — `start`, `stats`, `install`, `key add/list/remove`, `alias`, `quota-group`, and more
- **Coding agent integration** — one-command setup for OpenCode, Continue.dev, Aider, and others

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

- **Overview** — traffic stats, live traffic chart, usage quota meters, model distribution
- **Usage Quotas** — per-model quota progress bars with warning thresholds and reset timers
- **API Keys** — inline key table with status badges, priority tiers, add/remove keys
- **System Logs** — live log stream with type-colored rows and collapsible interface
- **Settings** — proxy API key management, quota reset schedule, server info
- **Setup Wizard** — browser-based first-run key setup at `/dashboard/setup`
- **Themes** — dark mode toggle + themeable OKLCH color palette
- **Live updates** — Socket.IO pushes key pool changes, traffic ticks, quota alerts, and log entries in real time

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
geminitro stats              Terminal stats: quota usage (first), requests, keys, model usage, 7-day history
geminitro install            Register with a coding agent (interactive)
geminitro uninstall          Remove from all detected agent configs (auto-detected, one confirm)
geminitro update             Check for and apply the latest release
geminitro key add <key>      Add a Gemini API key (validates key, refreshes model cache)
geminitro key remove <frag>  Remove a key by its last 6+ characters
geminitro key list           List all keys with status
geminitro alias add <name> <target>  Create model alias (e.g., flash → gemini-2.0-flash)
geminitro alias remove <name>        Remove model alias
geminitro alias list                 List all configured aliases
geminitro quota-group add <name> <models...>  Create quota group sharing limits
geminitro quota-group remove <name>           Remove quota group
geminitro quota-group list                    List all quota groups
```

> **Note**: `key`, `alias`, and `quota-group` commands work without the server running — they operate directly on `.geminitro/` data files.

---

## Configuration

| Variable        | Default     | Description                                        |
| --------------- | ----------- | -------------------------------------------------- |
| `PORT`          | `7536`      | Proxy server port (C₇H₅N₃O₆ — TNT)                 |
| `PROXY_API_KEY` | `geminitro` | Bearer token clients send to this proxy            |
| `AUTO_UPDATE`   | `false`     | Check for and apply updates automatically on start |

Set in `.env` or as environment variables. Copy `.env.example` to get started.

### Advanced Configuration

#### Rotation & Key Management

| Variable                          | Default    | Description                                                                  |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `ROTATION_MODE`                   | `balanced` | Key selection strategy: `balanced` (LRU), `sequential` (exhaust then rotate) |
| `ROTATION_TOLERANCE`              | `0`        | Randomness in weighted selection: `0` = deterministic, `1` = fully random    |
| `MAX_CONCURRENT_REQUESTS_PER_KEY` | `3`        | Concurrent request limit per API key (prevents quota exhaustion)             |

#### Model Discovery & Refresh

| Variable                 | Default    | Description                                              |
| ------------------------ | ---------- | -------------------------------------------------------- |
| `MODEL_FETCH_INTERVAL`   | `21600000` | Model list refresh interval (6 hours in milliseconds)    |
| `QUOTA_REFRESH_INTERVAL` | `300000`   | OAuth quota polling interval (5 minutes in milliseconds) |

#### Timeout Configuration (milliseconds)

| Variable                     | Default  | Description                                    |
| ---------------------------- | -------- | ---------------------------------------------- |
| `TIMEOUT_CONNECT`            | `10000`  | Connection timeout (10s)                       |
| `TIMEOUT_WRITE`              | `30000`  | Write timeout (30s)                            |
| `TIMEOUT_READ_STREAMING`     | `300000` | Read timeout for streaming requests (5min)     |
| `TIMEOUT_READ_NON_STREAMING` | `60000`  | Read timeout for non-streaming requests (1min) |

#### Priority Tiers

Configure concurrency multipliers for different account tiers (applied to `MAX_CONCURRENT_REQUESTS_PER_KEY`):

```bash
# Format: tier:multiplier (comma-separated)
PRIORITY_TIER_MULTIPLIERS=free:1.0,standard:1.5,premium:2.0,enterprise:3.0
```

**Example**: If `MAX_CONCURRENT_REQUESTS_PER_KEY=3` and tier is `premium` (2.0x), that key gets 6 concurrent requests.

#### Quota Groups

Share quota limits across model variants that use the same underlying model:

```bash
# Antigravity/Claude models (comma-separated variants)
QUOTA_GROUPS_ANTIGRAVITY_CLAUDE=claude-sonnet-4-5,claude-opus-4-5,claude-sonnet-4-6

# Gemini Pro variants
QUOTA_GROUPS_GEMINI_PRO=gemini-2.0-flash,gemini-2.5-flash,gemini-2.0-flash-exp
```

When any model in a group hits its quota, all models in that group enter cooldown.

### New in v1.7.0: Enhanced Model Management

#### Dynamic Model Discovery

GemiNitro now fetches available models **per API key** every 6 hours, eliminating stale model errors:

- **Automatic refresh** — Models list updates every 6 hours (`MODEL_FETCH_INTERVAL`)
- **Per-key discovery** — Each key's supported models are fetched individually
- **Request-driven** — Unknown models trigger immediate discovery attempt
- **Stale model removal** — Models no longer available are automatically filtered out

**Before v1.7.0:** Static model list caused "All keys exhausted" errors for experimental models like `gemini-2.0-flash-exp`.

**After v1.7.0:** Dynamic discovery ensures only available models are attempted.

#### Cross-Source Routing

Automatic failover across multiple key sources with preference order:

```
API Keys (AI Studio) → Antigravity OAuth → Gemini CLI OAuth
```

When API keys are exhausted, GemiNitro automatically tries OAuth sources. No configuration needed — it just works.

#### Model Aliasing

Create short, memorable aliases for frequently-used models:

```bash
# Create aliases
geminitro alias add flash gemini-2.0-flash
geminitro alias add pro gemini-2.5-pro
geminitro alias add thinking gemini-2.0-flash-thinking-exp

# Use in requests
curl -X POST http://localhost:7536/v1/chat/completions \
  -H "Authorization: Bearer geminitro" \
  -d '{"model": "flash", "messages": [...]}'
```

Aliases are stored in `.geminitro/models.json` and resolve transparently.

#### Quota Groups

Share quota limits across model variants (e.g., flash variants, pro variants):

```bash
# Group flash variants
geminitro quota-group add flash-variants gemini-2.0-flash gemini-2.5-flash gemini-2.5-flash-lite

# Group pro variants
geminitro quota-group add pro-variants gemini-2.5-pro gemini-3-pro-preview
```

When any model in a group hits quota, **all models in the group enter cooldown**. Prevents quota exhaustion across similar models.

#### Background Quota Refresh (OAuth Only)

For Antigravity and Gemini CLI OAuth accounts, GemiNitro polls Google's quota API every 5 minutes:

- **Proactive filtering** — Keys with <5% quota remaining are excluded **before** making requests
- **Prevents 429 errors** — No more rate limit surprises
- **Auto-recovery** — Keys automatically return when quota resets

**Configuration:**

```bash
QUOTA_REFRESH_INTERVAL=300000  # 5 minutes (default)
```

---

### Usage Quota Management

GemiNitro tracks usage per model with configurable daily limits. Quotas are managed via:

1. **Dashboard UI** — visual quota meters, warning thresholds, cap management modal
2. **CLI** — `geminitro stats` shows quota usage with colored progress bars
3. **API** — programmatic quota management (see API Reference below)

**Data files** (auto-created in `.geminitro/`):

- `usage_caps.json` — quota configuration (limits, thresholds, reset schedule)
- `history.json` — usage statistics with per-account breakdown

**Features**:

- Per-model daily limits with automatic reset at configurable time
- Warning thresholds (default 80%) with Socket.IO notifications
- Per-account tracking aggregated into combined model limits
- Configurable actions: `try_next` (use another key) or `reject` (return 429)

**Example quota configuration** (`.geminitro/usage_caps.json`):

```json
{
  "caps": [
    {
      "model": "gemini-2.0-flash",
      "limit": 1500,
      "period": "daily",
      "alertThreshold": 80,
      "action": "try_next",
      "enabled": true
    }
  ],
  "resetTime": "00:00",
  "timezone": "local"
}
```

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

### Core Endpoints

| Method | Path                                       | Auth   | Description                              |
| ------ | ------------------------------------------ | ------ | ---------------------------------------- |
| `GET`  | `/api/health`                              | None   | Server health, key pool summary, version |
| `POST` | `/v1/chat/completions`                     | Bearer | OpenAI-compatible inference              |
| `POST` | `/v1/models/{model}:generateContent`       | Bearer | Native Gemini REST                       |
| `POST` | `/v1/models/{model}:streamGenerateContent` | Bearer | Native Gemini REST (streaming)           |
| `GET`  | `/v1/models`                               | Bearer | List available models                    |

### Statistics & Monitoring

| Method | Path                       | Auth   | Description                                                     |
| ------ | -------------------------- | ------ | --------------------------------------------------------------- |
| `GET`  | `/api/stats`               | Bearer | Full usage statistics (requests, success rate, daily breakdown) |
| `GET`  | `/api/stats/unified`       | Bearer | Unified model statistics across all account types               |
| `GET`  | `/api/stats/quota-summary` | Bearer | Combined quota usage with account breakdown and reset times     |

### Key Management

| Method   | Path                  | Auth   | Description                             |
| -------- | --------------------- | ------ | --------------------------------------- |
| `GET`    | `/api/keys/safe`      | Bearer | List key pool (tails only, no raw keys) |
| `POST`   | `/api/keys`           | Bearer | Add and validate a key                  |
| `DELETE` | `/api/keys/:fragment` | Bearer | Remove a key by last 6+ chars           |
| `POST`   | `/api/refresh-models` | Bearer | Force model list refresh                |

### Usage Quota Management

| Method   | Path                           | Auth   | Description                                  |
| -------- | ------------------------------ | ------ | -------------------------------------------- |
| `GET`    | `/api/stats/caps`              | Bearer | Get all usage cap configurations             |
| `POST`   | `/api/stats/caps`              | Bearer | Add or update a usage cap                    |
| `DELETE` | `/api/stats/caps/:model`       | Bearer | Remove usage cap for a model                 |
| `GET`    | `/api/stats/caps/progress`     | Bearer | Get usage progress for all capped models     |
| `GET`    | `/api/stats/caps/check/:model` | Bearer | Check usage progress for specific model      |
| `POST`   | `/api/stats/caps/config`       | Bearer | Update reset time and timezone configuration |

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

### Testing

```bash
npm test              # Run all tests (60 test suites)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

**Test coverage**:

- ✅ 60 tests passing across 11 test suites
- Key service: rotation modes, priority tiers, duplicate detection, weighted selection
- Usage cap service: per-account tracking, quota aggregation, reset scheduling
- Stats service: unified statistics, model breakdowns
- Quota service: quota group management, shared cooldowns
- Semaphore: concurrency limiting per provider

---

## Credits

- **[KeyStream-Gemini](https://github.com/billtruong003/KeyStream-Gemini)** by billtruong003 — the original Gemini key-pooling proxy that inspired GemiNitro's core architecture: LRU key rotation, automatic cooldown recovery, and the OpenAI-compatible interface.
- **[opencode-antigravity-auth](https://github.com/NoeFabris/opencode-antigravity-auth)** by NoeFabris — reverse-engineered the Antigravity OAuth flow and API spec that GemiNitro's OAuth service and Antigravity integration are built on.
- **[LLM-API-Key-Proxy](https://github.com/Mirrowel/LLM-API-Key-Proxy)** by Mirrowel — inspired the resilience features: weighted rotation, priority tiers, quota groups, and usage tracking patterns.

---

## License

MIT
