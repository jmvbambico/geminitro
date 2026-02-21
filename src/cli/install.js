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
    const health = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
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

const buildProviderBlock = (models, port, apiKey) => {
  const modelEntries = {};
  for (const id of models) {
    modelEntries[id] = {
      name: `${id} (GemiNitro)`,
      limit: { context: 1048576, output: 65536 },
      modalities: { input: ["text", "image"], output: ["text"] },
    };
  }
  return {
    npm: "@ai-sdk/openai-compatible",
    name: "GemiNitro",
    options: { baseURL: `http://localhost:${port}/v1`, apiKey },
    models: modelEntries,
  };
};

const readConfig = (filePath) => {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return {}; }
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
    return { ok: true, msg: `plist written to ${plistPath} — load with: launchctl load "${plistPath}"` };
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
    return { ok: true, msg: `service written to ${servicePath}\n  Run: systemctl --user daemon-reload && systemctl --user enable --now geminitro` };
  }
};

const clearInstallData = () => {
  const config = require("../../config");
  const empty = JSON.stringify({
    totalRequests: 0, totalSuccess: 0, totalErrors: 0,
    daily: {}, models: {}, keyUsage: {},
  }, null, 2);
  try { fs.writeFileSync(config.HISTORY_FILE, empty); } catch {}
  try { fs.writeFileSync(config.MODELS_FILE, JSON.stringify([], null, 2)); } catch {}
};

const run = async (agent = "opencode") => {
  const chalk = require("chalk");
  const { select, confirm } = require("@inquirer/prompts");
  const { PORT, PROXY_API_KEY } = require("../../config");

  console.log(chalk.bold("\n  GemiNitro — Coding Agent Integration Setup\n"));

  clearInstallData();

  const AGENT_CONFIGS = {
    opencode: {
      globalConfig: OPENCODE_GLOBAL_CONFIG,
      localConfig: path.join(process.cwd(), "opencode.json"),
      schema: "https://opencode.ai/config.json",
      label: "OpenCode",
    },
  };

  const agentConfig = AGENT_CONFIGS[agent] ?? AGENT_CONFIGS.opencode;

  const scope = await select({
    message: "Where should GemiNitro be registered?",
    choices: [
      { name: `Global  (${agentConfig.globalConfig})  — all projects`, value: "global" },
      { name: `Local   (./opencode.json)  — this project only`, value: "local" },
    ],
  });

  const targetPath = scope === "global" ? agentConfig.globalConfig : agentConfig.localConfig;

  console.log(chalk.gray(`\n  Checking for running server on :${PORT}...`));
  const liveModels = await fetchLiveModels(PORT, PROXY_API_KEY);
  const cachedModels = readCachedModels();
  const models = liveModels ?? cachedModels ?? FALLBACK_MODELS;

  if (liveModels) {
    console.log(chalk.green(`  ✓ Server detected — using ${models.length} live models`));
  } else if (cachedModels) {
    console.log(chalk.yellow(`  ⚠ Server not running — using ${models.length} cached models`));
    console.log(chalk.gray("    Start with `geminitro start` to refresh model list\n"));
  } else {
    console.log(chalk.yellow(`  ⚠ Server not running — using ${models.length} built-in model definitions`));
    console.log(chalk.gray("    Start with `geminitro start` for a live model list\n"));
  }

  const providerBlock = buildProviderBlock(models, PORT, PROXY_API_KEY);
  const existing = readConfig(targetPath);
  const merged = {
    $schema: agentConfig.schema,
    ...existing,
    provider: { ...(existing.provider || {}), geminitro: providerBlock },
  };

  console.log(chalk.bold("\n  Config preview:\n"));
  const preview = JSON.stringify({ provider: { geminitro: providerBlock } }, null, 2)
    .split("\n").slice(0, 12).map((l) => "  " + chalk.gray(l)).join("\n");
  console.log(preview);
  console.log(chalk.gray("  ...\n"));

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(chalk.green(`  ✓ Written to ${targetPath}`));

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
    const result = autoStart === "launchd"
      ? installLaunchd(execPath, scriptPath)
      : installSystemd(execPath, scriptPath);
    console.log(chalk[result.ok ? "green" : "yellow"](`\n  ✓ ${result.msg}`));
  }

  console.log(chalk.bold(chalk.green(`\n  ✓ GemiNitro registered as provider "geminitro" in ${agentConfig.label}`)));
  console.log(chalk.gray("  Select models with:  geminitro/<model-id>"));
  console.log(chalk.cyan("\n  Next: add at least one key →  geminitro key add <YOUR_GEMINI_KEY>\n"));
};

