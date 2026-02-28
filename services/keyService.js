const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");
const antigravityService = require("./antigravityService");
const statsService = require("./statsService");

let keyPool = [];
let currentRotationMode = config.ROTATION_MODE;

const ensureDataDir = () => {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
};

const loadKeys = () => {
  ensureDataDir();
  try {
    if (!fs.existsSync(config.KEY_FILE)) {
      fs.writeFileSync(config.KEY_FILE, "[]");
    }
    const raw = fs.readFileSync(config.KEY_FILE, "utf8");
    const keys = raw.trim() ? JSON.parse(raw) : [];

    // Load models.json to check for any cached models (for migration)
    let cachedModels = [];
    try {
      if (fs.existsSync(config.MODELS_FILE)) {
        cachedModels = JSON.parse(fs.readFileSync(config.MODELS_FILE, "utf8")) || [];
      }
    } catch {}

    const existingKeysMap = new Map(keyPool.map((k) => [k.key, k]));

    keyPool = keys.map((k) => {
      // Handle both old format (string key) and new format (object)
      const keyStr = typeof k === "string" ? k : k.key;
      const existing = existingKeysMap.get(keyStr);
      const keyType = typeof k === "object" ? k.type || "api_key" : "api_key";
      const keySource = typeof k === "object" ? k.source || null : null;
      const keySupportedModels = Array.isArray(k?.supportedModels) ? k.supportedModels : [];

      // Migration: if OAuth key has empty supportedModels but models.json has models,
      // assume they belong to this OAuth key
      const migratedModels =
        keyType === "oauth" && keySupportedModels.length === 0 && cachedModels.length > 0
          ? cachedModels
          : keySupportedModels;

      return (
        existing || {
          key: keyStr,
          type: keyType,
          email: typeof k === "object" ? k.email : null,
          source: keySource,
          status: "active",
          usage: 0,
          errors: 0,
          failureCount: 0,
          failuresByModel: {},
          lastUsed: 0,
          supportedModels: migratedModels,
        }
      );
    });

    // Restore per-key usage/errors from persisted history.json
    const historyStats = statsService.getStats();
    const keyUsage = historyStats.keyUsage || {};
    for (const keyObj of keyPool) {
      const persisted = keyUsage[keyObj.key];
      if (persisted) {
        keyObj.usage = persisted.requests || 0;
        keyObj.errors = persisted.errors || 0;
      }
    }

    // Save migrated keys if any supportedModels were added
    const needsSave = keyPool.some(
      (k) => k.type === "oauth" && Array.isArray(k.supportedModels) && k.supportedModels.length > 0,
    );
    if (needsSave) {
      saveKeys();
    }

    logger.info(`Loaded ${keyPool.length} keys`);
  } catch (e) {
    logger.error("Failed to load keys", e);
    keyPool = [];
  }
};

const saveKeys = () => {
  try {
    fs.writeFileSync(
      config.KEY_FILE,
      JSON.stringify(
        keyPool.map((k) => ({
          key: k.key,
          type: k.type,
          email: k.email || null,
          source: k.source || null,
          supportedModels: k.supportedModels || [],
        })),
        null,
        2,
      ),
    );
  } catch (e) {
    logger.error("Failed to save keys", e);
  }
};

/**
 * Set rotation mode for key selection.
 * @param {string} mode - 'balanced' (LRU) or 'sequential' (exhaust quota)
 */
const setRotationMode = (mode) => {
  if (!["balanced", "sequential"].includes(mode)) {
    throw new Error(`Invalid rotation mode: ${mode}`);
  }
  currentRotationMode = mode;
};

/**
 * Compare two keys based on current rotation mode.
 * @param {object} a - First key
 * @param {object} b - Second key
 * @returns {number} Comparison result (-1, 0, 1)
 */
const compareKeysByRotationMode = (a, b) => {
  if (currentRotationMode === "balanced") {
    // Balanced: prefer least-used (LRU)
    return a.usage - b.usage;
  } else {
    // Sequential: prefer most-used (exhaust quota)
    return b.usage - a.usage;
  }
};

