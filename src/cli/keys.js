"use strict";
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

const request = async (urlPath, options = {}) => {
  const { PORT, PROXY_API_KEY } = require("../../config");
  return fetch(`http://localhost:${PORT}${urlPath}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PROXY_API_KEY}`,
      ...(options.headers || {}),
    },
  });
};

const validateKeyDirect = async (key) => {
  const { GEMINI_API_BASE_URL } = require("../../config");
  try {
    const response = await fetch(`${GEMINI_API_BASE_URL}?key=${key}`);
    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: data.error?.message || "Invalid API key" };
    }

    if (data.error) {
      return { valid: false, error: data.error.message || "Unknown error" };
    }

    if (data.models) {
      const models = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      models.sort((a, _b) => (a.includes("pro") ? -1 : 1));
      return { valid: true, models };
    }

    return { valid: true, models: [] };
  } catch (e) {
    return { valid: false, error: `Network error: ${e.message}` };
  }
};

const addKeyDirect = (key, models) => {
  const config = require("../../config");
  const dataDir = config.DATA_DIR;
  const keyFile = config.KEY_FILE;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let keys = [];
  if (fs.existsSync(keyFile)) {
    try {
      keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    } catch {
      keys = [];
    }
  }

  if (keys.includes(key)) {
    return { success: false, error: "Key already exists" };
  }

  keys.push(key);
  fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));

  if (models && models.length > 0) {
    const modelsFile = path.join(dataDir, "models.json");
    fs.writeFileSync(modelsFile, JSON.stringify(models, null, 2));
  }

  return { success: true };
};

const add = async (key, options = {}) => {
  const { oauth = false } = options;

  if (!key && !oauth) {
    console.error(chalk.red("\n  Usage: geminitro key add <API_KEY>\n"));
    process.exit(1);
  }

  if (oauth) {
    // OAuth flow - would trigger browser-based auth
    console.log(chalk.yellow("\n  ⚠ OAuth authentication requires browser-based flow"));
    console.log(chalk.gray("  Use the dashboard or run 'geminitro start' for interactive setup\n"));
    return;
  }

  let res;
  try {
    res = await request("/api/keys", {
      method: "POST",
      body: JSON.stringify({ key, validate: true }),
    });
  } catch {
    console.log(chalk.gray("\n  Server not running — validating key directly..."));

    const result = await validateKeyDirect(key);
    if (!result.valid) {
      console.error(chalk.red(`\n  ✗ ${result.error}\n`));
      process.exit(1);
    }

    const directResult = addKeyDirect(key, result.models);
    if (!directResult.success) {
      console.error(chalk.red(`\n  ✗ ${directResult.error}\n`));
      process.exit(1);
    }

    console.log(chalk.green(`\n  ✓ Key added: ...${key.slice(-6)}`));
    if (result.models && result.models.length > 0) {
      console.log(chalk.gray(`\n  Available models (${result.models.length}):`));
      const displayModels = result.models.slice(0, 8);
      for (const m of displayModels) {
        console.log(chalk.white(`    • ${m}`));
      }
      if (result.models.length > 8) {
        console.log(chalk.gray(`    ... and ${result.models.length - 8} more`));
      }
    }
    console.log("");
    return;
  }

  if (res.ok) {
    const data = await res.json().catch(() => ({}));
    console.log(chalk.green(`\n  ✓ Key added: ...${key.slice(-6)}`));
    if (data.models && data.models.length > 0) {
      console.log(chalk.gray(`\n  Available models (${data.models.length}):`));
      const displayModels = data.models.slice(0, 8);
      for (const m of displayModels) {
        console.log(chalk.white(`    • ${m}`));
      }
      if (data.models.length > 8) {
        console.log(chalk.gray(`    ... and ${data.models.length - 8} more`));
      }
    }
    console.log("");
  } else {
    const e = await res.json().catch(() => ({}));
    console.error(chalk.red(`\n  ✗ ${e.error || "Failed to add key"}\n`));
    process.exit(1);
  }
};

