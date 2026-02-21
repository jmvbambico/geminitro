const fs = require("fs");
const config = require("../config");
const logger = require("../utils/logger");

let stats = {
  totalRequests: 0,
  totalSuccess: 0,
  totalErrors: 0,
  daily: {},
  models: {},
  keyUsage: {},
};

let saveTimer = null;

const ensureDataDir = () => {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
};

const initialize = () => {
  ensureDataDir();
  try {
    if (fs.existsSync(config.HISTORY_FILE)) {
      const raw = fs.readFileSync(config.HISTORY_FILE, "utf8");
      if (raw.trim()) {
        const loaded = JSON.parse(raw);
        stats = { ...stats, ...loaded };
        logger.info("Stats loaded successfully");
      } else {
        logger.info("Creating new history database");
        saveStats();
      }
    } else {
      logger.info("Creating new history database");
      saveStats();
    }
  } catch (e) {
    logger.error("Failed to load stats", e);
    saveStats();
  }
};

const saveStats = async () => {
  try {
    await fs.promises.writeFile(config.HISTORY_FILE, JSON.stringify(stats, null, 2));
  } catch (e) {
    logger.error("Failed to save stats", e);
  }
};

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStats, 10000);
};

const trackRequest = (key, model, isSuccess) => {
  const today = new Date().toLocaleDateString("en-CA");

  stats.totalRequests++;
  if (isSuccess) stats.totalSuccess++;
  else stats.totalErrors++;

  if (!stats.daily[today]) stats.daily[today] = { requests: 0, errors: 0 };
  stats.daily[today].requests++;
  if (!isSuccess) stats.daily[today].errors++;

  if (model) {
    const cleanModel = model.replace("models/", "");
    if (!stats.models[cleanModel]) stats.models[cleanModel] = 0;
    stats.models[cleanModel]++;
  }

  if (key) {
    if (!stats.keyUsage[key]) stats.keyUsage[key] = { requests: 0, errors: 0 };
    stats.keyUsage[key].requests++;
    if (!isSuccess) stats.keyUsage[key].errors++;
  }

  scheduleSave();
};

const getStats = () => ({ ...stats });

module.exports = { initialize, trackRequest, getStats };
