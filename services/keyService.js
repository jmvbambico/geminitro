const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("../config");
const logger = require("../utils/logger");
const antigravityService = require("./antigravityService");

let keyPool = [];

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
          status: "active",
          usage: 0,
          errors: 0,
          lastUsed: 0,
          supportedModels: migratedModels,
        }
      );
    });

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

const saveKeys = async () => {
  try {
    await fs.promises.writeFile(
      config.KEY_FILE,
      JSON.stringify(
        keyPool.map((k) => ({
          key: k.key,
          type: k.type,
          email: k.email || null,
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

const getOptimalKey = (excludeKeys = [], desiredModel = null, keyType = null) => {
  // First: try to find an active key that supports the requested model (if provided)
  let bestKey = null;
  let minUsage = Infinity;

  const byModel = (k) => {
    const supports = Array.isArray(k.supportedModels) ? k.supportedModels : [];
    return desiredModel ? supports.includes(desiredModel) : true;
  };

  const byType = (k) => {
    return keyType ? k.type === keyType : true;
  };

  // Practical: prefer active keys that support the desired model
  const matchingActive = keyPool.filter(
    (k) => k.status === "active" && !excludeKeys.includes(k.key) && byModel(k) && byType(k),
  );
  for (const k of matchingActive) {
    if (k.usage < minUsage) {
      minUsage = k.usage;
      bestKey = k;
    }
  }
  if (bestKey) return bestKey;

  // If no matching active key, fallback to any active key (ignore model but respect type)
  const fallbackActive = keyPool.filter(
    (k) => k.status === "active" && !excludeKeys.includes(k.key) && byType(k),
  );
  for (const k of fallbackActive) {
    if (k.usage < minUsage) {
      minUsage = k.usage;
      bestKey = k;
    }
  }
  if (bestKey) return bestKey;

  // If no active keys, try to recover a cooldown key
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

  // No suitable key found
  return null;
};

const addKey = (key, options = {}) => {
  const { type = "api_key", email = null, models = [] } = options;
  if (key && !keyPool.find((k) => k.key === key)) {
    keyPool.push({
      key,
      type,
      email,
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
      // Both Antigravity and Gemini CLI use the same cloudcode-pa endpoint
      supportedModels = await antigravityService.fetchAntigravityModels(refreshToken, email);
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
    await saveKeys();
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

const updateKeyStatus = (key, status) => {
  const keyObj = keyPool.find((k) => k.key === key);
  if (keyObj) {
    keyObj.status = status;
    if (status === "active" || status === "cooldown") keyObj.lastUsed = Date.now();
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
        source: "opencode-antigravity",
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
    await saveKeys();
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
        source: "gemini-cli",
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
    const exists = keyPool.find((k) => k.key === account.key && k.source === "gemini-cli");
    if (exists) {
      skipped++;
      continue;
    }

    // Discover models for this account - use standard Gemini API for gemini-cli
    let supportedModels = [];
    try {
      supportedModels = await antigravityService.fetchAntigravityModels(account.key, account.email);
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
    await saveKeys();
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
  detectAntigravityAccounts,
  importAntigravityAccounts,
  getAntigravityAccounts,
  detectGeminiCliAccounts,
  importGeminiCliAccounts,
  getGeminiCliAccounts,
  getAllOAuthModels,
};
