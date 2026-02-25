const path = require("path");
const fs = require("fs");
const os = require("os");

// Ensure .env exists with defaults (copy from .env.example if missing)
const envPath = path.join(__dirname, "..", ".env");
const envExamplePath = path.join(__dirname, "..", ".env.example");
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
}

require("dotenv").config({ quiet: true });

const DATA_DIR = process.env.GEMINITRO_DATA_DIR || path.join(__dirname, "..", ".geminitro");

// Antigravity config - path to OpenCode config directory
const opencodeConfigDir =
  process.env.OPENCODE_CONFIG_DIR || path.join(os.homedir(), ".config", "opencode");

module.exports = {
  PORT: parseInt(process.env.PORT || "7536", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  AUTO_UPDATE: process.env.AUTO_UPDATE === "true",
  SETUP_METHOD: process.env.SETUP_METHOD || null,
  DATA_DIR,
  KEY_FILE: path.join(DATA_DIR, "keys.json"),
  HISTORY_FILE: path.join(DATA_DIR, "history.json"),
  MODELS_FILE: path.join(DATA_DIR, "models.json"),
  GEMINI_API_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  KEY_COOLDOWN_TIME: 60000,
  MODEL_FETCH_INTERVAL: 3600000,
  INITIAL_MODEL_FETCH_DELAY: 2000,
  PROXY_API_KEY: process.env.PROXY_API_KEY || "geminitro",
  VERBOSE_LOGGING: process.env.GEMINITRO_VERBOSE_LOGGING === "true",
  // Antigravity integration
  ANTIGRAVITY_ENABLED: process.env.ANTIGRAVITY_ENABLED !== "false",
  ANTIGRAVITY_ACCOUNTS_FILE: path.join(opencodeConfigDir, "antigravity-accounts.json"),
  OPENCODE_CONFIG_DIR: opencodeConfigDir,
  // OAuth credentials for Antigravity/Gemini CLI
  // Required for OAuth account features. See README for how to obtain these.
  // Set in .env (which is gitignored).
  OAUTH_CLIENT_ID: process.env.OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET: process.env.OAUTH_CLIENT_SECRET,
};
