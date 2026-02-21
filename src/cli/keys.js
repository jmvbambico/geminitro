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
      models.sort((a, b) => (a.includes("pro") ? -1 : 1));
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

const add = async (key) => {
  if (!key) { console.error(chalk.red("\n  Usage: geminitro key add <API_KEY>\n")); process.exit(1); }

  let res;
  try {
    res = await request("/api/keys", { method: "POST", body: JSON.stringify({ key, validate: true }) });
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
    console.error(chalk.red(`\n  ✗ ${e.error || "Failed to add key"}\n`)); process.exit(1);
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
  if (!fragment) { console.error(chalk.red("\n  Usage: geminitro key remove <last-6-chars>\n")); process.exit(1); }

  let res;
  try {
    res = await request(`/api/keys/${fragment}`, { method: "DELETE" });
  } catch {
    const config = require("../../config");
    const keyFile = config.KEY_FILE;

    if (!fs.existsSync(keyFile)) {
      console.error(chalk.red("\n  ✗ No keys configured\n")); process.exit(1);
    }

    let keys = [];
    try { keys = JSON.parse(fs.readFileSync(keyFile, "utf8")); } catch {}

    const idx = keys.findIndex((k) => k.endsWith(fragment));
    if (idx === -1) {
      console.error(chalk.red("\n  ✗ Key not found\n")); process.exit(1);
    }

    keys.splice(idx, 1);
    fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
    console.log(chalk.green("\n  ✓ Key removed\n"));
    return;
  }

  if (res.ok) { console.log(chalk.green("\n  ✓ Key removed\n")); }
  else { console.error(chalk.red("\n  ✗ Key not found\n")); process.exit(1); }
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
      console.log(chalk.yellow("\n  No keys configured.\n  Add one with: geminitro key add <YOUR_GEMINI_KEY>\n"));
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
    console.log(chalk.yellow("\n  No keys configured.\n  Add one with: geminitro key add <YOUR_GEMINI_KEY>\n"));
    return;
  }
  console.log(chalk.bold("\n  Key Pool\n"));
  const now = Date.now();
  for (const k of keys) {
    const tail = k.key ? `...${k.key.slice(-8)}` : "???";

    if (k.status === "active") {
      console.log(`  ${chalk.green("active  ")}  ${chalk.white(tail)}  ${chalk.gray(`${k.usage ?? 0} req  ${k.errors ?? 0} err`)}`);
    } else {
      const remaining = Math.max(0, Math.ceil((COOLDOWN_TIME - (now - (k.lastUsed || 0))) / 1000));
      console.log(`  ${chalk.yellow("cooldown")}  ${chalk.white(tail)}  ${chalk.gray(`${k.usage ?? 0} req  ${k.errors ?? 0} err`)}  ${chalk.yellow(`${remaining}s`)}`);
    }
  }
  console.log("");
};

module.exports = { add, remove, list };
