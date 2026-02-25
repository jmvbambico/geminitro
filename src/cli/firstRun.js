"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENCODE_GLOBAL_CONFIG = path.join(os.homedir(), ".config", "opencode", "opencode.json");
const OPENCODE_LOCAL_CONFIG = path.join(process.cwd(), "opencode.json");

const isProviderRegistered = () => {
  const { PORT } = require("../../config");

  for (const p of [OPENCODE_GLOBAL_CONFIG, OPENCODE_LOCAL_CONFIG]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg?.provider?.geminitro) return true;
    } catch {}
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
      return true;
  } catch {}

  try {
    const yaml = require("js-yaml");
    const doc = yaml.load(fs.readFileSync(path.join(os.homedir(), ".aider.conf.yml"), "utf8"));
    if (String(doc?.["openai-api-base"] || "").includes(`localhost:${PORT}`)) return true;
  } catch {}

  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".codex", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.openai?.base_url || "").includes(`localhost:${PORT}`)) return true;
  } catch {}

  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".opencrabs", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.custom?.base_url ?? "").includes(`localhost:${PORT}`)) return true;
  } catch {}

  try {
    const TOML = require("@iarna/toml");
    const doc = TOML.parse(
      fs.readFileSync(path.join(os.homedir(), ".kimi", "config.toml"), "utf8"),
    );
    if (String(doc?.providers?.geminitro?.base_url ?? "").includes(`localhost:${PORT}`))
      return true;
  } catch {}

  return false;
};

const hasKeys = () => {
  const config = require("../../config");
  try {
    const raw = fs.readFileSync(path.join(config.DATA_DIR, "keys.json"), "utf8");
    const keys = raw.trim() ? JSON.parse(raw) : [];
    return Array.isArray(keys) && keys.length > 0;
  } catch {
    return false;
  }
};

const openBrowser = async (url) => {
  try {
    const open = require("open");
    await open(url);
  } catch {
    const { execSync } = require("child_process");
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      execSync(`${cmd} "${url}"`, { stdio: "ignore" });
    } catch {}
  }
};

const killByPort = (port) => {
  const { execSync } = require("child_process");
  try {
    const pids = execSync(`lsof -t -i :${port}`, { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid), "SIGTERM");
      } catch {}
    }
    return pids.length > 0;
  } catch {
    return false;
  }
};

const waitForPort = async (port, maxMs = 3000) => {
  const { execSync } = require("child_process");
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      execSync(`lsof -i :${port}`, { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      return true;
    }
  }
  return false;
};

const startServer = async (port) => {
  killByPort(port);
  const freed = await waitForPort(port);
  if (!freed) {
    const chalk = require("chalk");
    console.log(chalk.red(`\n  ✗ Could not free port :${port}\n`));
    process.exit(1);
  }
  require("../../server");
};

