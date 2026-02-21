# OpenCrabs Agent Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenCrabs as a supported coding agent in `geminitro install`, writing its TOML config/keys files and wiring up detection for uninstall.

**Architecture:** Follow the exact pattern of existing agent installers (`installCodex`, `uninstallCodex`). OpenCrabs uses two TOML files: `~/.opencrabs/config.toml` (provider settings) and `~/.opencrabs/keys.toml` (API keys, separate by design). Both are written by the installer; the uninstaller removes only the `providers.custom` block when it points to the GemiNitro port.

**Tech Stack:** Node.js, `@iarna/toml` (already a dep), `fs`, `path`, `os` — no new deps.

---

### Task 1: Add `installOpenCrabs` to `src/cli/install.js`

**Files:**

- Modify: `src/cli/install.js`

**Step 1: Read the file and locate the insertion point**

Open `src/cli/install.js`. Find the `installCodex` function (ends around line 244). The new function goes immediately after it.

**Step 2: Add `installOpenCrabs` function**

Insert after `installCodex` (before the `uninstall*` functions):

```js
const installOpenCrabs = async (models, port, apiKey, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".opencrabs", "config.toml");
  const keysPath = path.join(os.homedir(), ".opencrabs", "keys.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  // config.toml — provider settings (safe to read/merge)
  let doc = {};
  if (fs.existsSync(configPath)) {
    try {
      doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }
  if (!doc.providers) doc.providers = {};
  doc.providers.custom = {
    enabled: true,
    base_url: `http://localhost:${port}/v1`,
    default_model: models[0] ?? "gemini-2.0-flash",
  };
  fs.writeFileSync(configPath, TOML.stringify(doc));

  // keys.toml — API key (chmod 600 expected by OpenCrabs)
  let keys = {};
  if (fs.existsSync(keysPath)) {
    try {
      keys = TOML.parse(fs.readFileSync(keysPath, "utf8"));
    } catch {}
  }
  if (!keys.providers) keys.providers = {};
  keys.providers.custom = { api_key: apiKey };
  fs.writeFileSync(keysPath, TOML.stringify(keys));
  try {
    fs.chmodSync(keysPath, 0o600);
  } catch {}

  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.green(`  ✓ Written to ${keysPath}  (chmod 600)`));
  console.log(
    chalk.gray("  In OpenCrabs, select the custom provider or set OPENAI_BASE_URL env var."),
  );
  console.log(
    chalk.yellow(
      "  Note: if Anthropic/OpenAI/OpenRouter providers are also enabled in config.toml,",
    ),
  );
  console.log(
    chalk.yellow(
      "  they take priority over custom. Disable them or set custom as the only enabled provider.",
    ),
  );
};
```

**Step 3: Verify file saved cleanly — no syntax errors**

```bash
node -e "require('./src/cli/install.js')" 2>&1
```

Expected: no output (clean require).

---

### Task 2: Add `uninstallOpenCrabs` to `src/cli/install.js`

**Files:**

- Modify: `src/cli/install.js`

**Step 1: Add `uninstallOpenCrabs` function**

Insert after `uninstallCodex` (before `uninstallLaunchd`):

```js
const uninstallOpenCrabs = (port, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".opencrabs", "config.toml");
  const keysPath = path.join(os.homedir(), ".opencrabs", "keys.toml");

  let removed = false;

  if (fs.existsSync(configPath)) {
    try {
      const doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
      const url = doc?.providers?.custom?.base_url ?? "";
      if (url.includes(`localhost:${port}`)) {
        delete doc.providers.custom;
        if (Object.keys(doc.providers).length === 0) delete doc.providers;
        fs.writeFileSync(configPath, TOML.stringify(doc));
        removed = true;
      }
    } catch {}
  }

  if (fs.existsSync(keysPath)) {
    try {
      const keys = TOML.parse(fs.readFileSync(keysPath, "utf8"));
      if (keys?.providers?.custom) {
        delete keys.providers.custom;
        if (Object.keys(keys.providers).length === 0) delete keys.providers;
        fs.writeFileSync(keysPath, TOML.stringify(keys));
        removed = true;
      }
    } catch {}
  }

  if (removed) console.log(chalk.green(`  ✓ Removed GemiNitro from OpenCrabs config`));
};
```

**Step 2: Verify clean require**

```bash
node -e "require('./src/cli/install.js')" 2>&1
```

Expected: no output.

---

### Task 3: Wire OpenCrabs into detection and uninstall dispatch

**Files:**

- Modify: `src/cli/install.js`

**Step 1: Update `hasAnyAgentInstalled` to detect OpenCrabs**

Find the `hasAnyAgentInstalled` function. Add an OpenCrabs check at the end, before `return false`:

```js
try {
  const TOML = require("@iarna/toml");
  const doc = TOML.parse(
    fs.readFileSync(path.join(os.homedir(), ".opencrabs", "config.toml"), "utf8"),
  );
  if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${port}`)) return true;
} catch {}
```

**Step 2: Update `runUninstall` to show OpenCrabs in the found-list and call uninstaller**

In `runUninstall`, after the Codex detection `try/catch` block (the one that logs `(Codex CLI)`), add:

```js
try {
  const TOML = require("@iarna/toml");
  const doc = TOML.parse(
    fs.readFileSync(path.join(os.homedir(), ".opencrabs", "config.toml"), "utf8"),
  );
  if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${PORT}`))
    console.log(
      chalk.gray(`    • ${path.join(os.homedir(), ".opencrabs", "config.toml")}  (OpenCrabs)`),
    );
} catch {}
```

Then after `uninstallCodex(PORT, chalk);`, add:

```js
uninstallOpenCrabs(PORT, chalk);
```

**Step 3: Update `run()` dispatch — add OpenCrabs to agent label map**

In `run()`, find:

```js
const agentLabel =
  { opencode: "OpenCode", continue: "Continue.dev", aider: "Aider", codex: "Codex CLI" }[agent] ??
  agent;
