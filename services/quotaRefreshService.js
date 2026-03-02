const _config = require("../config");
const logger = require("../utils/logger");
const oauthService = require("./oauthService");
const keyService = require("./keyService");

const REFRESH_INTERVAL = parseInt(process.env.QUOTA_REFRESH_INTERVAL) || 300000; // 5 minutes

// Store quota baselines per key per model
// Structure: { keyId: { modelId: { remaining: 0.94, fetchedAt: timestamp, maxRequests: 250 } } }
const quotaBaselines = new Map();

/**
 * Fetch quota status from Google's retrieveUserQuota API for OAuth keys.
 * @param {string} refreshToken - The OAuth refresh token
 * @param {string} provider - Provider type ("gemini_cli" or "antigravity")
 * @returns {Promise<object>} Quota data: { buckets: [{ modelId, remainingFraction, quotaResetTimeStamp }] }
 */
async function fetchQuotaStatus(refreshToken, provider) {
  try {
    const { accessToken } = await oauthService.getAccessTokenFromRefreshToken(
      refreshToken,
      provider,
    );

    const endpoint = "https://daily-cloudcode-pa.sandbox.googleapis.com";
    const url = `${endpoint}/v1internal:retrieveUserQuota`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "User-Agent": "antigravity/1.15.8 windows/amd64",
        "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
        Client_Metadata: JSON.stringify({
          ideType: "ANTIGRAVITY",
          platform: process.platform === "darwin" ? "MACOS" : "LINUX",
          pluginType: "GEMINI",
        }),
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Quota fetch failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.warn(`Failed to fetch quota for ${provider}: ${error.message}`);
    return null;
  }
}

/**
 * Update quota baselines for a specific key.
 * @param {string} keyId - The key identifier
 * @param {object} quotaData - Data from retrieveUserQuota
 */
function updateBaseline(keyId, quotaData) {
  if (!quotaData || !Array.isArray(quotaData.buckets)) {
    return;
  }

  const keyBaselines = quotaBaselines.get(keyId) || {};
  const now = Date.now();

  for (const bucket of quotaData.buckets) {
    if (!bucket.modelId) continue;

    keyBaselines[bucket.modelId] = {
      remaining: bucket.remainingFraction || 0,
      fetchedAt: now,
      resetAt: bucket.quotaResetTimeStamp ? new Date(bucket.quotaResetTimeStamp).getTime() : null,
      maxRequests: bucket.quotaMaxRequests || null,
    };
  }

  quotaBaselines.set(keyId, keyBaselines);
  logger.info(
    `Updated quota baselines for key ${keyId.slice(-6)}: ${quotaData.buckets.length} models`,
  );
}

/**
 * Get quota baseline for a specific key and model.
 * @param {string} keyId - The key identifier
 * @param {string} model - The model name
 * @returns {object|null} Baseline data or null if not available
 */
function getBaseline(keyId, model) {
  const keyBaselines = quotaBaselines.get(keyId);
  if (!keyBaselines) return null;
  return keyBaselines[model] || null;
}

/**
 * Background job: refresh quota for all active OAuth keys.
 */
async function refreshAllQuota() {
  const pool = keyService.getKeyPool();
  const oauthKeys = pool.filter((k) => k.type === "oauth");

  if (oauthKeys.length === 0) {
    logger.info("No OAuth keys to refresh quota for");
    return;
  }

  logger.info(`Refreshing quota for ${oauthKeys.length} OAuth keys...`);

  for (const keyObj of oauthKeys) {
    try {
      const provider = keyObj.source || "antigravity";
      const quotaData = await fetchQuotaStatus(keyObj.key, provider);

      if (quotaData) {
        updateBaseline(keyObj.key, quotaData);
      }
    } catch (error) {
      logger.warn(`Quota refresh failed for key ${keyObj.key.slice(-6)}: ${error.message}`);
    }
  }
}

/**
 * Start the background quota refresh timer.
 */
let refreshTimer = null;

function startQuotaRefresh() {
  if (refreshTimer) {
    logger.warn("Quota refresh timer already running");
    return;
  }

  logger.info(`Starting quota refresh background job (every ${REFRESH_INTERVAL / 1000}s)`);

  // Run immediately on startup
  refreshAllQuota().catch((error) => {
    logger.error(`Initial quota refresh failed: ${error.message}`);
  });

  // Then run on interval
  refreshTimer = setInterval(() => {
    refreshAllQuota().catch((error) => {
      logger.error(`Quota refresh failed: ${error.message}`);
    });
  }, REFRESH_INTERVAL);
}

/**
 * Stop the background quota refresh timer.
 */
function stopQuotaRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    logger.info("Stopped quota refresh background job");
  }
}

module.exports = {
  startQuotaRefresh,
  stopQuotaRefresh,
  refreshAllQuota,
  getBaseline,
  fetchQuotaStatus,
  updateBaseline,
};
