const fs = require("fs");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");

const CAPS_FILE = path.join(config.DATA_DIR, "usage_caps.json");

let capsConfig = {
  caps: [],
  resetTime: "00:00",
  timezone: "local",
};

let currentUsage = {}; // { modelName: { count: number, lastReset: timestamp } }
let resetTimerId = null;

/**
 * Initialize usage cap service - load caps from file and schedule resets.
 */
const initialize = () => {
  ensureDataDir();
  loadCaps();
  scheduleNextReset();
  logger.info("Usage cap service initialized");
};

/**
 * Ensure data directory exists.
 */
const ensureDataDir = () => {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
};

/**
 * Load caps configuration from file.
 */
const loadCaps = () => {
  try {
    if (fs.existsSync(CAPS_FILE)) {
      const raw = fs.readFileSync(CAPS_FILE, "utf8");
      if (raw.trim()) {
        capsConfig = JSON.parse(raw);
        logger.info("Usage caps loaded successfully");
      } else {
        saveCaps();
      }
    } else {
      saveCaps();
    }
  } catch (e) {
    logger.error("Failed to load usage caps", e);
    saveCaps();
  }
};

/**
 * Save caps configuration to file.
 */
const saveCaps = () => {
  try {
    fs.writeFileSync(CAPS_FILE, JSON.stringify(capsConfig, null, 2));
  } catch (e) {
    logger.error("Failed to save usage caps", e);
  }
};

/**
 * Get all caps.
 * @returns {object} Caps configuration
 */
const getAllCaps = () => {
  return { ...capsConfig };
};

/**
 * Get cap for a specific model.
 * @param {string} model - Model name
 * @returns {object|null} Cap configuration or null
 */
const getCap = (model) => {
  const cleanModel = model.replace("models/", "");
  return capsConfig.caps.find((c) => c.model === cleanModel && c.enabled) || null;
};

/**
 * Add or update a usage cap.
 * @param {object} cap - Cap configuration
 */
const addOrUpdateCap = (cap) => {
  const cleanModel = cap.model.replace("models/", "");
  const existingIndex = capsConfig.caps.findIndex((c) => c.model === cleanModel);

  const newCap = {
    model: cleanModel,
    limit: cap.limit,
    period: cap.period || "daily",
    alertThreshold: cap.alertThreshold || 80,
    action: cap.action || "try_next",
    enabled: cap.enabled !== false,
    lastReset: cap.lastReset || new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    capsConfig.caps[existingIndex] = newCap;
  } else {
    capsConfig.caps.push(newCap);
  }

  saveCaps();
  logger.info(`Usage cap ${existingIndex >= 0 ? "updated" : "added"} for model: ${cleanModel}`);
};

/**
 * Remove a usage cap.
 * @param {string} model - Model name
 */
const removeCap = (model) => {
  const cleanModel = model.replace("models/", "");
  const initialLength = capsConfig.caps.length;
  capsConfig.caps = capsConfig.caps.filter((c) => c.model !== cleanModel);

  if (capsConfig.caps.length < initialLength) {
    saveCaps();
    logger.info(`Usage cap removed for model: ${cleanModel}`);
    return true;
  }
  return false;
};

/**
 * Increment usage count for a model.
 * @param {string} model - Model name
 */
const incrementUsage = (model) => {
  const cleanModel = model.replace("models/", "");

  if (!currentUsage[cleanModel]) {
    currentUsage[cleanModel] = {
      count: 0,
      lastReset: new Date().toISOString(),
    };
  }

  const previousCount = currentUsage[cleanModel].count;
  currentUsage[cleanModel].count++;
  const newCount = currentUsage[cleanModel].count;

  // Check if we crossed alert threshold or cap limit
  const cap = getCap(cleanModel);
  if (cap) {
    const previousPercentage = (previousCount / cap.limit) * 100;
    const newPercentage = (newCount / cap.limit) * 100;

    // Emit warning when crossing alert threshold
    if (previousPercentage < cap.alertThreshold && newPercentage >= cap.alertThreshold) {
      const io = require("../utils/logger").getIo();
      if (io) {
        io.emit("usage:cap-warning", {
          model: cleanModel,
          current: newCount,
          limit: cap.limit,
          percentage: newPercentage,
          threshold: cap.alertThreshold,
        });
      }
    }

    // Emit cap exceeded when hitting limit
    if (previousCount < cap.limit && newCount >= cap.limit) {
      const io = require("../utils/logger").getIo();
      if (io) {
        io.emit("usage:cap-exceeded", {
          model: cleanModel,
          current: newCount,
          limit: cap.limit,
        });
      }
    }
  }
};