```

Change to:

```js
const agentLabel =
  {
    opencode: "OpenCode",
    continue: "Continue.dev",
    aider: "Aider",
    codex: "Codex CLI",
    opencrabs: "OpenCrabs",
  }[agent] ?? agent;
```

Then find the dispatch block:

```js
if (agent === "opencode") await installOpenCode(models, PORT, PROXY_API_KEY, chalk, select);
else if (agent === "continue") await installContinue(models, PORT, PROXY_API_KEY, chalk);
else if (agent === "aider") await installAider(models, PORT, PROXY_API_KEY, chalk);
else if (agent === "codex") await installCodex(models, PORT, PROXY_API_KEY, chalk);
```

Add:

```js
  else if (agent === "opencrabs") await installOpenCrabs(models, PORT, PROXY_API_KEY, chalk);
```

**Step 4: Verify clean require**

```bash
node -e "require('./src/cli/install.js')" 2>&1
```

Expected: no output.

---

### Task 4: Add OpenCrabs to `firstRun.js` — agent selector + detection

**Files:**

- Modify: `src/cli/firstRun.js`

**Step 1: Add OpenCrabs to `isProviderRegistered`**

In `isProviderRegistered()`, after the Codex `try/catch` block and before `return false`, add:

```js
try {
  const TOML = require("@iarna/toml");
  const doc = TOML.parse(
    fs.readFileSync(path.join(os.homedir(), ".opencrabs", "config.toml"), "utf8"),
  );
  if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${PORT}`)) return true;
} catch {}
```

**Step 2: Add OpenCrabs to the agent selector choices**

Find the `choices` array in the `agent` select prompt:

```js
        choices: [
          { name: "OpenCode", value: "opencode" },
          { name: "Continue.dev  (VS Code / JetBrains)", value: "continue" },
          { name: "Aider  (CLI)", value: "aider" },
          { name: "Codex CLI  (OpenAI CLI)", value: "codex" },
        ],
```

Change to:

```js
        choices: [
          { name: "OpenCode", value: "opencode" },
          { name: "Continue.dev  (VS Code / JetBrains)", value: "continue" },
          { name: "Aider  (CLI)", value: "aider" },
          { name: "Codex CLI  (OpenAI CLI)", value: "codex" },
          { name: "OpenCrabs  (Rust TUI agent)", value: "opencrabs" },
        ],
```

**Step 3: Verify clean require**

```bash
node -e "require('./src/cli/firstRun.js')" 2>&1
```

Expected: no output.

---

### Task 5: Smoke test the full install path end-to-end

**Step 1: Dry-run the install module in isolation**

```bash
node -e "
const { run } = require('./src/cli/install.js');
console.log('install.js exports OK:', typeof run);
"
```

Expected: `install.js exports OK: function`

**Step 2: Verify firstRun exports**

```bash
node -e "
const { run } = require('./src/cli/firstRun.js');
console.log('firstRun.js exports OK:', typeof run);
"
```

Expected: `firstRun.js exports OK: function`

**Step 3: Verify TOML round-trip for the install output shape**

```bash
node -e "
const TOML = require('@iarna/toml');
const doc = { providers: { custom: { enabled: true, base_url: 'http://localhost:7536/v1', default_model: 'gemini-2.0-flash' } } };
const out = TOML.stringify(doc);
console.log(out);
const parsed = TOML.parse(out);
console.assert(parsed.providers.custom.base_url === 'http://localhost:7536/v1', 'round-trip OK');
console.log('TOML round-trip: OK');
"
```

Expected: TOML output printed, `TOML round-trip: OK`.
