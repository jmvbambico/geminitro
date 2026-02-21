# GemiNitro — AGENTS.md

Context for AI agents continuing work on this project.

## What This Is

A Node.js CLI + Express 5 reverse proxy for Google Gemini API. Manages a pool of API keys, rotates them automatically (LRU), retries on rate limits, and exposes an OpenAI-compatible interface. Designed for multi-coding-agent support — currently integrates with OpenCode, with more agents planned. Installs itself into a coding agent's config via `geminitro install`.

## Current State

- [x] Core proxy — OpenAI-compat `/v1/chat/completions` + native Gemini REST routes
- [x] Key pool with cooldown + LRU retry logic
- [x] Model discovery — fetches on first key add, hourly refresh thereafter
- [x] Stats persistence (`.geminitro/history.json`)
- [x] Key add/remove API — `GET /api/keys/safe` returns pool with tails only (no raw keys)
- [x] PROXY_API_KEY bearer token auth on all routes
- [x] `/api/health` — unauthenticated, returns uptime/keys/models/version
- [x] CLI (`geminitro`) — start / stop / restart / install / uninstall / stats / status / key add|remove|list
- [x] Nitro-themed ASCII splash screen (fire gradient, dynamite i, explosion O)
- [x] Interactive installer — agent selector (OpenCode now, extensible), global/local scope, optional launchd/systemd; clears history+models on install, preserves keys
- [x] Uninstall — auto-detects all registered locations + services, single confirm, removes all
- [x] Key validation on add (tests key against Gemini API, triggers full model cache refresh)
- [x] Smart first-run flow in `geminitro start` — detects install state, offers agent selector, terminal or browser setup
- [x] Web dashboard (Vite + React + Tailwind v4) served at `/dashboard`
  - Single-page, no sidebar — topbar only (branding, live indicator, theme toggle, settings)
  - Overview: 4 stat cards, live traffic area chart, 7-day bar chart + model usage pie chart, keys table, system logs
  - Live Socket.IO updates (key pool, traffic ticks, log stream)
  - First-run setup wizard at `/dashboard/setup`
  - Dark mode via `.dark` class, full OKLCH theming, 8-color chart palette
  - Settings modal (proxy API key, server info)
  - Theme switcher via Palette icon

## Architecture

```
bin/geminitro.js        — CLI entrypoint (Commander)
src/cli/
  splash.js             — Nitro ASCII art splash (fire gradient, chalk)
  install.js            — Multi-agent install/uninstall (OpenCode today, extensible)
  firstRun.js           — Smart start flow: detect state, agent selector, browser/terminal setup
  stats.js              — Terminal stats view with bar charts
  keys.js               — Key CRUD CLI wrappers
config/index.js         — Port 7536, DATA_DIR (./.geminitro), PROXY_API_KEY
services/
  keyService.js         — Key pool CRUD, LRU selection, cooldown logic, getSafeKeyPool()
  geminiService.js      — @google/generative-ai wrapper, model fetching, message mapping
  statsService.js       — Request tracking, daily stats, debounced disk writes
routes/
  apiRoutes.js          — All HTTP routes, /api/health (unauthed), PROXY_API_KEY middleware
server.js               — Express + Socket.IO setup, static dashboard serving, service init
dashboard/              — Vite + React + Tailwind v4 source (npm run build → public/)
  src/
    pages/              — Overview (all-in-one), Setup
    components/         — Layout (topbar, AddKeyModal, SettingsModal)
    hooks/              — useSocket, useHealth, useDarkMode, useCssColors
    lib/                — api.ts (fetch wrappers), utils.ts (cn helper)
public/                 — Built dashboard static files (gitignored, served at /dashboard)
utils/
  logger.js             — Structured logger (emits Socket.IO log events)
```

## Key Technical Notes

**Port:** 7536 (C₇H₅N₃O₆ — chemical formula for TNT, fits the nitro theme)

**Auth:** Every route except `/api/health` requires `Authorization: Bearer <PROXY_API_KEY>`. Default key is `"geminitro"`. Configurable via `PROXY_API_KEY` env var or `.env`.

**Data dir:** `.geminitro/` in the project root holds `keys.json`, `history.json`, and `models.json`. Override with `GEMINITRO_DATA_DIR` env var. Both services call `ensureDataDir()` on init.

**Safe key pool:** `keyService.getSafeKeyPool()` strips raw key strings to `{ tail, status, usage, errors, lastUsed, cooldownUntil }`. All socket `stats_update` events and `GET /api/keys/safe` use this — raw keys are never sent over the wire.

**Model cache refresh:** When the first key is added via `POST /api/keys`, `geminiService.fetchGoogleModels()` is triggered asynchronously to populate the model list immediately. Subsequent adds only cache the models returned from validation. Hourly interval continues in background.

**Install data reset:** `geminitro install` clears `history.json` and `models.json` on each run (fresh start). `keys.json` is never touched by install/uninstall.

**Uninstall auto-detection:** Scans `~/.config/opencode/opencode.json` and `./opencode.json` for the `geminitro` provider block, plus launchd plist and systemd service. Lists everything found, asks once, removes all.

**Multi-agent install design:** `install.js` `run(agent)` accepts an agent name. `AGENT_CONFIGS` maps agent names to their config paths and schema URLs. Adding a new agent = add an entry to `AGENT_CONFIGS` and a choice in `firstRun.js`.

**Native Gemini REST routing:** Express 5 supports RegExp routes. The colon in `/v1/models/gemini-pro:streamGenerateContent` can't be matched with named params — fixed with:
```js
router.post(/^\/v1\/models\/([^/:]+):(streamGenerateContent|generateContent)$/, ...)
```
Native Gemini format also uses `contents` (not `messages`) — the route handler maps `contents → messages` before calling `handleRequest`.

**Dark mode:** Use `.dark` class on `<html>`, NOT `data-theme`. Tailwind v4: `@custom-variant dark (&:is(.dark *))`. `useDarkMode()` must be called even on standalone pages (e.g. Setup) to apply the class.

**Chart colors in SVG:** Recharts renders `fill`/`stroke` as SVG attributes — CSS variables do NOT resolve in SVG attributes. Use `useCssColors()` hook which calls `getComputedStyle(document.documentElement)` to resolve `--chart-N` and semantic vars at runtime. Returns raw `oklch(...)` strings (already fully formed — do NOT wrap again). Watches `.dark` class changes via `MutationObserver` for live theme switching.

**Socket.IO events:** `stats_update` (safe key pool array), `traffic_update` (request tick), `log` ({id, type, message, timestamp}), `stats_update_full` (full stats object).

**Dashboard build:** `npm run build` from repo root runs `cd dashboard && npm install && npm run build`, outputs to `public/`. The `public/` dir is gitignored. Dashboard is served by Express at `/dashboard` only when `public/` exists. Vite base is `/dashboard/`, proxy in dev points to `:7536`.

**Stats save:** Debounced 10s writes to avoid I/O spam on high traffic.

**System logs panel:** Dark terminal background (`oklch(0.22 0.008 50)`) in both light and dark mode. Message text alternates between `chart-1` and `chart-2` resolved colors per row. `[TYPE]` badge is muted dark.

## Files NOT to Commit

- `.geminitro/keys.json` — real API keys
- `.geminitro/history.json` — local stats
- `.geminitro/models.json` — cached model list
- `.env` — environment config
- `public/` — built dashboard (gitignored, regenerate with `npm run build`)