const getOptimalKey = (excludeKeys = [], desiredModel = null, keyType = null) => {
  const byType = (k) => (keyType ? k.type === keyType : true);

  // Helper to select best key from filtered array
  const selectBest = (keys) => {
    if (keys.length === 0) return null;
    keys.sort(compareKeysByRotationMode);
    return keys[0];
  };

  // 1. First Pass: Try to find an active key that EXPLICITLY supports the requested model
  const explicitMatch = keyPool.filter(
    (k) =>
      k.status === "active" &&
      !excludeKeys.includes(k.key) &&
      byType(k) &&
      desiredModel &&
      Array.isArray(k.supportedModels) &&
      k.supportedModels.includes(desiredModel),
  );
  const bestExplicit = selectBest(explicitMatch);
  if (bestExplicit) return bestExplicit;

  // 2. Second Pass: Try to find an active key with UNKNOWN support (supportedModels is empty)
  // This is typical for standard API keys or newly added keys before discovery.
  // BUT: If a'desiredModel' was specified, we only fallback to these "unknown" keys.
  // We NEVER fallback to a key that has a non-empty list which excludes the model.
  const unknownMatch = keyPool.filter(
    (k) =>
      k.status === "active" &&
      !excludeKeys.includes(k.key) &&
      byType(k) &&
      (!Array.isArray(k.supportedModels) || k.supportedModels.length === 0),
  );
  const bestUnknown = selectBest(unknownMatch);
  if (bestUnknown) return bestUnknown;

  // 3. Special Case: If NO desiredModel was specified, we can return any active key of the right type
  if (!desiredModel) {
    const anyActive = keyPool.filter(
      (k) => k.status === "active" && !excludeKeys.includes(k.key) && byType(k),
    );
    const bestAny = selectBest(anyActive);
    if (bestAny) return bestAny;
  }

  // 4. Cooldown Recovery: If no active keys, try to recover a cooldown key
  const now = Date.now();
  const recoveredKey = keyPool.find(
    (k) =>
      k.status === "cooldown" &&
      !excludeKeys.includes(k.key) &&
      now - k.lastUsed > config.KEY_COOLDOWN_TIME,
  );

  if (recoveredKey) {
    recoveredKey.status = "active";
    logger.keyRecovered(recoveredKey.key.slice(-6));
    return recoveredKey;
  }

  return null;
};

const addKey = (key, options = {}) => {
  const { type = "api_key", email = null, models = [], source = null } = options;
  if (key && !keyPool.find((k) => k.key === key)) {
    keyPool.push({
      key,
      type,
      email,
      source,
      status: "active",
      usage: 0,
      errors: 0,
      lastUsed: 0,
      supportedModels: Array.isArray(models) ? models : [],
    });
    saveKeys();
    return true;
  }
  return false;
};

const addOAuthToken = async (refreshToken, provider, email = null) => {
  if (refreshToken && !keyPool.find((k) => k.key === refreshToken)) {
    // Discover models for this account - FAIL if no models found
    let supportedModels = [];
    try {
      if (provider === "gemini_cli") {
        supportedModels = await antigravityService.fetchGeminiCliModels(refreshToken, email);
      } else {
        supportedModels = await antigravityService.fetchAntigravityModels(refreshToken, email);
      }
      logger.info(`Discovered ${supportedModels.length} models for ${email || provider}`);
    } catch (error) {
      logger.warn(
        `Model discovery failed for ${email || refreshToken.slice(-6)}: ${error.message}`,
      );
    }

    // If no models found, fail the account addition
    if (supportedModels.length === 0) {
      return {
        success: false,
        error: "No models found for this account. Cannot add to pool.",
        models: [],
      };
    }

    // Check if models already exist in models.json
    let modelsUpdated = false;
    try {
      const geminiService = require("./geminiService");
      const existingModels = geminiService.loadCachedModels();
      const existingSet = new Set(existingModels || []);

      // Find new models not in models.json
      const newModels = supportedModels.filter((m) => !existingSet.has(m));

      if (newModels.length > 0) {
        // Merge and save to models.json
        const allModels = [...new Set([...(existingModels || []), ...newModels])];
        await geminiService.saveCachedModels(allModels);
        modelsUpdated = true;
        logger.info(`Added ${newModels.length} new models to models.json`);
      }
    } catch (error) {
      logger.warn(`Failed to check/update models.json: ${error.message}`);
    }

    keyPool.push({
      key: refreshToken,
      type: "oauth",
      email,
      source: provider,
      status: "active",
      usage: 0,
      errors: 0,
      lastUsed: 0,
      supportedModels,
    });
    saveKeys();
    return { success: true, models: supportedModels, modelsUpdated };
  }
  return { success: false, models: [] };
};

