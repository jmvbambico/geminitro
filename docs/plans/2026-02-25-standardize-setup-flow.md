# Standardize Setup Flow Between Terminal and Browser

**Date:** 2026-02-25  
**Status:** Design  
**Goal:** Standardize installation flow between terminal and browser, ensuring users always have choice of interface at every setup decision point.

---

## Problem Statement

Current setup flow has inconsistencies:

1. **First run (no keys, no agents)**: Offers browser/terminal choice for key setup ✅
2. **Keys exist, no agents**: Only offers terminal, no browser option ❌
3. **Browser wizard**: Doesn't detect existing keys, always starts at key entry ❌

This creates a confusing UX where users with existing keys are forced into terminal-only mode for agent registration.

---

## Design Goals

1. **Consistent choice** - User gets browser/terminal choice at every setup phase
2. **Smart stage detection** - Browser wizard skips completed stages (keys exist → skip to agents)
3. **Preference system** - User can set preferred method, never asked again
4. **Interface parity** - Terminal and browser produce identical configuration outcomes
5. **Option ordering** - Browser first (recommended), terminal second, skip last

---

## Architecture

### Core Principle

Every setup decision point offers terminal/browser choice via a unified helper function, with option order matching between CLI and browser.

### State Detection Flow

**Terminal side:**

1. Check `SETUP_METHOD` env var for saved preference
2. If preference exists, skip prompt and use it
3. Otherwise, fetch `/api/setup-state` to determine what needs setup
4. Prompt user with unified choice helper
5. If "Remember this choice" selected, save to `.env`

**Browser side:**

1. On mount, fetch `/api/setup-state`
2. Check query param `?skip_key=true` for terminal hint
3. Determine initial stage: `hasKeys || skipKey` → `select`, else → `idle`
4. User completes wizard, saves preference in options stage

---

## API Changes

### New Endpoint: GET /api/setup-state

Returns current setup state in one call:

```json
{
  "hasKeys": true,
  "hasAgents": false,
  "models": ["gemini-2.0-flash", "gemini-2.0-flash-exp", ...],
  "agents": [
    { "id": "opencode", "name": "OpenCode" },
    { "id": "continue", "name": "Continue.dev" }
  ]
}
```

**Implementation:**

```javascript
router.get("/api/setup-state", (req, res) => {
  const hasKeys = keyService.getKeyPool().length > 0;
  const hasAgents = require("../src/cli/install").hasAnyAgentInstalled(config.PORT);
  const models = hasKeys
    ? [...(geminiService.getDynamicModels() || []), ...(keyService.getAllOAuthModels() || [])]
    : [];
  const agents = require("../src/cli/install").detectAvailableAgents();

  res.json({ hasKeys, hasAgents, models, agents });
});
```

---

### Updated Endpoint: GET /api/preferences

Returns current preferences from `.env`:

```json
{
  "setupMethod": "browser" // or "terminal" or null
}
```

**Implementation:**

```javascript
router.get("/api/preferences", (req, res) => {
  res.json({
    setupMethod: config.SETUP_METHOD || null,
  });
});
```

---

### Updated Endpoint: POST /api/preferences

Saves preference to `.env`:

```javascript
router.post("/api/preferences", (req, res) => {
  const { setupMethod } = req.body;

  if (setupMethod !== null && !["browser", "terminal"].includes(setupMethod)) {
    return res.status(400).json({ error: "Invalid setupMethod value" });
  }

  try {
    const install = require("../src/cli/install");
    install.writeEnvValue("SETUP_METHOD", setupMethod || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save preference" });
  }
});
```

---

## Configuration Changes

### config/index.js

Add new config variable:

```javascript
module.exports = {
  PORT: parseInt(process.env.PORT || "7536", 10),
  PROXY_API_KEY: process.env.PROXY_API_KEY || "geminitro",
  AUTO_UPDATE: process.env.AUTO_UPDATE === "true",
  SETUP_METHOD: process.env.SETUP_METHOD || null, // NEW: "browser" | "terminal" | null
  // ... existing config
};
```

### .env / .env.example

Add new variable with documentation:

```bash
# Setup flow preference
# Leave empty to be asked each time, or set to "browser" or "terminal"
# to automatically use that interface for all setup tasks
SETUP_METHOD=
```

---

## Terminal Flow Changes

### New Helper Functions

**`promptSetupMethod(message)`** - Unified choice helper:

