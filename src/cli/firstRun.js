"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENCODE_GLOBAL_CONFIG = path.join(os.homedir(), ".config", "opencode", "opencode.json");
const OPENCODE_LOCAL_CONFIG = path.join(process.cwd(), "opencode.json");

const isProviderRegistered = () => {
  for (const p of [OPENCODE_GLOBAL_CONFIG, OPENCODE_LOCAL_CONFIG]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg?.provider?.geminitro) return true;
    } catch {}
  }
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
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try { execSync(`${cmd} "${url}"`, { stdio: "ignore" }); } catch {}
  }
};

const startServer = (options = {}) => {
  if (options.splash !== false) {
    const { version } = require("../../package.json");
    const config = require("../../config");
    require("./splash").printSplash(version, config.PORT);
  }
  require("../../server");
};

const run = async (options = {}) => {
  const chalk = require("chalk");
  const { select, input } = require("@inquirer/prompts");
  const config = require("../../config");

  const registered = isProviderRegistered();
  const hasApiKeys = hasKeys();

  if (!registered) {
    console.log(chalk.yellow("\n  ⚠  GemiNitro is not yet registered to any known coding agents.\n"));

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Install now (interactive)", value: "install" },
        { name: "Skip — just start the server", value: "skip" },
      ],
    });

    if (action === "install") {
      const agent = await select({
        message: "Which coding agent should GemiNitro be registered to?",
        choices: [
          { name: "OpenCode", value: "opencode" },
        ],
      });
      await require("./install").run(agent);
    }
  }

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
      const apiKey = await input({ message: "Paste your Gemini API key:" });
      if (apiKey?.trim()) {
        await require("./keys").add(apiKey.trim());
      }
      startServer(options);
    } else if (method === "browser") {
      startServer(options);
      await new Promise(r => setTimeout(r, 1000));
      const setupUrl = `http://localhost:${config.PORT}/dashboard/setup`;
      console.log(chalk.cyan(`\n  Opening setup wizard: ${setupUrl}\n`));
      await openBrowser(setupUrl);
    } else {
      startServer(options);
    }
    return;
  }

  const choice = await select({
    message: "GemiNitro is ready. How do you want to proceed?",
    choices: [
      { name: "Open browser dashboard", value: "browser" },
      { name: "Stay in terminal", value: "terminal" },
    ],
  });

  startServer(options);

  if (choice === "browser") {
    await new Promise(r => setTimeout(r, 1000));
    const dashUrl = `http://localhost:${config.PORT}/dashboard`;
    console.log(chalk.cyan(`\n  Opening dashboard: ${dashUrl}\n`));
    await openBrowser(dashUrl);
  }
};

module.exports = { run };