const uninstallLaunchd = () => {
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "ai.geminitro.plist");
  const logDir = path.join(os.homedir(), ".config", "geminitro", "logs");
  let unloaded = false;

  try {
    require("child_process").execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: "ignore" });
    unloaded = true;
  } catch {}

  if (fs.existsSync(plistPath)) {
    fs.rmSync(plistPath);
  }
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true, force: true });
  }

  return { ok: true, msg: unloaded ? "launchd service stopped and removed" : "launchd plist removed" };
};

const uninstallSystemd = () => {
  const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "geminitro.service");

  try {
    const { execSync } = require("child_process");
    execSync("systemctl --user stop geminitro 2>/dev/null", { stdio: "ignore" });
    execSync("systemctl --user disable geminitro 2>/dev/null", { stdio: "ignore" });
  } catch {}

  if (fs.existsSync(servicePath)) {
    fs.rmSync(servicePath);
  }

  try {
    require("child_process").execSync("systemctl --user daemon-reload", { stdio: "ignore" });
  } catch {}

  return { ok: true, msg: "systemd service stopped and removed" };
};

const detectInstalledLocations = () => {
  const candidates = [
    OPENCODE_GLOBAL_CONFIG,
    path.join(process.cwd(), "opencode.json"),
  ];
  return candidates.filter((p) => {
    try {
      return fs.existsSync(p) && readConfig(p)?.provider?.geminitro;
    } catch {
      return false;
    }
  });
};

const runUninstall = async () => {
  const chalk = require("chalk");
  const { confirm } = require("@inquirer/prompts");

  console.log(chalk.bold("\n  GemiNitro — Uninstall\n"));

  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", "ai.geminitro.plist");
  const servicePath = path.join(os.homedir(), ".config", "systemd", "user", "geminitro.service");
  const installedPaths = detectInstalledLocations();
  const hasService = fs.existsSync(plistPath) || fs.existsSync(servicePath);

  if (installedPaths.length === 0 && !hasService) {
    console.log(chalk.yellow("  Nothing to remove — GemiNitro is not installed.\n"));
    process.exit(0);
  }

  if (installedPaths.length > 0) {
    console.log(chalk.gray("  Found GemiNitro registered in:"));
    for (const p of installedPaths) console.log(chalk.gray(`    • ${p}`));
  }
  if (hasService) {
    if (fs.existsSync(plistPath)) console.log(chalk.gray("    • launchd service (macOS)"));
    if (fs.existsSync(servicePath)) console.log(chalk.gray("    • systemd service (Linux)"));
  }
  console.log();

  const confirmed = await confirm({ message: "Remove all of the above?", default: true });
  if (!confirmed) { console.log(chalk.red("\n  Aborted.\n")); process.exit(0); }

  let removed = false;
  for (const targetPath of installedPaths) {
    const existing = readConfig(targetPath);
    delete existing.provider.geminitro;
    if (existing.provider && Object.keys(existing.provider).length === 0) {
      delete existing.provider;
    }
    fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + "\n");
    console.log(chalk.green(`  ✓ Removed from ${targetPath}`));
    removed = true;
  }

  if (fs.existsSync(plistPath)) {
    const result = uninstallLaunchd();
    console.log(chalk.green(`  ✓ ${result.msg}`));
  }
  if (fs.existsSync(servicePath)) {
    const result = uninstallSystemd();
    console.log(chalk.green(`  ✓ ${result.msg}`));
  }

  if (removed) {
    console.log(chalk.bold(chalk.green("\n  ✓ GemiNitro uninstalled")));
    console.log(chalk.gray("  Your keys and data in .geminitro/ are preserved\n"));
  } else if (hasService) {
    console.log(chalk.bold(chalk.green("\n  ✓ Auto-start services removed\n")));
  }
};

module.exports = { run, runUninstall };
