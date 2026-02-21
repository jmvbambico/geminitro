# Multi-Agent Support: Continue.dev, Aider, Codex CLI

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add install/uninstall handlers for Continue.dev, Aider, and Codex CLI alongside the existing OpenCode handler.

**Architecture:** Each new agent gets an install function in `install.js`. The `run()` function is refactored to dispatch to agent-specific install logic via a `AGENT_CONFIGS` map. Agents with file-based config (Continue.dev → YAML append, Aider → YAML write, Codex CLI → TOML write) are automated. The `firstRun.js` agent selector gains the three new choices. Uninstall detection expands to scan all new config locations.

**Tech Stack:** Node.js, `js-yaml` (new dep — needed to safely parse/serialize YAML for Continue.dev and Aider configs without corrupting user comments), `@iarna/toml` (new dep — for Codex CLI config.toml read/write).

---

### Task 1: Install js-yaml and @iarna/toml dependencies

**Files:**
- Modify: `package.json`

**Step 1: Add dependencies**

```bash
npm install js-yaml @iarna/toml
```

**Step 2: Verify install**

```bash
node -e "require('js-yaml'); require('@iarna/toml'); console.log('ok')"
```
Expected: `ok`

---

### Task 2: Refactor `run()` in install.js — extract OpenCode logic into its own handler

This refactor isolates the OpenCode-specific install so adding new agents doesn't expand `run()` further.

**Files:**
- Modify: `src/cli/install.js`

**Step 1: Extract installOpenCode()**

Pull the OpenCode-specific block (scope prompt → config read/merge/write → success message) out of `run()` into a standalone `installOpenCode(models, port, apiKey, chalk, select)` async function. `run()` becomes a dispatcher that calls the right handler after the agent is selected. The auto-start and auto-update prompts stay in `run()` after the handler returns (they are agent-agnostic).

Key invariant: `clearInstallData()` and the auto-start/auto-update prompts must remain in `run()`, not move into any agent handler.

**Step 2: Verify existing OpenCode flow still works**

```bash
node -e "require('./src/cli/install'); console.log('load ok')"
```
Expected: `load ok` (no errors on require)

---

### Task 3: Add Continue.dev install handler

**Config format (append to `~/.continue/config.yaml`):**

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

One entry is appended per model. If the file doesn't exist, create it with the full header. If it already has a GemiNitro entry (detected by `apiBase` containing `localhost:7536`), skip adding duplicates.

**Files:**
- Modify: `src/cli/install.js`

**Step 1: Write `installContinue(models, port, apiKey, chalk)` function**

```js
const installContinue = async (models, port, apiKey, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".continue", "config.yaml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let doc = { name: "Local Agent", version: "1.0.0", schema: "v1", models: [] };
  if (fs.existsSync(configPath)) {
    try { doc = yaml.load(fs.readFileSync(configPath, "utf8")) || doc; } catch {}
  }
  if (!Array.isArray(doc.models)) doc.models = [];

  // Remove existing GemiNitro entries
  doc.models = doc.models.filter(m => !String(m.apiBase || "").includes(`localhost:${port}`));

  // Append one entry per model
  const primary = models[0] ?? "gemini-2.0-flash";
  doc.models.push({
    name: `GemiNitro / ${primary}`,
    provider: "openai",
    model: primary,
    apiBase: `http://localhost:${port}/v1`,
    apiKey,
    roles: ["chat", "edit", "apply"],
  });

  fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Restart VS Code or reload the Continue extension to pick up the change."));
};
```

**Step 2: Add "continue" to AGENT_CONFIGS and wire into dispatcher in run()**

```js
continue: { label: "Continue.dev", globalOnly: true },
```

The dispatcher calls `installContinue(models, PORT, PROXY_API_KEY, chalk)` when `agent === "continue"`.

**Step 3: Verify**

```bash
node -e "require('./src/cli/install'); console.log('load ok')"
```

---

### Task 4: Add Aider install handler

**Config format (`~/.aider.conf.yml`):**

```yaml
openai-api-base: http://localhost:7536/v1
openai-api-key: geminitro
model: gemini-2.0-flash
```

If the file already exists, update the three keys in place (preserving other keys). Use js-yaml load/dump.

**Files:**
- Modify: `src/cli/install.js`

**Step 1: Write `installAider(models, port, apiKey, chalk)` function**

```js
const installAider = async (models, port, apiKey, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".aider.conf.yml");

  let doc = {};
  if (fs.existsSync(configPath)) {
    try { doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {}; } catch {}
  }

  doc["openai-api-base"] = `http://localhost:${port}/v1`;
  doc["openai-api-key"] = apiKey;
  doc["model"] = models[0] ?? "gemini-2.0-flash";

  fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Aider will use GemiNitro for all future sessions."));
};
```

**Step 2: Add "aider" to AGENT_CONFIGS and wire into dispatcher**

```js
aider: { label: "Aider", globalOnly: true },
```

No scope prompt for Aider — config is always global (`~/.aider.conf.yml`).

**Step 3: Verify**

```bash
node -e "require('./src/cli/install'); console.log('load ok')"
```

---

### Task 5: Add Codex CLI install handler

**Config format (`~/.codex/config.toml`):**

```toml
provider = "openai"
model = "gemini-2.0-flash"

