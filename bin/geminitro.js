#!/usr/bin/env node
"use strict";

const { program } = require("commander");
const { version } = require("../package.json");
const { spawn } = require("child_process");
const path = require("path");

program
  .name("geminitro")
  .description("Gemini API proxy with key rotation — OpenCode plugin")
  .version(version);

program
  .command("start")
  .description("Start the GemiNitro proxy server")
  .option("--no-splash", "Skip the splash screen")
  .option("--no-interactive", "Skip first-run prompts, start immediately")
  .option("-p, --port <port>", "Override port (also set via PORT env var)")
  .action(async (options) => {
    if (options.port) process.env.PORT = options.port;
    if (options.interactive === false) {
      const config = require("../config");
      if (options.splash !== false) require("../src/cli/splash").printSplash(version, config.PORT);
      require("../server");
    } else {
      await require("../src/cli/firstRun").run(options);
    }
  });

program
  .command("stop")
  .description("Stop the running GemiNitro server")
  .action(async () => {
    const chalk = require("chalk");
    const config = require("../config");
    const { execSync } = require("child_process");

    const killByPort = (port) => {
      try {
        const pids = execSync(`lsof -t -i :${port}`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
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

    try {
      const res = await fetch(`http://localhost:${config.PORT}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok && killByPort(config.PORT)) {
        console.log(chalk.green("\n  ✓ GemiNitro stopped\n"));
      } else {
        console.log(chalk.yellow("\n  ⚠ No process found on :" + config.PORT + "\n"));
      }
    } catch {
      console.log(chalk.yellow("\n  ⚠ GemiNitro is not running\n"));
    }
  });

program
  .command("restart")
  .description("Restart the GemiNitro server")
  .option("--no-splash", "Skip the splash screen")
  .option("-p, --port <port>", "Override port")
  .action(async (options) => {
    const chalk = require("chalk");
    const config = require("../config");
    const { execSync } = require("child_process");

    const port = options.port || config.PORT;

    const killByPort = (p) => {
      try {
        const pids = execSync(`lsof -t -i :${p}`, { encoding: "utf8" }).trim().split("\n").filter(Boolean);
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

    const waitForPort = async (p, maxMs = 3000) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        try {
          execSync(`lsof -i :${p}`, { stdio: "ignore" });
          await new Promise((r) => setTimeout(r, 100));
        } catch {
          return true;
        }
      }
      return false;
    };

    killByPort(port);
    const freed = await waitForPort(port);

    if (!freed) {
      console.log(chalk.red("\n  ✗ Could not free port :" + port + "\n"));
      process.exit(1);
    }

    console.log(chalk.gray("\n  Starting GemiNitro..."));

    const args = ["start"];
    if (options.splash === false) args.push("--no-splash");
    if (options.port) args.push("-p", options.port);

    const child = spawn(process.execPath, [path.join(__dirname, "geminitro.js"), ...args], {
      detached: true,
      stdio: "inherit",
      env: { ...process.env, ...(options.port ? { PORT: options.port } : {}) },
    });
    child.unref();
  });

program
  .command("install")
  .description("Register GemiNitro as an OpenCode provider (interactive)")
  .action(async () => {
    await require("../src/cli/install").run();
  });

program
  .command("uninstall")
  .description("Remove GemiNitro from OpenCode config (interactive)")
  .action(async () => {
    await require("../src/cli/install").runUninstall();
  });

program
  .command("stats")
  .description("Show live stats from the running server")
  .action(async () => {
    await require("../src/cli/stats").run();
  });

program
  .command("status")
  .description("Quick server health check")
  .action(async () => {
    const chalk = require("chalk");
    const config = require("../config");
    const fs = require("fs");
    const path = require("path");

    try {
      const res = await fetch(`http://localhost:${config.PORT}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      const data = await res.json();
      console.log(chalk.green(`\n  ✓ GemiNitro is running`));
      console.log(
        chalk.gray(`  v${data.version}`) +
        `  ·  uptime ${data.uptime}s` +
        `  ·  ${chalk.green(data.keys.active)}/${data.keys.total} keys active` +
        `  ·  ${data.models} models\n`
      );

      if (data.keys.cooldown > 0) {
        console.log(chalk.yellow(`  Keys on cooldown:`));
        for (const k of data.keys.cooldownKeys) {
          console.log(chalk.yellow(`    ...${k.tail}  →  ${k.remaining}s remaining`));
        }
        console.log(chalk.gray(`  Next key available in ${data.keys.minCooldown}s\n`));
      }
    } catch {
      console.log(chalk.red(`\n  ✗ GemiNitro is not running on :${config.PORT}`));
      console.log(chalk.gray("  Start with: geminitro start"));

      try {
        const modelsFile = path.join(config.DATA_DIR, "models.json");
        if (fs.existsSync(modelsFile)) {
          const models = JSON.parse(fs.readFileSync(modelsFile, "utf8"));
          if (Array.isArray(models) && models.length > 0) {
            console.log(chalk.gray(`\n  Cached models (${models.length}):`));
            const displayModels = models.slice(0, 6);
            for (const m of displayModels) {
              console.log(chalk.white(`    • ${m}`));
            }
            if (models.length > 6) {
              console.log(chalk.gray(`    ... and ${models.length - 6} more`));
            }
          }
        }
      } catch {}
      console.log("");
    }
  });

const keyCmd = program.command("key").description("Manage Gemini API keys");

keyCmd
  .command("add <apiKey>")
  .description("Add a Gemini API key to the pool")
  .action(async (apiKey) => {
    await require("../src/cli/keys").add(apiKey);
  });

keyCmd
  .command("remove <fragment>")
  .description("Remove a key by its last 6+ characters")
  .action(async (fragment) => {
    await require("../src/cli/keys").remove(fragment);
  });

keyCmd
  .command("list")
  .description("List all keys in the pool with status")
  .action(async () => {
    await require("../src/cli/keys").list();
  });

program.parse(process.argv);
