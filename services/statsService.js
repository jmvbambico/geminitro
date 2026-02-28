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
  // New: Unified model statistics across all account types
  modelStats: {}, // { modelName: { totalRequests, errors, accountTypes: {}, timestamps: [] } }
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

/**
 * Record a request with model and account type for unified statistics.
 * @param {string} model - Model name
 * @param {string} accountType - Type of account (api_key, oauth)
 * @param {string} accountId - Account identifier
 * @param {number} timestamp - Request timestamp (optional, defaults to now)
 */
const recordRequest = (model, accountType, accountId, timestamp = Date.now()) => {
  const cleanModel = model.replace("models/", "");

  if (!stats.modelStats[cleanModel]) {
    stats.modelStats[cleanModel] = {
      totalRequests: 0,
      errors: 0,
      accountTypes: {},
      timestamps: [],
    };
  }

  const modelStat = stats.modelStats[cleanModel];
  modelStat.totalRequests++;
  modelStat.timestamps.push(timestamp);

  // Track by account type
  if (!modelStat.accountTypes[accountType]) {
    modelStat.accountTypes[accountType] = 0;
  }
  modelStat.accountTypes[accountType]++;

  scheduleSave();
};

/**
 * Record an error for a model and account type.
 * @param {string} model - Model name
 * @param {string} accountType - Type of account
 * @param {string} accountId - Account identifier
 * @param {string} errorMessage - Error message
 */
const recordError = (model, accountType, accountId, _errorMessage) => {
  const cleanModel = model.replace("models/", "");

  if (!stats.modelStats[cleanModel]) {
    recordRequest(model, accountType, accountId);
  }

  stats.modelStats[cleanModel].errors++;
  scheduleSave();
};

/**
 * Get unified statistics per model.
 * @param {object} options - Query options { since: timestamp }
 * @returns {object} Model statistics
 */
const getModelStats = (options = {}) => {
  const result = {};

  for (const [modelName, modelStat] of Object.entries(stats.modelStats)) {
    let filteredStats = { ...modelStat };

    // Filter by time range if requested
    if (options.since) {
      const filteredTimestamps = modelStat.timestamps.filter((t) => t >= options.since);
      filteredStats.totalRequests = filteredTimestamps.length;
      filteredStats.timestamps = filteredTimestamps;

      // Recalculate account types based on filtered timestamps
      // (simplified - assumes proportional distribution)
      const ratio = filteredTimestamps.length / modelStat.timestamps.length;
      filteredStats.accountTypes = {};
      for (const [type, count] of Object.entries(modelStat.accountTypes)) {
        filteredStats.accountTypes[type] = Math.round(count * ratio);
      }
    }

    // Calculate error rate
    filteredStats.errorRate =
      filteredStats.totalRequests > 0 ? filteredStats.errors / filteredStats.totalRequests : 0;

    result[modelName] = filteredStats;
  }

  return result;
};

/**
 * Get unified statistics across all models and account types.
 * @returns {object} { totalRequests, byModel: {}, byAccountType: {} }
 */
const getUnifiedStats = () => {
  const result = {
    totalRequests: 0,
    byModel: {},
    byAccountType: {},
  };

  for (const [modelName, modelStat] of Object.entries(stats.modelStats)) {
    result.totalRequests += modelStat.totalRequests;
    result.byModel[modelName] = modelStat.totalRequests;

    // Aggregate by account type
    for (const [accountType, count] of Object.entries(modelStat.accountTypes)) {
      if (!result.byAccountType[accountType]) {
        result.byAccountType[accountType] = 0;
      }
      result.byAccountType[accountType] += count;
    }
  }

  return result;
};

/**
 * Reset statistics (for testing).
 */
const resetStats = () => {
  stats = {
    totalRequests: 0,
    totalSuccess: 0,
    totalErrors: 0,
    daily: {},
    models: {},
    keyUsage: {},
    modelStats: {},
  };
};

const getStats = () => ({ ...stats });

module.exports = {
  initialize,
  trackRequest,
  getStats,
  recordRequest,
  recordError,
  getModelStats,
  getUnifiedStats,
  resetStats,
};