const readKeysDirect = () => {
  const config = require("../../config");
  const keyFile = config.KEY_FILE;

  if (!fs.existsSync(keyFile)) {
    return [];
  }

  try {
    return JSON.parse(fs.readFileSync(keyFile, "utf8"));
  } catch {
    return [];
  }
};

const remove = async (fragment) => {
  if (!fragment) {
    console.error(chalk.red("\n  Usage: geminitro key remove <last-6-chars>\n"));
    process.exit(1);
  }

  let res;
  try {
    res = await request(`/api/keys/${fragment}`, { method: "DELETE" });
  } catch {
    const config = require("../../config");
    const keyFile = config.KEY_FILE;

    if (!fs.existsSync(keyFile)) {
      console.error(chalk.red("\n  ✗ No keys configured\n"));
      process.exit(1);
    }

    let keys = [];
    try {
      keys = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    } catch {}

    const idx = keys.findIndex((k) => k.endsWith(fragment));
    if (idx === -1) {
      console.error(chalk.red("\n  ✗ Key not found\n"));
      process.exit(1);
    }

    keys.splice(idx, 1);
    fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
    console.log(chalk.green("\n  ✓ Key removed\n"));
    return;
  }

  if (res.ok) {
    console.log(chalk.green("\n  ✓ Key removed\n"));
  } else {
    console.error(chalk.red("\n  ✗ Key not found\n"));
    process.exit(1);
  }
};

const list = async () => {
  const config = require("../../config");
  const COOLDOWN_TIME = config.KEY_COOLDOWN_TIME || 60000;

  let res;
  try {
    res = await request("/api/keys");
  } catch {
    const keys = readKeysDirect();
    if (keys.length === 0) {
      console.log(
        chalk.yellow(
          "\n  No keys configured.\n  Add one with: geminitro key add <YOUR_GEMINI_KEY>\n",
        ),
      );
      return;
    }

    console.log(chalk.bold("\n  Key Pool\n"));
    for (const k of keys) {
      const tail = typeof k === "string" ? `...${k.slice(-8)}` : `...${k.key?.slice(-8) ?? "???"}`;
      console.log(`  ${chalk.green("active  ")}  ${chalk.white(tail)}`);
    }
    console.log("");
    return;
  }

  const keys = await res.json();
  if (!Array.isArray(keys) || keys.length === 0) {
    console.log(
      chalk.yellow(
        "\n  No keys configured.\n  Add one with: geminitro key add <YOUR_GEMINI_KEY>\n",
      ),
    );
    return;
  }
  console.log(chalk.bold("\n  Key Pool\n"));
  const now = Date.now();
  for (const k of keys) {
    const tail = k.key ? `...${k.key.slice(-8)}` : "???";
    const typeLabel = k.type === "oauth" ? chalk.cyan("[OAuth]") : "";

    if (k.status === "active") {
      console.log(
        `  ${chalk.green("active  ")}  ${typeLabel}  ${chalk.white(tail)}  ${chalk.gray(`${k.usage ?? 0} req  ${k.errors ?? 0} err`)}`,
      );
      if (k.email) {
        console.log(chalk.gray(`    ${k.email}`));
      }
    } else {
      const remaining = Math.max(0, Math.ceil((COOLDOWN_TIME - (now - (k.lastUsed || 0))) / 1000));
      console.log(
        `  ${chalk.yellow("cooldown")}  ${typeLabel}  ${chalk.white(tail)}  ${chalk.gray(`${k.usage ?? 0} req  ${k.errors ?? 0} err`)}  ${chalk.yellow(`${remaining}s`)}`,
      );
    }
  }
  console.log("");
};