[providers.openai]
base_url = "http://localhost:7536/v1"
api_key = "geminitro"
```

If the file exists, merge: update `provider`, `model`, and the `[providers.openai]` table. Preserve other keys.

**Files:**
- Modify: `src/cli/install.js`

**Step 1: Write `installCodex(models, port, apiKey, chalk)` function**

```js
const installCodex = async (models, port, apiKey, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let doc = {};
  if (fs.existsSync(configPath)) {
    try { doc = TOML.parse(fs.readFileSync(configPath, "utf8")); } catch {}
  }

  doc.provider = "openai";
  doc.model = models[0] ?? "gemini-2.0-flash";
  if (!doc.providers) doc.providers = {};
  doc.providers.openai = { base_url: `http://localhost:${port}/v1`, api_key: apiKey };

  fs.writeFileSync(configPath, TOML.stringify(doc));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Codex CLI will use GemiNitro as the OpenAI-compatible provider."));
};
```

**Step 2: Add "codex" to AGENT_CONFIGS and wire into dispatcher**

```js
codex: { label: "Codex CLI", globalOnly: true },
```

**Step 3: Verify**

```bash
node -e "require('./src/cli/install'); console.log('load ok')"
```

---

### Task 6: Update `firstRun.js` agent selector

The agent selector in `firstRun.js` only shows "OpenCode". Add the three new agents.

**Files:**
- Modify: `src/cli/firstRun.js`

**Step 1: Expand choices array**

```js
choices: [
  { name: "OpenCode", value: "opencode" },
  { name: "Continue.dev  (VS Code / JetBrains)", value: "continue" },
  { name: "Aider  (CLI)", value: "aider" },
  { name: "Codex CLI  (OpenAI CLI)", value: "codex" },
],
```

**Step 2: Verify**

```bash
node -e "require('./src/cli/firstRun'); console.log('load ok')"
```

---

### Task 7: Update `firstRun.js` `isProviderRegistered()` to detect all agents

Currently only checks OpenCode config files. Needs to also detect Continue.dev, Aider, Codex CLI registrations so the first-run warning doesn't fire unnecessarily for users who already installed via those agents.

**Files:**
- Modify: `src/cli/firstRun.js`

**Step 1: Expand isProviderRegistered()**

```js
const isProviderRegistered = () => {
  const { PORT } = require("../../config");

  // OpenCode
  for (const p of [OPENCODE_GLOBAL_CONFIG, OPENCODE_LOCAL_CONFIG]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg?.provider?.geminitro) return true;
    } catch {}
  }

  // Continue.dev
  try {
    const yaml = require("js-yaml");
    const continuePath = path.join(os.homedir(), ".continue", "config.yaml");
    const doc = yaml.load(fs.readFileSync(continuePath, "utf8"));
    if (Array.isArray(doc?.models) && doc.models.some(m => String(m.apiBase || "").includes(`localhost:${PORT}`))) return true;
  } catch {}

  // Aider
  try {
    const yaml = require("js-yaml");
    const aiderPath = path.join(os.homedir(), ".aider.conf.yml");
    const doc = yaml.load(fs.readFileSync(aiderPath, "utf8"));
    if (String(doc?.["openai-api-base"] || "").includes(`localhost:${PORT}`)) return true;
  } catch {}

  // Codex CLI
  try {
    const TOML = require("@iarna/toml");
    const codexPath = path.join(os.homedir(), ".codex", "config.toml");
    const doc = TOML.parse(fs.readFileSync(codexPath, "utf8"));
    if (String(doc?.providers?.openai?.base_url || "").includes(`localhost:${PORT}`)) return true;
  } catch {}

  return false;
};
```

**Step 2: Verify**

```bash
node -e "require('./src/cli/firstRun'); console.log('load ok')"
```

---

### Task 8: Update `detectInstalledLocations()` and `runUninstall()` for new agents

Uninstall auto-detection currently only scans OpenCode config paths. It needs to also find and clean up Continue.dev, Aider, and Codex CLI registrations.

**Files:**
- Modify: `src/cli/install.js`

**Step 1: Add per-agent uninstall functions**

```js
const uninstallContinue = (port, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".continue", "config.yaml");
  if (!fs.existsSync(configPath)) return;
  try {
    let doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
    if (!Array.isArray(doc.models)) return;
    doc.models = doc.models.filter(m => !String(m.apiBase || "").includes(`localhost:${port}`));
    fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
    console.log(chalk.green(`  ✓ Removed GemiNitro from ${configPath}`));
  } catch {}
};