```javascript
const promptSetupMethod = async (message) => {
  return await select({
    message,
    choices: [
      { name: "Browser — open dashboard setup wizard", value: "browser" },
      { name: "Terminal — interactive CLI setup", value: "terminal" },
      { name: "Skip — I'll do this later", value: "skip" },
    ],
  });
};
```

**`promptSetupMethodWithPreference(message)`** - Adds "Never ask again":

```javascript
const promptSetupMethodWithPreference = async (message) => {
  const method = await promptSetupMethod(message);

  if (method !== "skip") {
    const remember = await confirm({
      message: "Remember this choice? (Never ask again)",
      default: false,
    });

    if (remember) {
      const install = require("../src/cli/install");
      install.writeEnvValue("SETUP_METHOD", method);
      console.log(chalk.green(`  ✓ Preference saved to .env\n`));
    }
  }

  return method;
};
```

**`getSetupState()`** - Fetch state or check locally:

```javascript
const getSetupState = async () => {
  const config = require("../../config");

  // Try to fetch from API if server is running
  try {
    const res = await fetch(`http://localhost:${config.PORT}/api/setup-state`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) return await res.json();
  } catch {}

  // Fallback: check locally
  return {
    hasKeys: hasKeys(),
    hasAgents: isProviderRegistered(),
    models: [],
    agents: [],
  };
};
```

**`openBrowserSetup(path)`** - Start server and open browser:

```javascript
const openBrowserSetup = async (path) => {
  const config = require("../../config");
  const chalk = require("chalk");

  await startServer(config.PORT);
  await new Promise((r) => setTimeout(r, 1000));

  const url = `http://localhost:${config.PORT}${path}`;
  console.log(chalk.cyan(`\n  Opening setup wizard: ${url}\n`));
  await openBrowser(url);
};
```

---

### Updated run() Flow

```javascript
const run = async (options = {}) => {
  const chalk = require("chalk");
  const { select, confirm } = require("@inquirer/prompts");
  const config = require("../../config");
  const { version } = require("../../package.json");

  // Splash screen
  if (options.splash !== false) {
    require("./splash").printSplash(version, config.PORT);
  }

  // Check for saved preference
  const savedMethod = config.SETUP_METHOD;

  // Fetch current setup state
  const setupState = await getSetupState();

  // ========== Phase 1: Keys ==========
  if (!setupState.hasKeys) {
    console.log(chalk.yellow("\n  ⚠  No API keys configured.\n"));

    const method =
      savedMethod || (await promptSetupMethodWithPreference("Add your first Gemini API key via:"));

    if (method === "browser") {
      await openBrowserSetup("/dashboard/setup");
      return;
    } else if (method === "terminal") {
      await handleTerminalKeySetup(); // Existing logic lines 158-260
    } else {
      await startServer(config.PORT);
      return;
    }
  }

  // ========== Phase 2: Agent Registration ==========
  if (!setupState.hasAgents) {
    console.log(
      chalk.yellow("\n  ⚠  GemiNitro is not yet registered to any known coding agents.\n"),
    );

    const method =
      savedMethod ||
      (await promptSetupMethodWithPreference("Register GemiNitro with coding agents via:"));

    if (method === "browser") {
      await openBrowserSetup("/dashboard/setup?skip_key=true");
      return;
    } else if (method === "terminal") {
      await require("./install").runInteractive();
    } else {
      await startServer(config.PORT);
      return;
    }
  }

  // ========== Phase 3: Ready ==========
  const finalChoice =
    savedMethod === "browser"
      ? "browser"
      : await select({
          message: "GemiNitro is ready. How do you want to proceed?",
          choices: [
            { name: "Open browser dashboard", value: "browser" },
            { name: "Stay in terminal", value: "terminal" },
          ],
        });

  await startServer(config.PORT);

  if (finalChoice === "browser") {
    await new Promise((r) => setTimeout(r, 1000));
    const dashUrl = `http://localhost:${config.PORT}/dashboard`;
    console.log(chalk.cyan(`\n  Opening dashboard: ${dashUrl}\n`));
    await openBrowser(dashUrl);
  }
};
```

**Key changes:**

1. Check `config.SETUP_METHOD` first, use if set
2. Consistent `promptSetupMethodWithPreference()` at key and agent phases
3. Query param `?skip_key=true` hints browser to skip key stage
4. Same 3-choice pattern everywhere: Browser / Terminal / Skip

---

## Browser Wizard Changes

### Setup.tsx - Stage Detection

Update `useEffect` to detect existing keys and set initial stage:

```typescript
useEffect(() => {
  // Parse query params
  const urlParams = new URLSearchParams(window.location.search);
  const skipKey = urlParams.get("skip_key") === "true";

  // Fetch setup state and agents in parallel
  Promise.all([api.get("/api/setup-state")])
    .then(([setupState]) => {
      setAgents(setupState.agents || []);
      setSelectedAgents((setupState.agents || []).map((a) => a.id));

      // Determine initial stage
      if (setupState.hasKeys || skipKey) {
        // Keys exist or skip hint → go directly to agent selection
        setModels(setupState.models || []);
        setStage("select");
      } else {
        // No keys → show key entry
        setStage("idle");
      }
    })
    .catch(() => {
      // Server not reachable, default to key entry
      setStage("idle");
    });

  // Check for OAuth return
  checkOAuthReturn();
}, []);
```

---

### Setup.tsx - Add Preference Option

Add new state variable:

```typescript
const [setupPref, setSetupPref] = useState<"browser" | "terminal" | null>(null);
```

Add preference section in options stage (after auto-update):

```tsx
{
  stage === "options" && (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      {/* Existing: Auto-start options */}

      {/* Existing: Auto-update options */}

      {/* NEW: Setup preference */}
      <h3 className="text-sm font-medium mb-3">Setup flow preference</h3>
      <p className="text-xs text-muted-foreground mb-2">
        How should <code className="bg-muted px-1 rounded">geminitro start</code> handle future
        setup screens?
      </p>
      <div className="space-y-2 mb-4">
        <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
          <input
            type="radio"
            name="setupPref"
            checked={setupPref === "browser"}
            onChange={() => setSetupPref("browser")}
            className="w-4 h-4"
          />
          <div className="text-sm">
            <div className="font-medium">Always use browser wizard</div>
            <div className="text-muted-foreground text-xs">Open dashboard for all setup tasks</div>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
          <input
            type="radio"
            name="setupPref"
            checked={setupPref === "terminal"}
            onChange={() => setSetupPref("terminal")}
            className="w-4 h-4"
          />
          <div className="text-sm">
            <div className="font-medium">Always use terminal</div>
            <div className="text-muted-foreground text-xs">Use interactive CLI for setup tasks</div>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
          <input
            type="radio"
            name="setupPref"
            checked={setupPref === null}
            onChange={() => setSetupPref(null)}
            className="w-4 h-4"
          />
          <div className="text-sm">
            <div className="font-medium">Ask me each time</div>
            <div className="text-muted-foreground text-xs">
              Choose browser or terminal each time (default)
            </div>
          </div>
        </label>
      </div>

      <button
        onClick={handleOptions}
        className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
      >
        Install & Finish
      </button>
    </div>
  );
}
```

Update `handleOptions()` to save preference:

```typescript
const handleOptions = async () => {
  setStage("installing");
  try {
    // Install to agents
    const res = await api.post("/api/agents/install", {
      agents: selectedAgents,
      scope,
      autoStart,
      autoUpdate,
    });

    if (!res.success) {
      setStage("error");
      setMessage("Failed to install to agents");
      return;
    }

    // Save setup preference
    await api.post("/api/preferences", { setupMethod: setupPref });

    setStage("success");
  } catch {
    setStage("error");
    setMessage("Could not reach server");
  }
};
```

---

## Settings Page Changes

Add new section in Settings.tsx after Proxy API Key section:

```tsx
// State
const [setupPreference, setSetupPreference] = useState<"browser" | "terminal" | null>(null);