/**
 * Check if a model is at or over its usage cap.
 * @param {string} model - Model name
 * @returns {boolean} True if at/over cap
 */
const isAtCap = (model) => {
  const cleanModel = model.replace("models/", "");
  const cap = getCap(cleanModel);

  if (!cap) return false;

  const usage = currentUsage[cleanModel];
  if (!usage) return false;

  return usage.count >= cap.limit;
};

/**
 * Get usage progress for a model.
 * @param {string} model - Model name
 * @returns {object|null} Progress object or null
 */
const getCapProgress = (model) => {
  const cleanModel = model.replace("models/", "");
  const cap = getCap(cleanModel);

  if (!cap) return null;

  const usage = currentUsage[cleanModel];
  const current = usage ? usage.count : 0;
  const percentage = (current / cap.limit) * 100;

  return {
    model: cleanModel,
    current,
    limit: cap.limit,
    percentage,
    alertThreshold: cap.alertThreshold,
    atWarning: percentage >= cap.alertThreshold,
    atCap: current >= cap.limit,
    nextReset: getNextResetTime(),
    lastReset: usage ? usage.lastReset : null,
  };
};

/**
 * Get progress for all capped models.
 * @returns {array} Array of progress objects
 */
const getAllProgress = () => {
  return capsConfig.caps
    .filter((cap) => cap.enabled)
    .map((cap) => getCapProgress(cap.model))
    .filter(Boolean);
};

/**
 * Reset usage counts for all models.
 */
const resetAllUsage = () => {
  const now = new Date().toISOString();
  Object.keys(currentUsage).forEach((model) => {
    currentUsage[model] = {
      count: 0,
      lastReset: now,
    };
  });

  // Update lastReset timestamp in caps
  capsConfig.caps.forEach((cap) => {
    cap.lastReset = now;
  });
  saveCaps();

  logger.info("Usage counts reset for all models");
};

/**
 * Get the next reset time based on configured reset time.
 * @returns {Date} Next reset timestamp
 */
const getNextResetTime = () => {
  const [hours, minutes] = capsConfig.resetTime.split(":").map(Number);
  const now = new Date();
  const resetToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

  // If reset time has passed today, schedule for tomorrow
  if (now >= resetToday) {
    resetToday.setDate(resetToday.getDate() + 1);
  }

  return resetToday;
};

/**
 * Schedule the next automatic reset.
 */
const scheduleNextReset = () => {
  if (resetTimerId) {
    clearTimeout(resetTimerId);
  }

  const nextReset = getNextResetTime();
  const msUntilReset = nextReset.getTime() - Date.now();

  logger.info(`Next usage cap reset scheduled for: ${nextReset.toLocaleString()}`);

  resetTimerId = setTimeout(() => {
    resetAllUsage();
    scheduleNextReset(); // Schedule next reset
  }, msUntilReset);
};

/**
 * Update reset time configuration.
 * @param {string} resetTime - Time in HH:MM format
 */
const setResetTime = (resetTime) => {
  capsConfig.resetTime = resetTime;
  saveCaps();
  scheduleNextReset();
  logger.info(`Reset time updated to: ${resetTime}`);
};

/**
 * Get current usage stats (for debugging/monitoring).
 * @returns {object} Current usage object
 */
const getCurrentUsage = () => {
  return { ...currentUsage };
};

module.exports = {
  initialize,
  getAllCaps,
  getCap,
  addOrUpdateCap,
  removeCap,
  incrementUsage,
  isAtCap,
  getCapProgress,
  getAllProgress,
  resetAllUsage,
  setResetTime,
  getCurrentUsage,
};
