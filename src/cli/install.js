"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENCODE_GLOBAL_CONFIG = path.join(os.homedir(), ".config", "opencode", "opencode.json");

const FALLBACK_MODELS = [
  "gemini-2.5-pro-preview-06-05",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
];

const fetchLiveModels = async (port, apiKey) => {
  try {
    const health = await fetch(`http://localhost:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!health.ok) return null;
    const modelsRes = await fetch(`http://localhost:${port}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(2000),
    });
    if (!modelsRes.ok) return null;
    const data = await modelsRes.json();
    const models = data.data?.map((m) => m.id) ?? [];
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
};

const readConfig = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
};

const readCachedModels = () => {
  const config = require("../../config");
  const modelsFile = config.MODELS_FILE;
  if (!fs.existsSync(modelsFile)) return null;
  try {
    const raw = fs.readFileSync(modelsFile, "utf8");
    const models = raw.trim() ? JSON.parse(raw) : [];
    return models.length > 0 ? models : null;
  } catch {
    return null;
  }
};

const writeEnvValue = (key, value) => {
  const envPath = path.join(process.cwd(), ".env");
  let content = "";
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {}
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  content = re.test(content)
    ? content.replace(re, line)
    : content + (content.endsWith("\n") ? "" : "\n") + line + "\n";
  fs.writeFileSync(envPath, content);
};

const installLaunchd = (execPath, scriptPath) => {
  const logDir = path.join(os.homedir(), ".config", "geminitro", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const plistDir = path.join(os.homedir(), "Library", "LaunchAgents");
  fs.mkdirSync(plistDir, { recursive: true });
  const plistPath = path.join(plistDir, "ai.geminitro.plist");
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ai.geminitro</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
    <string>${scriptPath}</string>
    <string>start</string>
    <string>--no-splash</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${logDir}/stdout.log</string>
  <key>StandardErrorPath</key><string>${logDir}/stderr.log</string>
</dict>
</plist>`;
  fs.writeFileSync(plistPath, plist);
  try {
    require("child_process").execSync(`launchctl load "${plistPath}"`, { stdio: "ignore" });
    return { ok: true, msg: `launchd service installed and loaded` };
  } catch {
    return {
      ok: true,
      msg: `plist written to ${plistPath} — load with: launchctl load "${plistPath}"`,
    };
  }
};

const installSystemd = (execPath, scriptPath) => {
  const serviceDir = path.join(os.homedir(), ".config", "systemd", "user");
  fs.mkdirSync(serviceDir, { recursive: true });
  const servicePath = path.join(serviceDir, "geminitro.service");
  const service = `[Unit]
Description=GemiNitro — Gemini API Proxy
After=network.target

[Service]
ExecStart=${execPath} ${scriptPath} start --no-splash
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
  fs.writeFileSync(servicePath, service);
  try {
    const { execSync } = require("child_process");
    execSync("systemctl --user daemon-reload", { stdio: "ignore" });
    execSync("systemctl --user enable geminitro", { stdio: "ignore" });
    execSync("systemctl --user start geminitro", { stdio: "ignore" });
    return { ok: true, msg: "systemd user service installed, enabled, and started" };
  } catch {
    return {
      ok: true,
      msg: `service written to ${servicePath}\n  Run: systemctl --user daemon-reload && systemctl --user enable --now geminitro`,
    };
  }
};

const installOpenCode = async (models, port, apiKey, chalk, select, scope = null) => {
  // If scope is provided (API call), use it directly; otherwise prompt (terminal)
  if (scope === null) {
    scope = await select({
      message: "Where should GemiNitro be registered?",
      choices: [
        { name: `Global  (${OPENCODE_GLOBAL_CONFIG})  — all projects`, value: "global" },
        { name: `Local   (./opencode.json)  — this project only`, value: "local" },
      ],
    });
  } else if (select) {
    // scope provided but select also available - still prompt for confirmation
    const confirmed = await select({
      message: `Register GemiNitro ${scope === "global" ? "globally" : "locally"}?`,
      choices: [
        { name: "Yes", value: true },
        { name: "Cancel", value: false },
      ],
    });
    if (!confirmed) return;
  }

  const targetPath =
    scope === "global" ? OPENCODE_GLOBAL_CONFIG : path.join(process.cwd(), "opencode.json");

  const modelEntries = {};
  for (const id of models) {
    modelEntries[id] = {
      name: `${id} (GemiNitro)`,
      limit: { context: 1048576, output: 65536 },
      modalities: { input: ["text", "image"], output: ["text"] },
    };
  }
  const providerBlock = {
    npm: "@ai-sdk/openai-compatible",
    name: "GemiNitro",
    options: { baseURL: `http://localhost:${port}/v1`, apiKey },
    models: modelEntries,
  };

  const existing = readConfig(targetPath);
  const merged = {
    $schema: "https://opencode.ai/config.json",
    ...existing,
    provider: { ...(existing.provider || {}), geminitro: providerBlock },
  };

  console.log(chalk.bold("\n  Config preview:\n"));
  const preview = JSON.stringify({ provider: { geminitro: providerBlock } }, null, 2)
    .split("\n")
    .slice(0, 12)
    .map((l) => "  " + chalk.gray(l))
    .join("\n");
  console.log(preview);
  console.log(chalk.gray("  ...\n"));

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(chalk.green(`  ✓ Written to ${targetPath}`));
  console.log(chalk.gray("  Select models with:  geminitro/<model-id>"));
};

const installContinue = async (models, port, apiKey, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".continue", "config.yaml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let doc = { name: "Local Agent", version: "1.0.0", schema: "v1", models: [] };
  if (fs.existsSync(configPath)) {
    try {
      doc = yaml.load(fs.readFileSync(configPath, "utf8")) || doc;
    } catch {}
  }
  if (!Array.isArray(doc.models)) doc.models = [];

  doc.models = doc.models.filter((m) => !String(m.apiBase || "").includes(`localhost:${port}`));

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
  console.log(
    chalk.gray("  Restart VS Code or reload the Continue extension to pick up the change."),
  );
  console.log(chalk.gray("  Select the model in Continue's model picker to use GemiNitro."));
};

const installAider = async (models, port, apiKey, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".aider.conf.yml");

  let doc = {};
  if (fs.existsSync(configPath)) {
    try {
      doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
    } catch {}
  }

  doc["openai-api-base"] = `http://localhost:${port}/v1`;
  doc["openai-api-key"] = apiKey;
  doc["model"] = models[0] ?? "gemini-2.0-flash";

  fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Aider will use GemiNitro for all future sessions."));
  console.log(chalk.gray(`  Override model per-session with:  aider --model ${doc["model"]}`));
};