const removeKey = (keyFragment) => {
  const idx = keyPool.findIndex((k) => k.key.endsWith(keyFragment));
  if (idx === -1) return false;
  keyPool.splice(idx, 1);
  saveKeys();
  return true;
};

/**
 * Get cooldown duration based on consecutive failure count.
 * Escalating pattern: 10s → 30s → 60s → 120s
 * @param {number} failureCount - Number of consecutive failures
 * @returns {number} Cooldown duration in seconds
 */
const getCooldownDuration = (failureCount) => {
  const durations = [10, 30, 60, 120];
  const index = Math.min(Math.max(failureCount - 1, 0), durations.length - 1);
  return durations[index];
};

/**
 * Update key status and apply escalating cooldowns on failures.
 * @param {string} key - API key
 * @param {string} status - New status ('active', 'cooldown', 'invalid')
 * @param {string|null} model - Model that triggered the status change (optional)
 */
const updateKeyStatus = (key, status, model = null) => {
  const keyObj = keyPool.find((k) => k.key === key);
  if (!keyObj) return;

  if (status === "cooldown") {
    // Increment failure count for this model
    if (model) {
      keyObj.failuresByModel[model] = (keyObj.failuresByModel[model] || 0) + 1;
      keyObj.failureCount = Math.max(...Object.values(keyObj.failuresByModel));
    } else {
      keyObj.failureCount++;
    }

    const cooldownSeconds = getCooldownDuration(keyObj.failureCount);
    keyObj.status = "cooldown";
    keyObj.cooldownUntil = Date.now() + cooldownSeconds * 1000;
    keyObj.lastUsed = Date.now();

    logger.info(
      `Key cooldown: ${keyObj.failureCount} failures → ${cooldownSeconds}s timeout (model: ${model || "all"})`,
    );
  } else if (status === "active") {
    // Reset failure count on success
    if (model && keyObj.failuresByModel[model]) {
      delete keyObj.failuresByModel[model];
      const modelFailureCounts = Object.values(keyObj.failuresByModel);
      keyObj.failureCount = modelFailureCounts.length > 0 ? Math.max(...modelFailureCounts) : 0;
    } else {
      keyObj.failureCount = 0;
      keyObj.failuresByModel = {};
    }
    keyObj.status = "active";
    keyObj.lastUsed = Date.now();
  } else {
    // Other statuses (invalid, etc.)
    keyObj.status = status;
    keyObj.lastUsed = Date.now();
  }
};

const incrementKeyErrors = (key) => {
  const keyObj = keyPool.find((k) => k.key === key);
  if (keyObj) keyObj.errors++;
};

const incrementKeyUsage = (key) => {
  const keyObj = keyPool.find((k) => k.key === key);
  if (keyObj) keyObj.usage++;
};

const getKeyPool = () => [...keyPool];

const getSafeKeyPool = () =>
  keyPool.map((k) => ({
    tail: k.key.slice(-6),
    type: k.type,
    source: k.source || null,
    email: k.email,
    status: k.status,
    usage: k.usage,
    errors: k.errors,
    lastUsed: k.lastUsed,
    cooldownUntil: k.status === "cooldown" ? k.lastUsed + config.KEY_COOLDOWN_TIME : null,
  }));