const run = async (options = {}) => {
  const chalk = require("chalk");
  const { select, input } = require("@inquirer/prompts");
  const config = require("../../config");
  const { version } = require("../../package.json");

  if (options.splash !== false) {
    require("./splash").printSplash(version, config.PORT);
  }

  const registered = isProviderRegistered();
  const hasApiKeys = hasKeys();

  if (!hasApiKeys) {
    console.log(chalk.yellow("\n  ⚠  No API keys configured.\n"));

    const method = await select({
      message: "Add your first Gemini API key via:",
      choices: [
        { name: "Terminal — enter key now", value: "terminal" },
        { name: "Browser — open dashboard setup wizard", value: "browser" },
        { name: "Skip — I'll add keys later", value: "skip" },
      ],
    });

    if (method === "terminal") {
      const keyType = await select({
        message: "What type of credentials do you want to add?",
        choices: [
          { name: "Gemini API Key (ai-studio.google.com)", value: "api_key" },
          { name: "Antigravity Account (OAuth)", value: "antigravity" },
          { name: "Gemini CLI Account (OAuth)", value: "gemini_cli" },
        ],
      });

      if (keyType === "antigravity") {
        const keyService = require("../../services/keyService");
        keyService.loadKeys();
        const existing = keyService.detectAntigravityAccounts();

        if (existing.length > 0) {
          const action = await select({
            message: `Found ${existing.length} existing Antigravity account(s). What would you like to do?`,
            choices: [
              { name: "Import existing accounts", value: "import" },
              { name: "Authenticate new account (OAuth)", value: "oauth" },
            ],
          });

          if (action === "import") {
            const result = await keyService.importAntigravityAccounts();
            if (result.imported > 0) {
              console.log(
                chalk.green(`\n  ✓ Imported ${result.imported} Antigravity account(s)\n`),
              );
            } else {
              console.log(chalk.yellow("  No new accounts to import\n"));
            }
          } else {
            await require("./keys").oauthAntigravity();
          }
        } else {
          console.log(chalk.gray("\n  No existing Antigravity accounts found."));
          const addNew = await select({
            message: "Would you like to authenticate a new account?",
            choices: [
              { name: "Yes, authenticate with Google (OAuth)", value: true },
              { name: "No, skip", value: false },
            ],
          });
          if (addNew) {
            await require("./keys").oauthAntigravity();
          }
        }
      } else if (keyType === "gemini_cli") {
        const keyService = require("../../services/keyService");
        keyService.loadKeys();
        const existing = keyService.detectGeminiCliAccounts();

        if (existing.length > 0) {
          const action = await select({
            message: `Found ${existing.length} existing Gemini CLI account(s). What would you like to do?`,
            choices: [
              { name: "Import existing accounts", value: "import" },
              { name: "Authenticate new account (OAuth)", value: "oauth" },
            ],
          });

          if (action === "import") {
            const result = await keyService.importGeminiCliAccounts();
            if (result.imported > 0) {
              console.log(chalk.green(`\n  ✓ Imported ${result.imported} Gemini CLI account(s)\n`));
            } else {
              console.log(chalk.yellow("  No new accounts to import\n"));
            }
          } else {
            await require("./keys").oauthGeminiCli();
          }
        } else {
          console.log(chalk.gray("\n  No existing Gemini CLI accounts found."));
          const addNew = await select({
            message: "Would you like to authenticate a new account?",
            choices: [
              { name: "Yes, authenticate with Google (OAuth)", value: true },
              { name: "No, skip", value: false },
            ],
          });
          if (addNew) {
            await require("./keys").oauthGeminiCli();
          }
        }
      } else {
        const apiKey = await input({ message: "Paste your Gemini API key:" });
        if (apiKey?.trim()) {
          await require("./keys").add(apiKey.trim());
        }
      }
    } else if (method === "browser") {
      await startServer(config.PORT);
      await new Promise((r) => setTimeout(r, 1000));
      const setupUrl = `http://localhost:${config.PORT}/dashboard/setup`;
      console.log(chalk.cyan(`\n  Opening setup wizard: ${setupUrl}\n`));
      await openBrowser(setupUrl);
      return;
    } else {
      await startServer(config.PORT);
      return;
    }
  }

  if (!registered) {
    console.log(
      chalk.yellow("\n  ⚠  GemiNitro is not yet registered to any known coding agents.\n"),
    );

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Install now (interactive)", value: "install" },
        { name: "Skip — just start the server", value: "skip" },
      ],
    });

    if (action === "install") {
      await require("./install").runInteractive();
    }
  }

  const choice = await select({
    message: "GemiNitro is ready. How do you want to proceed?",
    choices: [
      { name: "Open browser dashboard", value: "browser" },
      { name: "Stay in terminal", value: "terminal" },
    ],
  });

  await startServer(config.PORT);

  if (choice === "browser") {
    await new Promise((r) => setTimeout(r, 1000));
    const dashUrl = `http://localhost:${config.PORT}/dashboard`;
    console.log(chalk.cyan(`\n  Opening dashboard: ${dashUrl}\n`));
    await openBrowser(dashUrl);
  }
};

module.exports = { run };