const installCodex = async (models, port, apiKey, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".codex", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let doc = {};
  if (fs.existsSync(configPath)) {
    try {
      doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }

  doc.provider = "openai";
  doc.model = models[0] ?? "gemini-2.0-flash";
  if (!doc.providers) doc.providers = {};
  doc.providers.openai = { base_url: `http://localhost:${port}/v1`, api_key: apiKey };

  fs.writeFileSync(configPath, TOML.stringify(doc));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Codex CLI will use GemiNitro as the OpenAI-compatible provider."));
};

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

const installKimiCode = async (models, port, apiKey, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".kimi", "config.toml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });

  let doc = {};
  if (fs.existsSync(configPath)) {
    try {
      doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
    } catch {}
  }

  doc.default_model = "geminitro";

  if (!doc.providers) doc.providers = {};
  doc.providers.geminitro = {
    type: "openai_legacy",
    base_url: `http://localhost:${port}/v1`,
    api_key: apiKey,
  };

  if (!doc.models) doc.models = {};
  doc.models.geminitro = {
    provider: "geminitro",
    model: models[0] ?? "gemini-2.0-flash",
    max_context_size: 1048576,
    capabilities: ["thinking", "image_in"],
  };

  fs.writeFileSync(configPath, TOML.stringify(doc));
  console.log(chalk.green(`  ✓ Written to ${configPath}`));
  console.log(chalk.gray("  Kimi Code will use GemiNitro via the 'geminitro' provider."));
};

const uninstallContinue = (port, chalk) => {
  const yaml = require("js-yaml");
  const configPath = path.join(os.homedir(), ".continue", "config.yaml");
  if (!fs.existsSync(configPath)) return;
  try {
    let doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
    if (!Array.isArray(doc.models)) return;
    const before = doc.models.length;
    doc.models = doc.models.filter((m) => !String(m.apiBase || "").includes(`localhost:${port}`));
    if (doc.models.length === before) return;
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
    delete doc.model;
    fs.writeFileSync(configPath, TOML.stringify(doc));
    console.log(chalk.green(`  ✓ Removed GemiNitro from ${configPath}`));
  } catch {}
};

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

const uninstallKimiCode = (port, chalk) => {
  const TOML = require("@iarna/toml");
  const configPath = path.join(os.homedir(), ".kimi", "config.toml");

  if (!fs.existsSync(configPath)) return;

  try {
    const doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
    const url = doc?.providers?.geminitro?.base_url ?? "";
    if (url.includes(`localhost:${port}`)) {
      delete doc.providers.geminitro;
      if (Object.keys(doc.providers).length === 0) delete doc.providers;
      if (doc.default_model === "geminitro") {
        delete doc.default_model;
      }
      if (doc.models?.geminitro) {
        delete doc.models.geminitro;
        if (Object.keys(doc.models).length === 0) delete doc.models;
      }
      fs.writeFileSync(configPath, TOML.stringify(doc));
      console.log(chalk.green(`  ✓ Removed GemiNitro from Kimi Code config`));
    }
  } catch {}
};

const uninstallLaunchd = () => {
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "ai.geminitro.plist");
  const logDir = path.join(os.homedir(), ".config", "geminitro", "logs");
  let unloaded = false;
  try {
    require("child_process").execSync(`launchctl unload "${plistPath}" 2>/dev/null`, {
      stdio: "ignore",
    });
    unloaded = true;
  } catch {}
  if (fs.existsSync(plistPath)) fs.rmSync(plistPath);
  if (fs.existsSync(logDir)) fs.rmSync(logDir, { recursive: true, force: true });
  return {
    ok: true,
    msg: unloaded ? "launchd service stopped and removed" : "launchd plist removed",
  };
};