const getCooldownRemaining = (keyObj) => {
  if (keyObj.status !== "cooldown") return 0;
  const elapsed = Date.now() - keyObj.lastUsed;
  const remaining = config.KEY_COOLDOWN_TIME - elapsed;
  return Math.max(0, Math.ceil(remaining / 1000));
};

const getPoolStatus = () => {
  const pool = getKeyPool();

  const active = pool.filter((k) => k.status === "active").length;
  const cooling = pool.filter((k) => k.status === "cooldown");

  const cooldownKeys = cooling.map((k) => ({
    tail: k.key.slice(-6),
    remaining: getCooldownRemaining(k),
  }));

  const minCooldown =
    cooling.length > 0 ? Math.min(...cooling.map((k) => getCooldownRemaining(k))) : 0;

  return {
    total: pool.length,
    active,
    cooldown: cooling.length,
    minCooldown,
    cooldownKeys,
  };
};

// Antigravity account detection and import
const detectAntigravityAccounts = () => {
  if (!config.ANTIGRAVITY_ENABLED) return [];

  try {
    if (!fs.existsSync(config.ANTIGRAVITY_ACCOUNTS_FILE)) return [];

    const raw = fs.readFileSync(config.ANTIGRAVITY_ACCOUNTS_FILE, "utf8");
    const data = JSON.parse(raw);

    if (!data.accounts || !Array.isArray(data.accounts)) return [];

    return data.accounts
      .filter((a) => a.refreshToken)
      .map((a) => ({
        key: a.refreshToken,
        type: "oauth",
        email: a.email || null,
        source: "antigravity",
        projectId: a.projectId || null,
      }));
  } catch (e) {
    logger.warn("Failed to detect antigravity accounts", e.message);
    return [];
  }
};

const importAntigravityAccounts = async () => {
  const accounts = detectAntigravityAccounts();
  if (accounts.length === 0) return { imported: 0, skipped: 0, models: [], modelsUpdated: false };

  let imported = 0;
  let skipped = 0;
  const allDiscoveredModels = [];
  let modelsUpdated = false;

  for (const account of accounts) {
    // Check if already exists
    const exists = keyPool.find((k) => k.key === account.key && k.type === "oauth");
    if (exists) {
      skipped++;
      continue;
    }

    // Discover models for this account - FAIL if no models found
    let supportedModels = [];
    try {
      supportedModels = await antigravityService.fetchAntigravityModels(account.key, account.email);
      logger.info(
        `Discovered ${supportedModels.length} models for ${account.email || "antigravity"}`,
      );
    } catch (error) {
      logger.warn(
        `Model discovery failed for ${account.email || account.key.slice(-6)}: ${error.message}`,
      );
    }

    // If no models found, skip this account
    if (supportedModels.length === 0) {
      logger.warn(`Skipping account ${account.email || "unknown"} - no models found`);
      skipped++;
      continue;
    }

    // Check if models already exist in models.json
    try {
      const geminiService = require("./geminiService");
      const existingModels = geminiService.loadCachedModels();
      const existingSet = new Set(existingModels || []);

      // Find new models not in models.json
      const newModels = supportedModels.filter((m) => !existingSet.has(m));

      if (newModels.length > 0) {
        // Merge and save to models.json
        const allModels = [...new Set([...existingModels, ...newModels])];
        await geminiService.saveCachedModels(allModels);
        modelsUpdated = true;
        logger.info(`Added ${newModels.length} new models to models.json`);
      }
    } catch (error) {
      logger.warn(`Failed to check/update models.json: ${error.message}`);
    }

    // Add unique models to overall list
    for (const model of supportedModels) {
      if (!allDiscoveredModels.includes(model)) {
        allDiscoveredModels.push(model);
      }
    }

    keyPool.push({
      ...account,
      status: "active",
      usage: 0,
      errors: 0,
      lastUsed: 0,
      supportedModels,
    });
    imported++;
  }

  if (imported > 0) {
    saveKeys();
    logger.info(`Imported ${imported} antigravity accounts, skipped ${skipped} duplicates`);
  }

  return { imported, skipped, models: allDiscoveredModels, modelsUpdated };
};