// Fetch on mount
useEffect(() => {
  api.get("/api/preferences").then((data) => {
    setSetupPreference(data.setupMethod || null);
  });
}, []);

// Update handler
const handlePreferenceChange = async (value: "browser" | "terminal" | null) => {
  const res = await api.post("/api/preferences", { setupMethod: value });
  if (!res.error) {
    setSetupPreference(value);
    // Show success toast or message
  }
};

// UI
<div className="space-y-4">
  <h3 className="text-lg font-semibold">Setup Flow Preference</h3>
  <p className="text-sm text-muted-foreground">
    Choose how to handle setup screens when running{" "}
    <code className="bg-muted px-1 rounded">geminitro start</code>
  </p>

  <div className="space-y-2">
    <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
      <input
        type="radio"
        name="setupPreference"
        checked={setupPreference === "browser"}
        onChange={() => handlePreferenceChange("browser")}
        className="w-4 h-4"
      />
      <div>
        <div className="font-medium">Browser (Recommended)</div>
        <div className="text-xs text-muted-foreground">
          Always open dashboard wizard for setup tasks
        </div>
      </div>
    </label>

    <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
      <input
        type="radio"
        name="setupPreference"
        checked={setupPreference === "terminal"}
        onChange={() => handlePreferenceChange("terminal")}
        className="w-4 h-4"
      />
      <div>
        <div className="font-medium">Terminal</div>
        <div className="text-xs text-muted-foreground">Use interactive CLI for setup tasks</div>
      </div>
    </label>

    <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
      <input
        type="radio"
        name="setupPreference"
        checked={setupPreference === null}
        onChange={() => handlePreferenceChange(null)}
        className="w-4 h-4"
      />
      <div>
        <div className="font-medium">Ask Every Time</div>
        <div className="text-xs text-muted-foreground">
          Choose browser or terminal each time (default)
        </div>
      </div>
    </label>
  </div>
