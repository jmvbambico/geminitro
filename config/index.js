const path = require("path");
require("dotenv").config();

const DATA_DIR = process.env.GEMINITRO_DATA_DIR ||
  path.join(__dirname, "..", ".geminitro");

module.exports = {
  PORT: parseInt(process.env.PORT || "7536", 10),
  NODE_ENV: process.env.NODE_ENV || "development",
  DATA_DIR,
  KEY_FILE: path.join(DATA_DIR, "keys.json"),
  HISTORY_FILE: path.join(DATA_DIR, "history.json"),
  MODELS_FILE: path.join(DATA_DIR, "models.json"),
  GEMINI_API_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models",
  KEY_COOLDOWN_TIME: 60000,
  MODEL_FETCH_INTERVAL: 3600000,
  INITIAL_MODEL_FETCH_DELAY: 2000,
  PROXY_API_KEY: process.env.PROXY_API_KEY || "geminitro",
};