const getAntigravityAccounts = () => detectAntigravityAccounts();

// Gemini CLI account detection and import
const detectGeminiCliAccounts = () => {
  try {
    const geminiCliPath = path.join(os.homedir(), ".gemini", "oauth_creds.json");
    if (!fs.existsSync(geminiCliPath)) return [];

    const raw = fs.readFileSync(geminiCliPath, "utf8");
    const data = JSON.parse(raw);

    if (!data.refresh_token) return [];

    // Check if email is available from google_accounts.json
    let email = null;
    try {
      const accountsPath = path.join(os.homedir(), ".gemini", "google_accounts.json");
      if (fs.existsSync(accountsPath)) {
        const accountsData = JSON.parse(fs.readFileSync(accountsPath, "utf8"));
        if (accountsData.email) email = accountsData.email;
      }
    } catch {}

    return [
      {
        key: data.refresh_token,
        type: "oauth",
        email: email,
        source: "gemini_cli",
      },
    ];
  } catch (e) {
    logger.warn("Failed to detect Gemini CLI accounts", e.message);
    return [];
  }
};

const importGeminiCliAccounts = async () => {
  const accounts = detectGeminiCliAccounts();
  if (accounts.length === 0) return { imported: 0, skipped: 0, models: [] };

  let imported = 0;
  let skipped = 0;
  const allDiscoveredModels = [];

  for (const account of accounts) {
    // Check if already exists (by refresh token and source)
    const exists = keyPool.find((k) => k.key === account.key && k.source === "gemini_cli");
    if (exists) {
      skipped++;
      continue;
    }

    // Discover models for this account - use standard Gemini API for gemini-cli
    let supportedModels = [];
    try {
      supportedModels = await antigravityService.fetchGeminiCliModels(account.key, account.email);
      logger.info(
        `Discovered ${supportedModels.length} models for ${account.email || "gemini-cli"}`,
      );
    } catch (error) {
      logger.warn(
        `Model discovery failed for ${account.email || account.key.slice(-6)}: ${error.message}.`,
      );
    }

    // Add unique models to overall list
    for (const model of supportedModels) {
      if (!allDiscoveredModels.includes(model)) {
        allDiscoveredModels.push(model);
      }
    }

    keyPool.push({
      ...account,
      status: "active",
      usage: 0,
      errors: 0,
      lastUsed: 0,
      supportedModels,
    });
    imported++;
  }

  if (imported > 0) {
    saveKeys();
    logger.info(`Imported ${imported} Gemini CLI accounts, skipped ${skipped} duplicates`);
  }

  return { imported, skipped, models: allDiscoveredModels };
};

const getGeminiCliAccounts = () => detectGeminiCliAccounts();

// Get all unique models from OAuth accounts in the pool
const getAllOAuthModels = () => {
  const models = new Set();
  for (const key of keyPool) {
    if (key.type === "oauth" && Array.isArray(key.supportedModels)) {
      for (const model of key.supportedModels) {
        models.add(model);
      }
    }
  }
  return Array.from(models);
};

module.exports = {
  loadKeys,
  saveKeys,
  getOptimalKey,
  addKey,
  addOAuthToken,
  removeKey,
  updateKeyStatus,
  incrementKeyErrors,
  incrementKeyUsage,
  getKeyPool,
  getSafeKeyPool,
  getCooldownRemaining,
  getPoolStatus,
  getCooldownDuration,
  setRotationMode,
  detectAntigravityAccounts,
  importAntigravityAccounts,
  getAntigravityAccounts,
  detectGeminiCliAccounts,
  importGeminiCliAccounts,
  getGeminiCliAccounts,
  getAllOAuthModels,
};