</div>;
```

---

## Implementation Tasks

### 1. Configuration (config/index.js, .env)

- [ ] Add `SETUP_METHOD` to config/index.js
- [ ] Add `SETUP_METHOD=` to .env.example with documentation
- [ ] Verify existing `writeEnvValue()` in src/cli/install.js works correctly

### 2. API Endpoints (routes/apiRoutes.js)

- [ ] Implement `GET /api/setup-state` endpoint
- [ ] Update `GET /api/preferences` to return `{ setupMethod }`
- [ ] Update `POST /api/preferences` to write to .env using writeEnvValue()

### 3. Terminal Flow (src/cli/firstRun.js)

- [ ] Create `promptSetupMethod()` helper
- [ ] Create `promptSetupMethodWithPreference()` helper with "Never ask again"
- [ ] Create `getSetupState()` helper
- [ ] Create `openBrowserSetup(path)` helper
- [ ] Refactor `run()` to check `config.SETUP_METHOD` first
- [ ] Update key setup phase to use unified helper
- [ ] Update agent registration phase to use unified helper
- [ ] Add query param `?skip_key=true` when opening browser for agent setup

### 4. Browser Wizard (dashboard/src/pages/Setup.tsx)

- [ ] Add `setupPref` state variable
- [ ] Update `useEffect` to fetch `/api/setup-state`
- [ ] Check `?skip_key=true` query param
- [ ] Set initial stage based on `hasKeys` or query param
- [ ] Add setup preference radio buttons in options stage
- [ ] Update `handleOptions()` to save preference via API

### 5. Settings Page (dashboard/src/pages/Settings.tsx)

- [ ] Add `setupPreference` state variable
- [ ] Fetch current preference from `/api/preferences` on mount
- [ ] Add "Setup Flow Preference" section with three radio options
- [ ] Implement `handlePreferenceChange()` to POST to `/api/preferences`

### 6. Testing

- [ ] First run (no keys, no agents) → offers browser/terminal → saves preference
- [ ] Keys exist, no agents → offers browser/terminal → browser skips to agents
- [ ] `SETUP_METHOD=browser` in .env → auto-opens browser, no prompt
- [ ] `SETUP_METHOD=terminal` in .env → runs terminal flow, no prompt
- [ ] Settings page preference change → updates .env → reflects in next start
- [ ] `?skip_key=true` query param → wizard starts at agent selection
- [ ] Preference "Ask every time" (empty/null) → always prompts user

---

## Success Criteria

✅ **Consistency**: User gets browser/terminal choice at ALL setup decision points  
✅ **Intelligence**: Browser wizard detects existing keys and skips to agent selection  
✅ **Persistence**: User can save preference, never asked again  
✅ **Flexibility**: User can change preference anytime via Settings  
✅ **Parity**: Terminal and browser flows produce identical configurations  
✅ **UX**: Browser option always listed first (recommended)

---

## Future Enhancements

- Add `geminitro config reset` command to clear `SETUP_METHOD` from .env
- Add preference indicator in dashboard header ("Setup preference: Browser")
- Consider per-setup-phase preferences (keys → browser, agents → terminal)