const importAntigravity = async () => {
  console.log(chalk.bold("\n  Checking for Antigravity accounts...\n"));

  let res;
  try {
    res = await request("/api/keys/import-antigravity", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.imported > 0) {
        console.log(chalk.green(`  ✓ Imported ${data.imported} Antigravity accounts`));
        if (data.skipped > 0) {
          console.log(chalk.gray(`  (${data.skipped} already in pool, skipped)`));
        }
      } else {
        console.log(chalk.yellow("  No new Antigravity accounts found"));
      }
    } else {
      console.log(chalk.yellow("  Server error, trying direct import..."));
      const keyService = require("../../services/keyService");
      keyService.loadKeys();
      const result = await keyService.importAntigravityAccounts();
      if (result.imported > 0) {
        console.log(chalk.green(`  ✓ Imported ${result.imported} Antigravity accounts`));
        // Update agent configs
        try {
          const install = require("../../src/cli/install");
          const geminiService = require("../../services/geminiService");
          const allModels = [
            ...(geminiService.getDynamicModels() || []),
            ...(keyService.getAllOAuthModels() || []),
          ];
          const uniqueModels = [...new Set(allModels)];
          if (uniqueModels.length > 0) {
            install.updateAgentConfig(uniqueModels);
            console.log(
              chalk.green(`  ✓ Updated agent configs with ${uniqueModels.length} models`),
            );
          }
        } catch {}
      } else {
        console.log(chalk.yellow("  No Antigravity accounts found to import"));
      }
    }
  } catch {
    console.log(chalk.gray("  Server not running, trying direct import..."));
    try {
      const keyService = require("../../services/keyService");
      keyService.loadKeys();
      const result = await keyService.importAntigravityAccounts();
      if (result.imported > 0) {
        console.log(chalk.green(`  ✓ Imported ${result.imported} Antigravity accounts`));
      } else {
        console.log(chalk.yellow("  No Antigravity accounts found"));
        console.log(chalk.gray("\n  To use Antigravity:"));
        console.log(
          chalk.white("    1. Install antigravity-auth in OpenCode: opencode auth login"),
        );
        console.log(chalk.white("    2. Run: geminitro key import-antigravity"));
      }
    } catch (e) {
      console.error(chalk.red(`  ✗ Error: ${e.message}`));
    }
  }
  console.log("");
};

const oauthAntigravity = async () => {
  const open = require("open");
  const oauthService = require("../../services/oauthService");
  const keyService = require("../../services/keyService");

  console.log(chalk.bold("\n  Starting Antigravity OAuth flow...\n"));
  console.log(chalk.gray("  A browser window will open for authentication\n"));

  try {
    const { url } = oauthService.generateAuthUrl("antigravity");
    await open(url);
    console.log(chalk.cyan(`  Opened: ${url.slice(0, 60)}...`));
    console.log(chalk.gray("\n  Waiting for authentication... (press Ctrl+C to cancel)"));

    // Wait for OAuth to complete - startOAuthServer now resolves when callback fires
    const tokens = await oauthService.startOAuthServer();

    keyService.loadKeys();
    const result = await keyService.addOAuthToken(tokens.refreshToken, "antigravity", tokens.email);
    if (result.success) {
      console.log(chalk.green(`\n  ✓ Authenticated as ${tokens.email}`));
      console.log(
        chalk.green(`  ✓ Account added to key pool (${result.models.length} models discovered)`),
      );

      // Update agent configs with all models
      try {
        const install = require("../../src/cli/install");
        const geminiService = require("../../services/geminiService");
        const allModels = [
          ...(geminiService.getDynamicModels() || []),
          ...(keyService.getAllOAuthModels() || []),
        ];
        const uniqueModels = [...new Set(allModels)];
        if (uniqueModels.length > 0) {
          install.updateAgentConfig(uniqueModels);
          console.log(chalk.green(`  ✓ Updated agent configs with ${uniqueModels.length} models`));
        }
      } catch {
        // Ignore errors - server might not be running
      }
    } else {
      console.log(chalk.yellow("\n  ⚠ Account already exists in pool\n"));
    }
    await oauthService.stopOAuthServer();
  } catch (e) {
    console.error(chalk.red(`\n  ✗ Authentication failed: ${e.message}`));
    await oauthService.stopOAuthServer();
    process.exit(1);
  }
};

