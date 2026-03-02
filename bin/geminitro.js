#!/usr/bin/env node
"use strict";

const { program } = require("commander");
const { version } = require("../package.json");
const { spawn } = require("child_process");
const path = require("path");

program
  .name("geminitro")
  .description("Gemini API proxy with key rotation — multi-agent coding proxy")
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
      const { execSync } = require("child_process");

      // Kill any existing process on the port
      const killByPort = (port) => {
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

      killByPort(config.PORT);
      const freed = await waitForPort(config.PORT);
      if (!freed) {
        const chalk = require("chalk");
        console.log(chalk.red(`\n  ✗ Could not free port :${config.PORT}\n`));
        process.exit(1);
      }

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
        const pids = execSync(`lsof -t -i :${p}`, { encoding: "utf8" })
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
  .description("Register GemiNitro with a coding agent (interactive)")
  .action(async () => {
    await require("../src/cli/install").run();
  });

program
  .command("uninstall")
  .description("Remove GemiNitro from all detected agent configs (interactive)")
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
          `  ·  ${data.models} models\n`,
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

program
  .command("update")
  .description("Check for and apply the latest GemiNitro release")
  .action(async () => {
    const chalk = require("chalk");
    const { checkForUpdate, applyUpdate } = require("../services/updateService");

    console.log(chalk.gray("\n  Checking for updates..."));
    const result = await checkForUpdate();

    if (!result.available) {
      console.log(chalk.green(`\n  ✓ Already up to date (v${result.current})\n`));
      return;
    }

    console.log(
      chalk.yellow(`\n  Update available: ${result.latest}  (current: v${result.current})`),
    );
    console.log(chalk.gray(`  ${result.url}\n`));

    const { confirm } = require("@inquirer/prompts");
    const go = await confirm({ message: `Apply update to ${result.latest}?`, default: true });
    if (!go) {
      console.log(chalk.red("  Aborted.\n"));
      return;
    }

    console.log(chalk.gray("  Pulling latest changes and installing dependencies..."));
    const applied = applyUpdate();
    if (applied.ok) {
      console.log(chalk.green(`\n  ✓ Updated to ${result.latest}. Restart GemiNitro to apply.\n`));
    } else {
      console.log(chalk.red(`\n  ✗ Update failed: ${applied.error}\n`));
      process.exit(1);
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

keyCmd
  .command("import-antigravity")
  .description("Import Antigravity accounts from OpenCode (if available)")
  .action(async () => {
    await require("../src/cli/keys").importAntigravity();
  });

keyCmd
  .command("oauth-antigravity")
  .description("Authenticate with Google via OAuth for Antigravity (opens browser)")
  .action(async () => {
    await require("../src/cli/keys").oauthAntigravity();
  });

keyCmd
  .command("oauth-gemini-cli")
  .description("Authenticate with Google via OAuth for Gemini CLI (opens browser)")
  .action(async () => {
    await require("../src/cli/keys").oauthGeminiCli();
  });

keyCmd
  .command("import-gemini-cli")
  .description("Import Gemini CLI accounts from ~/.gemini (if available)")
  .action(async () => {
    await require("../src/cli/keys").importGeminiCli();
  });

const aliasCmd = program.command("alias").description("Manage model aliases");

aliasCmd
  .command("add <alias> <target>")
  .description("Add a model alias (e.g., gemini-3-pro-preview → gemini-3-pro-high)")
  .action(async (alias, target) => {
    const chalk = require("chalk");
    const aliasService = require("../services/aliasService");

    try {
      await aliasService.addAlias(alias, target);
      console.log(chalk.green(`\n  ✓ Added alias: ${alias} → ${target}\n`));
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to add alias: ${error.message}\n`));
      process.exit(1);
    }
  });

aliasCmd
  .command("remove <alias>")
  .description("Remove a model alias")
  .action(async (alias) => {
    const chalk = require("chalk");
    const aliasService = require("../services/aliasService");

    try {
      const removed = await aliasService.removeAlias(alias);
      if (removed) {
        console.log(chalk.green(`\n  ✓ Removed alias: ${alias}\n`));
      } else {
        console.log(chalk.yellow(`\n  ⚠ Alias not found: ${alias}\n`));
      }
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to remove alias: ${error.message}\n`));
      process.exit(1);
    }
  });

aliasCmd
  .command("list")
  .description("List all model aliases")
  .action(() => {
    const chalk = require("chalk");
    const aliasService = require("../services/aliasService");

    try {
      const aliases = aliasService.listAliases();
      const entries = Object.entries(aliases);

      if (entries.length === 0) {
        console.log(chalk.gray("\n  No aliases defined\n"));
        return;
      }

      console.log(chalk.bold("\n  Model Aliases:\n"));
      for (const [alias, target] of entries) {
        console.log(`    ${chalk.cyan(alias)} → ${chalk.green(target)}`);
      }
      console.log("");
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to list aliases: ${error.message}\n`));
      process.exit(1);
    }
  });

const quotaCmd = program.command("quota-group").description("Manage quota groups");

quotaCmd
  .command("add <name> <models...>")
  .description("Add or update a quota group (models that share quota limits)")
  .action(async (name, models) => {
    const chalk = require("chalk");
    const quotaGroupService = require("../services/quotaGroupService");

    try {
      await quotaGroupService.addQuotaGroup(name, models);
      console.log(chalk.green(`\n  ✓ Added quota group '${name}' with ${models.length} models\n`));
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to add quota group: ${error.message}\n`));
      process.exit(1);
    }
  });

quotaCmd
  .command("remove <name>")
  .description("Remove a quota group")
  .action(async (name) => {
    const chalk = require("chalk");
    const quotaGroupService = require("../services/quotaGroupService");

    try {
      const removed = await quotaGroupService.removeQuotaGroup(name);
      if (removed) {
        console.log(chalk.green(`\n  ✓ Removed quota group: ${name}\n`));
      } else {
        console.log(chalk.yellow(`\n  ⚠ Quota group not found: ${name}\n`));
      }
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to remove quota group: ${error.message}\n`));
      process.exit(1);
    }
  });

quotaCmd
  .command("list")
  .description("List all quota groups")
  .action(() => {
    const chalk = require("chalk");
    const quotaGroupService = require("../services/quotaGroupService");

    try {
      const groups = quotaGroupService.getQuotaGroups();
      const entries = Object.entries(groups);

      if (entries.length === 0) {
        console.log(chalk.gray("\n  No quota groups defined\n"));
        return;
      }

      console.log(chalk.bold("\n  Quota Groups:\n"));
      for (const [name, models] of entries) {
        console.log(`    ${chalk.cyan(name)}: ${chalk.gray(models.join(", "))}`);
      }
      console.log("");
    } catch (error) {
      console.log(chalk.red(`\n  ✗ Failed to list quota groups: ${error.message}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
