# GemiNitro — AGENTS.md

Context for AI agents working on this project.

## Project

Node.js CLI + Express 5 reverse proxy for Google Gemini API. Key pool management, LRU rotation, rate limit retries, OpenAI-compatible interface. Multi-coding-agent support via `geminitro install`.

**Port:** 7536 | **Data dir:** `.geminitro/` | **Default auth:** `Bearer geminitro`

## Architecture

```
bin/geminitro.js           — CLI (Commander)
src/cli/                   — splash, install, firstRun, stats, keys
config/index.js            — PORT, DATA_DIR, PROXY_API_KEY
services/                  — keyService, geminiService, statsService
routes/apiRoutes.js        — All HTTP routes
server.js                  — Express + Socket.IO
dashboard/                 — Vite + React + Tailwind v4 (npm run build → public/)
```

## Commands

```bash
npm run lint               # Lint root + dashboard
npm run lint:fix           # Auto-fix lint issues
npm run format             # Format all files with Prettier
npm run format:check       # Check formatting (CI uses this)
npm run audit              # Security audit (moderate+ vulns)
npm run build              # Build dashboard → public/
```

## CI/CD

**GitHub Actions** runs on every push to `main` and all PRs:

- **Lint** — ESLint + Prettier check
- **Security** — npm audit (moderate+ severity)
- **Build** — Matrix: Node 18, 20, 22

**Dependabot** — Weekly npm updates, monthly GitHub Actions updates

**Pre-commit** — Runs `lint-staged` + `npm audit` before each commit

## Workflow

### 1. Planning

**Skill:** `superpowers/writing-plans`

For multi-step features:

1. Write plan to `docs/plans/YYYY-MM-DD-<feature>.md`
2. Include: goal, architecture, tasks (files, code, verify steps)
3. Commit plan before implementation

### 2. Implementation

**Skills:** `superpowers:subagent-driven-development` or `superpowers:executing-plans`

- **Same session:** `subagent-driven-development` — fresh subagent per task, review between tasks
- **Parallel session:** `executing-plans` — batch execution with checkpoints

**Pre-commit hooks** auto-run:

- ESLint on all `.js` files
- Prettier on `.js`, `.json`, `.md`, `.ts`, `.tsx`, `.css`

### 3. Testing

Before marking work complete:

```bash
npm run lint               # Must pass
npm run format:check       # Must pass
npm run audit              # Must pass (moderate+ vulns)
npm run build              # Dashboard must build
node -e "require('./server.js')"  # Server must load
```

**Skill:** `superpowers:verification-before-completion`

### 4. Deployment

**Release checklist:**

1. All tests pass, lint clean, build succeeds
2. Update `package.json` version if appropriate
3. Tag release:
   ```bash
   git tag -a v1.x.x -m "Release description"
   git push origin v1.x.x
   ```

**Version bump guidance:**

| Change type                  | Bump  | Example       |
| ---------------------------- | ----- | ------------- |
| Breaking API change          | Major | 1.0.0 → 2.0.0 |
| New feature, backward compat | Minor | 1.0.0 → 1.1.0 |
| Bug fix, minor improvement   | Patch | 1.0.0 → 1.0.1 |

**When to tag:**

- User-facing feature complete
- Breaking changes documented
- Dashboard rebuilt (`npm run build`)
- Changelog updated (if significant)

## Technical Notes

**Safe key pool:** `keyService.getSafeKeyPool()` strips raw keys to `{ tail, status, usage, errors, lastUsed, cooldownUntil }`. Never send raw keys over wire.

**Native Gemini routing:** Express 5 RegExp for `:streamGenerateContent`:

```js
router.post(/^\/v1\/models\/([^/:]+):(streamGenerateContent|generateContent)$/, ...)
```

**Dashboard dark mode:** Use `.dark` class on `<html>`, not `data-theme`. Tailwind v4: `@custom-variant dark (&:is(.dark *))`.

**Chart colors in SVG:** Use `useCssColors()` hook to resolve CSS vars at runtime (CSS vars don't resolve in SVG attributes).

## Files NOT to Commit

```
.geminitro/keys.json       — API keys
.geminitro/history.json    — local stats
.geminitro/models.json     — cached models
.env                       — environment config
public/                    — built dashboard (regenerate with npm run build)
```