const oauthGeminiCli = async () => {
  const open = require("open");
  const oauthService = require("../../services/oauthService");
  const keyService = require("../../services/keyService");

  console.log(chalk.bold("\n  Starting Gemini CLI OAuth flow...\n"));
  console.log(chalk.gray("  A browser window will open for authentication\n"));

  try {
    const { url } = oauthService.generateAuthUrl("gemini_cli");
    await open(url);
    console.log(chalk.cyan(`  Opened: ${url.slice(0, 60)}...`));
    console.log(chalk.gray("\n  Waiting for authentication... (press Ctrl+C to cancel)"));

    // Wait for OAuth to complete - startOAuthServer now resolves when callback fires
    const tokens = await oauthService.startOAuthServer();

    keyService.loadKeys();
    const result = await keyService.addOAuthToken(tokens.refreshToken, "gemini_cli", tokens.email);
    if (result.success) {
      console.log(chalk.green(`\n  ✓ Authenticated as ${tokens.email}`));
      console.log(
        chalk.green(`  ✓ Account added to key pool (${result.models.length} models discovered)`),
      );

      // Update agent configs with all models
      try {
        const install = require("../../src/cli/install");
        const geminiService = require("../../services/geminiService");
        const allModels = [
          ...(geminiService.getDynamicModels() || []),
          ...(keyService.getAllOAuthModels() || []),
        ];
        const uniqueModels = [...new Set(allModels)];
        if (uniqueModels.length > 0) {
          install.updateAgentConfig(uniqueModels);
          console.log(chalk.green(`  ✓ Updated agent configs with ${uniqueModels.length} models`));
        }
      } catch {
        // Ignore errors - server might not be running
      }
    } else {
      console.log(chalk.yellow("\n  ⚠ Account already exists in pool\n"));
    }
    await oauthService.stopOAuthServer();
  } catch (e) {
    console.error(chalk.red(`\n  ✗ Authentication failed: ${e.message}`));
    await oauthService.stopOAuthServer();
    process.exit(1);
  }
};

const importGeminiCli = async () => {
  console.log(chalk.bold("\n  Checking for Gemini CLI accounts...\n"));

  try {
    const keyService = require("../../services/keyService");
    keyService.loadKeys();
    const result = await keyService.importGeminiCliAccounts();
    if (result.imported > 0) {
      console.log(chalk.green(`  ✓ Imported ${result.imported} Gemini CLI accounts`));
      if (result.skipped > 0) {
        console.log(chalk.gray(`  (${result.skipped} already in pool, skipped)`));
      }
      // Update agent configs
      try {
        const install = require("../../src/cli/install");
        const geminiService = require("../../services/geminiService");
        const allModels = [
          ...(geminiService.getDynamicModels() || []),
          ...(keyService.getAllOAuthModels() || []),
        ];
        const uniqueModels = [...new Set(allModels)];
        if (uniqueModels.length > 0) {
          install.updateAgentConfig(uniqueModels);
          console.log(chalk.green(`  ✓ Updated agent configs with ${uniqueModels.length} models`));
        }
      } catch {}
    } else {
      console.log(chalk.yellow("  No Gemini CLI accounts found"));
      console.log(chalk.gray("\n  To use Gemini CLI:"));
      console.log(chalk.white("    1. Install: npm install -g @google/gemini-cli"));
      console.log(chalk.white("    2. Authenticate: gemini auth login"));
      console.log(chalk.white("    3. Run: geminitro key import-gemini-cli"));
    }
  } catch (e) {
    console.error(chalk.red(`  ✗ Error: ${e.message}`));
  }
  console.log("");
};

module.exports = {
  add,
  remove,
  list,
  importAntigravity,
  importGeminiCli,
  oauthAntigravity,
  oauthGeminiCli,
};