const uninstallSystemd = () => {
  const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "geminitro.service");
  try {
    const { execSync } = require("child_process");
    execSync("systemctl --user stop geminitro 2>/dev/null", { stdio: "ignore" });
    execSync("systemctl --user disable geminitro 2>/dev/null", { stdio: "ignore" });
  } catch {}
  if (fs.existsSync(servicePath)) fs.rmSync(servicePath);
  try {
    require("child_process").execSync("systemctl --user daemon-reload", { stdio: "ignore" });
  } catch {}
  return { ok: true, msg: "systemd service stopped and removed" };
};

const detectInstalledLocations = () => {
  const candidates = [OPENCODE_GLOBAL_CONFIG, path.join(process.cwd(), "opencode.json")];
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p) && readConfig(p)?.provider?.geminitro;
    } catch {
      return false;
    }
  });
};

const hasAnyAgentInstalled = (port) => {
  if (detectInstalledLocations().length > 0) return true;
  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(
      fs.readFileSync(path.join(os.homedir(), ".continue", "config.yaml"), "utf8"),
    );
    if (
      Array.isArray(doc?.models) &&
      doc.models.some((m) => String(m.apiBase || "").includes(`localhost:${port}`))
    )
      return true;
  } catch {}
  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(fs.readFileSync(path.join(os.homedir(), ".aider.conf.yml"), "utf8"));
    if (String(doc?.["openai-api-base"] || "").includes(`localhost:${port}`)) return true;
  } catch {}
  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.openai?.base_url || "").includes(`localhost:${port}`)) return true;
  } catch {}
  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".opencrabs", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${port}`)) return true;
  } catch {}
  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".kimi", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.geminitro?.base_url ?? "").includes(`localhost:${port}`))
      return true;
  } catch {}
  return false;
};

const AGENT_CONFIGS = {
  opencode: {
    name: "OpenCode",
    paths: [OPENCODE_GLOBAL_CONFIG, () => path.join(process.cwd(), "opencode.json")],
  },
  continue: {
    name: "Continue.dev",
    paths: [() => path.join(os.homedir(), ".continue", "config.yaml")],
  },
  aider: {
    name: "Aider",
    paths: [() => path.join(os.homedir(), ".aider.conf.yml")],
  },
  codex: {
    name: "Codex CLI",
    paths: [() => path.join(os.homedir(), ".codex", "config.toml")],
  },
  opencrabs: {
    name: "OpenCrabs",
    paths: [() => path.join(os.homedir(), ".opencrabs", "config.toml")],
  },
  "kimi-code": {
    name: "Kimi Code",
    paths: [() => path.join(os.homedir(), ".kimi", "config.toml")],
  },
};

const detectAvailableAgents = () => {
  const detected = [];
  for (const [id, info] of Object.entries(AGENT_CONFIGS)) {
    for (const p of info.paths) {
      const resolved = typeof p === "function" ? p() : p;
      if (fs.existsSync(resolved)) {
        detected.push({ id, name: info.name });
        break;
      }
    }
  }
  return detected;
};

const run = async (agent = "opencode") => {
  const chalk = require("chalk");
  const { select } = require("@inquirer/prompts");
  const { PORT, PROXY_API_KEY } = require("../../config");

  console.log(chalk.bold("\n  GemiNitro — Coding Agent Integration Setup\n"));

  console.log(chalk.gray(`  Checking for running server on :${PORT}...`));
  const liveModels = await fetchLiveModels(PORT, PROXY_API_KEY);
  const cachedModels = readCachedModels();
  const models = liveModels ?? cachedModels ?? FALLBACK_MODELS;

  if (liveModels) {
    console.log(chalk.green(`  ✓ Server detected — using ${models.length} live models`));
  } else if (cachedModels) {
    console.log(chalk.yellow(`  ⚠ Server not running — using ${models.length} cached models`));
    console.log(chalk.gray("    Start with `geminitro start` to refresh model list\n"));
  } else {
    console.log(
      chalk.yellow(`  ⚠ Server not running — using ${models.length} built-in model definitions`),
    );
    console.log(chalk.gray("    Start with `geminitro start` for a live model list\n"));
  }

  const agentLabel =
    {
      opencode: "OpenCode",
      continue: "Continue.dev",
      aider: "Aider",
      codex: "Codex CLI",
      opencrabs: "OpenCrabs",
      "kimi-code": "Kimi Code",
    }[agent] ?? agent;
  console.log(chalk.bold(`\n  Installing for ${agentLabel}...\n`));

  if (agent === "opencode") await installOpenCode(models, PORT, PROXY_API_KEY, chalk, select);
  else if (agent === "continue") await installContinue(models, PORT, PROXY_API_KEY, chalk);
  else if (agent === "aider") await installAider(models, PORT, PROXY_API_KEY, chalk);
  else if (agent === "codex") await installCodex(models, PORT, PROXY_API_KEY, chalk);
  else if (agent === "opencrabs") await installOpenCrabs(models, PORT, PROXY_API_KEY, chalk);
  else if (agent === "kimi-code") await installKimiCode(models, PORT, PROXY_API_KEY, chalk);

  const autoStart = await select({
    message: "\n  Auto-start GemiNitro on login?",
    choices: [
      { name: "No — I will run `geminitro start` manually", value: "none" },
      { name: "macOS — Install launchd service (recommended for Mac)", value: "launchd" },
      { name: "Linux — Install systemd user service", value: "systemd" },
    ],
  });

  if (autoStart !== "none") {
    const execPath = process.execPath;
    const scriptPath = require.resolve("../../bin/geminitro.js");
    const result =
      autoStart === "launchd"
        ? installLaunchd(execPath, scriptPath)
        : installSystemd(execPath, scriptPath);
    console.log(chalk[result.ok ? "green" : "yellow"](`\n  ✓ ${result.msg}`));
  }

  const autoUpdate = await select({
    message: "\n  Enable auto-update? (checks for new releases on start)",
    choices: [
      { name: "No — I will run `geminitro update` manually", value: false },
      { name: "Yes — apply updates automatically on startup", value: true },
    ],
  });
  writeEnvValue("AUTO_UPDATE", autoUpdate ? "true" : "false");
  console.log(chalk.green(`  ✓ AUTO_UPDATE=${autoUpdate ? "true" : "false"} saved to .env`));

  console.log(chalk.bold(chalk.green(`\n  ✓ GemiNitro registered in ${agentLabel}\n`)));
};

const runInteractive = async () => {
  const chalk = require("chalk");
  const { select, checkbox } = require("@inquirer/prompts");
  const { PORT, PROXY_API_KEY } = require("../../config");

  console.log(chalk.bold("\n  GemiNitro — Coding Agent Integration Setup\n"));

  // Detect available agents
  const availableAgents = detectAvailableAgents();

  if (availableAgents.length === 0) {
    console.log(chalk.yellow("  No coding agents detected on this system."));
    console.log(chalk.gray("  Install a coding agent first, then run `geminitro install`.\n"));
    return;
  }

  console.log(chalk.gray(`  Detected ${availableAgents.length} coding agent(s):`));
  for (const a of availableAgents) {
    console.log(chalk.white(`    • ${a.name}`));
  }
  console.log();

  // Get models
  console.log(chalk.gray(`  Checking for running server on :${PORT}...`));
  const liveModels = await fetchLiveModels(PORT, PROXY_API_KEY);
  const cachedModels = readCachedModels();
  const models = liveModels ?? cachedModels ?? FALLBACK_MODELS;

  if (liveModels) {
    console.log(chalk.green(`  ✓ Server detected — using ${models.length} live models`));
  } else if (cachedModels) {
    console.log(chalk.yellow(`  ⚠ Server not running — using ${models.length} cached models`));
  } else {
    console.log(chalk.yellow(`  ⚠ Server not running — using ${models.length} built-in models`));
  }

  // Multi-select for agents
  const selectedAgents = await checkbox({
    message: "Select which coding agents to configure:",
    choices: availableAgents.map((a) => ({
      name: a.name,
      value: a.id,
      checked: true,
    })),
  });

  if (selectedAgents.length === 0) {
    console.log(chalk.yellow("\n  No agents selected.\n"));
    return;
  }

  // Install to each selected agent
  for (const agentId of selectedAgents) {
    const agentLabel = AGENT_CONFIGS[agentId]?.name ?? agentId;
    console.log(chalk.bold(`\n  Installing for ${agentLabel}...\n`));

    if (agentId === "opencode") await installOpenCode(models, PORT, PROXY_API_KEY, chalk, select);
    else if (agentId === "continue") await installContinue(models, PORT, PROXY_API_KEY, chalk);
    else if (agentId === "aider") await installAider(models, PORT, PROXY_API_KEY, chalk);
    else if (agentId === "codex") await installCodex(models, PORT, PROXY_API_KEY, chalk);
    else if (agentId === "opencrabs") await installOpenCrabs(models, PORT, PROXY_API_KEY, chalk);
    else if (agentId === "kimi-code") await installKimiCode(models, PORT, PROXY_API_KEY, chalk);
  }

  // Auto-start prompt (only once)
  const autoStart = await select({
    message: "\n  Auto-start GemiNitro on login?",
    choices: [
      { name: "No — I will run `geminitro start` manually", value: "none" },
      { name: "macOS — Install launchd service (recommended for Mac)", value: "launchd" },
      { name: "Linux — Install systemd user service", value: "systemd" },
    ],
  });

  if (autoStart !== "none") {
    const execPath = process.execPath;
    const scriptPath = require.resolve("../../bin/geminitro.js");
    const result =
      autoStart === "launchd"
        ? installLaunchd(execPath, scriptPath)
        : installSystemd(execPath, scriptPath);
    console.log(chalk[result.ok ? "green" : "yellow"](`\n  ✓ ${result.msg}`));
  }

  // Auto-update prompt
  const autoUpdate = await select({
    message: "\n  Enable auto-update? (checks for new releases on start)",
    choices: [
      { name: "No — I will run `geminitro update` manually", value: false },
      { name: "Yes — apply updates automatically on startup", value: true },
    ],
  });
  writeEnvValue("AUTO_UPDATE", autoUpdate ? "true" : "false");
  console.log(chalk.green(`  ✓ AUTO_UPDATE=${autoUpdate ? "true" : "false"} saved to .env`));

  console.log(
    chalk.bold(chalk.green(`\n  ✓ GemiNitro registered in ${selectedAgents.length} agent(s)\n`)),
  );
};

const runUninstall = async () => {
  const chalk = require("chalk");
  const { confirm } = require("@inquirer/prompts");
  const { PORT } = require("../../config");

  console.log(chalk.bold("\n  GemiNitro — Uninstall\n"));

  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "ai.geminitro.plist");
  const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "geminitro.service");
  const installedPaths = detectInstalledLocations();
  const hasService = fs.existsSync(plistPath) || fs.existsSync(servicePath);

  if (!hasAnyAgentInstalled(PORT) && !hasService) {
    console.log(chalk.yellow("  Nothing to remove — GemiNitro is not installed.\n"));
    process.exit(0);
  }

  if (installedPaths.length > 0) {
    console.log(chalk.gray("  Found GemiNitro registered in:"));
    for (const p of installedPaths) console.log(chalk.gray(`    • ${p}`));
  }

  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(
      fs.readFileSync(path.join(os.homedir(), ".continue", "config.yaml"), "utf8"),
    );
    if (
      Array.isArray(doc?.models) &&
      doc.models.some((m) => String(m.apiBase || "").includes(`localhost:${PORT}`))
    )
      console.log(
        chalk.gray(`    • ${path.join(os.homedir(), ".continue", "config.yaml")}  (Continue.dev)`),
      );
  } catch {}

  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(fs.readFileSync(path.join(os.homedir(), ".aider.conf.yml"), "utf8"));
    if (String(doc?.["openai-api-base"] || "").includes(`localhost:${PORT}`))
      console.log(chalk.gray(`    • ${path.join(os.homedir(), ".aider.conf.yml")}  (Aider)`));
  } catch {}

  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.openai?.base_url || "").includes(`localhost:${PORT}`))
      console.log(
        chalk.gray(`    • ${path.join(os.homedir(), ".codex", "config.toml")}  (Codex CLI)`),
      );
  } catch {}
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
  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".kimi", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.geminitro?.base_url ?? "").includes(`localhost:${PORT}`))
      console.log(
        chalk.gray(`    • ${path.join(os.homedir(), ".kimi", "config.toml")}  (Kimi Code)`),
      );
  } catch {}

  if (hasService) {
    if (fs.existsSync(plistPath)) console.log(chalk.gray("    • launchd service (macOS)"));
    if (fs.existsSync(servicePath)) console.log(chalk.gray("    • systemd service (Linux)"));
  }
  console.log();

  const confirmed = await confirm({ message: "Remove all of the above?", default: true });
  if (!confirmed) {
    console.log(chalk.red("\n  Aborted.\n"));
    process.exit(0);
  }

  for (const targetPath of installedPaths) {
    const existing = readConfig(targetPath);
    delete existing.provider.geminitro;
    if (existing.provider && Object.keys(existing.provider).length === 0) delete existing.provider;
    fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(chalk.green(`  ✓ Removed from ${targetPath}`));
  }

  uninstallContinue(PORT, chalk);
  uninstallAider(PORT, chalk);
  uninstallCodex(PORT, chalk);
  uninstallOpenCrabs(PORT, chalk);
  uninstallKimiCode(PORT, chalk);

  if (fs.existsSync(plistPath)) console.log(chalk.green(`  ✓ ${uninstallLaunchd().msg}`));
  if (fs.existsSync(servicePath)) console.log(chalk.green(`  ✓ ${uninstallSystemd().msg}`));

  console.log(chalk.bold(chalk.green("\n  ✓ GemiNitro uninstalled")));
  console.log(chalk.gray("  Your keys and data in .geminitro/ are preserved\n"));
};

/**
 * Update agent config with new models after key addition.
 * Called when first key is added to sync live models to agent config.
 * @param {string[]} models - Array of model IDs from Google API
 */
const updateAgentConfig = (models) => {
  if (!models || models.length === 0) return;

  const { PORT } = require("../../config");

  // Update OpenCode configs (global and local)
  for (const targetPath of detectInstalledLocations()) {
    try {
      const existing = readConfig(targetPath);
      if (existing?.provider?.geminitro) {
        const modelEntries = {};
        for (const id of models) {
          modelEntries[id] = {
            name: `${id} (GemiNitro)`,
            limit: { context: 1048576, output: 65536 },
            modalities: { input: ["text", "image"], output: ["text"] },
          };
        }
        existing.provider.geminitro.models = modelEntries;
        fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + "\n");
      }
    } catch {}
  }

  // Update Continue.dev config
  try {
    const yaml = require("js-yaml");
    const configPath = path.join(os.homedir(), ".continue", "config.yaml");
    if (fs.existsSync(configPath)) {
      const doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
      if (Array.isArray(doc.models)) {
        const geminitroModels = doc.models.filter((m) =>
          String(m.apiBase || "").includes(`localhost:${PORT}`),
        );
        if (geminitroModels.length > 0) {
          geminitroModels[0].model = models[0] ?? "gemini-2.0-flash";
          geminitroModels[0].name = `GemiNitro / ${models[0] ?? "gemini-2.0-flash"}`;
          fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
        }
      }
    }
  } catch {}

  // Update Aider config
  try {
    const yaml = require("js-yaml");
    const configPath = path.join(os.homedir(), ".aider.conf.yml");
    if (fs.existsSync(configPath)) {
      const doc = yaml.load(fs.readFileSync(configPath, "utf8")) || {};
      if (String(doc["openai-api-base"] || "").includes(`localhost:${PORT}`)) {
        doc.model = models[0] ?? "gemini-2.0-flash";
        fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }));
      }
    }
  } catch {}

  // Update Codex CLI config
  try {
    const TOML = require("@iarna/toml");
    const configPath = path.join(os.homedir(), ".codex", "config.toml");
    if (fs.existsSync(configPath)) {
      const doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
      if (String(doc?.providers?.openai?.base_url || "").includes(`localhost:${PORT}`)) {
        doc.model = models[0] ?? "gemini-2.0-flash";
        fs.writeFileSync(configPath, TOML.stringify(doc));
      }
    }
  } catch {}

  // Update OpenCrabs config
  try {
    const TOML = require("@iarna/toml");
    const configPath = path.join(os.homedir(), ".opencrabs", "config.toml");
    if (fs.existsSync(configPath)) {
      const doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
      if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${PORT}`)) {
        doc.providers.custom.default_model = models[0] ?? "gemini-2.0-flash";
        fs.writeFileSync(configPath, TOML.stringify(doc));
      }
    }
  } catch {}

  // Update Kimi Code config
  try {
    const TOML = require("@iarna/toml");
    const configPath = path.join(os.homedir(), ".kimi", "config.toml");
    if (fs.existsSync(configPath)) {
      const doc = TOML.parse(fs.readFileSync(configPath, "utf8"));
      if (String(doc?.providers?.geminitro?.base_url ?? "").includes(`localhost:${PORT}`)) {
        if (doc.models?.geminitro) {
          doc.models.geminitro.model = models[0] ?? "gemini-2.0-flash";
        }
        fs.writeFileSync(configPath, TOML.stringify(doc));
      }
    }
  } catch {}
};

module.exports = {
  run,
  runInteractive,
  runUninstall,
  updateAgentConfig,
  detectAvailableAgents,
  installOpenCode,
  FALLBACK_MODELS,
};
