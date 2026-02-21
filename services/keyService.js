const fs = require("fs");
const config = require("../config");
const logger = require("../utils/logger");

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

    const existingKeysMap = new Map(keyPool.map((k) => [k.key, k]));

    keyPool = keys.map((k) => {
      const existing = existingKeysMap.get(k);
      return existing || { key: k, status: "active", usage: 0, errors: 0, lastUsed: 0 };
    });
    logger.info(`Loaded ${keyPool.length} keys`);
  } catch (e) {
    logger.error("Failed to load keys", e);
    keyPool = [];
  }
};

const saveKeys = async () => {
  try {
    await fs.promises.writeFile(config.KEY_FILE, JSON.stringify(keyPool.map((k) => k.key), null, 2));
  } catch (e) {
    logger.error("Failed to save keys", e);
  }
};

const getOptimalKey = (excludeKeys = []) => {
  let bestKey = null;
  let minLastUsed = Infinity;

  for (const k of keyPool) {
    if (k.status === "active" && !excludeKeys.includes(k.key)) {
      if (k.lastUsed < minLastUsed) {
        minLastUsed = k.lastUsed;
        bestKey = k;
      }
    }
  }

  if (bestKey) return bestKey;

  const now = Date.now();
  const recoveredKey = keyPool.find(
    (k) => k.status === "cooldown" && !excludeKeys.includes(k.key) && now - k.lastUsed > config.KEY_COOLDOWN_TIME,
  );

  if (recoveredKey) {
    recoveredKey.status = "active";
    logger.keyRecovered(recoveredKey.key.slice(-6));
    return recoveredKey;
  }

  return null;
};

const addKey = (key) => {
  if (key && !keyPool.find((k) => k.key === key)) {
    keyPool.push({ key, status: "active", usage: 0, errors: 0, lastUsed: 0 });
    saveKeys();
    return true;
  }
  return false;
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

const getSafeKeyPool = () => keyPool.map((k) => ({
  tail: k.key.slice(-6),
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
  const now = Date.now();

  const active = pool.filter((k) => k.status === "active").length;
  const cooling = pool.filter((k) => k.status === "cooldown");

  const cooldownKeys = cooling.map((k) => ({
    tail: k.key.slice(-6),
    remaining: getCooldownRemaining(k),
  }));

  const minCooldown = cooling.length > 0
    ? Math.min(...cooling.map((k) => getCooldownRemaining(k)))
    : 0;

  return {
    total: pool.length,
    active,
    cooldown: cooling.length,
    minCooldown,
    cooldownKeys,
  };
};

module.exports = {
  loadKeys,
  saveKeys,
  getOptimalKey,
  addKey,
  removeKey,
  updateKeyStatus,
  incrementKeyErrors,
  incrementKeyUsage,
  getKeyPool,
  getSafeKeyPool,
  getCooldownRemaining,
  getPoolStatus,
};