const uninstallAider = (port, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".aider.conf.yml");
  if (!fs.existsSync(configPath)) return;
  try {
    let doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
    if (!String(doc["openai-api-base"] || "").includes(`localhost:${port}`)) return;
    delete doc["openai-api-base"];
    delete doc["openai-api-key"];
    delete doc["model"];
    fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
    console.log(chalk.green(`  ✓ Removed GemiNitro from ${configPath}`));
  } catch {}
};

const uninstallCodex = (port, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  if (!fs.existsSync(configPath)) return;
  try {
    let doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
    if (!String(doc?.providers?.openai?.base_url || "").includes(`localhost:${port}`)) return;
    delete doc.providers.openai;
    if (Object.keys(doc.providers).length === 0) delete doc.providers;
    if (doc.provider === "openai") delete doc.provider;
    if (doc.model) delete doc.model;
    fs.writeFileSync(configPath, TOML.stringify(doc));
    console.log(chalk.green(`  ✓ Removed GemiNitro from ${configPath}`));
  } catch {}
};
```

**Step 2: Update `detectInstalledLocations()` to also detect new agent configs**

The function needs to return a structured result so `runUninstall` knows which agents to clean up. Refactor its return value to an array of `{ path, agent }` objects (or keep paths-only and handle cleanup by type). Simplest approach: keep paths-only, call all three uninstall functions unconditionally (each is a no-op if not present).

**Step 3: Update `runUninstall()` to call the three new uninstall functions**

After removing OpenCode entries, call:
```js
const { PORT } = require("../../config");
uninstallContinue(PORT, chalk);
uninstallAider(PORT, chalk);
uninstallCodex(PORT, chalk);
```

Also update the "Nothing to remove" check to consider all agents.

**Step 4: Verify**

```bash
node -e "require('./src/cli/install'); console.log('load ok')"
```

---

### Task 9: Update `bin/geminitro.js` install/uninstall descriptions + README

**Files:**
- Modify: `bin/geminitro.js` — descriptions already agent-agnostic, no change needed
- Modify: `README.md` — update CLI reference table, add Continue.dev/Aider/Codex to "Coding Agent Integration" section

**Step 1: Update README Coding Agent Integration section**

Add a subsection for each new agent showing the config that gets written. Mirror the existing OpenCode example.

**Step 2: Update CLI Reference table**

Ensure `geminitro install` description mentions all four agents.

---

### Task 10: Build dashboard + final smoke test

**Step 1: Build**

```bash
npm run build
```
Expected: `✓ built in X.XXs`, zero TypeScript errors.

**Step 2: Smoke test require chain**

```bash
node -e "
  require('./src/cli/install');
  require('./src/cli/firstRun');
  console.log('all modules load ok');
"
```
Expected: `all modules load ok`

**Step 3: Verify js-yaml and @iarna/toml are in package.json dependencies**

```bash
node -e "const p = require('./package.json'); console.log(p.dependencies['js-yaml'], p.dependencies['@iarna/toml'])"
```
Expected: two version strings printed.

---

### Notes for Implementer

- `run()` scope prompt currently hardcodes `"./opencode.json"` as local path label — this should become agent-specific. For Continue.dev, Aider, and Codex CLI, there is no "local" scope (config is always global home-dir). Skip the scope prompt for these agents entirely.
- `clearInstallData()` stays in `run()` — it runs regardless of which agent is selected.
- The auto-start and auto-update prompts also stay in `run()` — agent-agnostic.
- The success message `"Select models with: geminitro/<model-id>"` is OpenCode-specific syntax — other agents should get agent-specific next-step hints (e.g., for Continue.dev: "Restart VS Code and select the model in Continue's model picker").
- For Aider: only write the first model as the default `model:` key. List all available models as a comment if desired, but a single model entry is the correct Aider config pattern.
