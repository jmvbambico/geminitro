# GemiNitro — AGENTS.md

Context for AI agents working on this project.

## Project

Node.js CLI + Express 5 reverse proxy for Google Gemini API with key pool management, LRU rotation, rate limit retries, and OpenAI-compatible interface.

**Port:** 7536 | **Data dir:** `.geminitro/` | **Auth:** `Bearer geminitro`

## Architecture

```
bin/geminitro.js      — CLI (Commander)
src/cli/              — splash, install, firstRun, stats, keys
config/index.js       — PORT, DATA_DIR, PROXY_API_KEY
services/             — keyService, geminiService, statsService
routes/apiRoutes.js   — HTTP routes
server.js             — Express + Socket.IO
dashboard/            — Vite + React + Tailwind v4
```

## Commands

```bash
npm run lint          # ESLint + Prettier check
npm run format        # Format all files
npm run audit         # Security audit (moderate+ vulns)
npm run build         # Build dashboard → public/
npm test              # Run Jest unit tests
## Pre-commit Hooks

**Runs automatically before each commit:**
- `lint-staged` — auto-fix linting on staged files
- `npm audit` — security audit (moderate+ vulnerabilities)
- `npm test` — **100% unit test pass required**

Commit is blocked if any step fails.
```

## Workflow (MANDATORY)

### 1. Planning

**For EVERY feature/change:**

1. **Brainstorm first** — Use `superpowers/brainstorming` to explore requirements, constraints, and approaches
2. **Use btca (PRIORITY)** — Query library source code during brainstorming. ALWAYS try btca before web search:
   ```bash
   btca ask --resource <library> --question "<your question>"
   ```
   Only use web search if btca doesn't have the answer.
3. **Write plan** — Use `superpowers/writing-plans` to create `docs/plans/YYYY-MM-DD-<feature>.md`

### 2. Implementation

2. **Use btca** — Query library source code during brainstorming for current API patterns:
   ```bash
   btca ask --resource <library> --question "<your question>"
   ```
3. **Write plan** — Use `superpowers/writing-plans` to create `docs/plans/YYYY-MM-DD-<feature>.md`

### 2. Implementation

- Use `superpowers/subagent-driven-development` (same session) or `superpowers/executing-plans` (parallel)
- **Generate unit tests** from brainstorming outputs — widest coverage possible
- Tests are part of the plan, not afterthought

### 3. Testing

- **100% unit test pass rate** required before marking complete
- Run `npm test` — all tests must pass

## btca Usage

**Priority: Try btca FIRST before web search.**

Query library source code directly for current patterns:

```bash
# Ask about a library (ALWAYS try this first)
btca ask --resource express --question "How does middleware work in Express 5?"

# Available resources: google-generative-ai, express, socket.io, commander, react, tailwind, vite

# Only fall back to web search if btca doesn't have the answer
```

Query library source code directly for current patterns:

```bash
# Ask about a library
btca ask --resource express --question "How does middleware work in Express 5?"

# Available resources: google-generative-ai, express, socket.io, commander, react, tailwind, vite
```

## Files NOT to Commit

```
.geminitro/keys.json    — API keys
.geminitro/history.json — local stats
.geminitro/models.json  — cached models
.env                    — environment config
public/                 — built dashboard
```
