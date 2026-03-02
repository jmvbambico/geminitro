const geminiService = require("./geminiService");
const logger = require("../utils/logger");

/**
 * Get all quota groups.
 * @returns {object} Quota groups mapping
 */
const getQuotaGroups = () => {
  const { quotaGroups } = geminiService.getModelsData();
  return quotaGroups || {};
};

/**
 * Add or update a quota group.
 * @param {string} groupName - The group name
 * @param {string[]} models - Array of model names in this group
 */
const addQuotaGroup = async (groupName, models) => {
  const { quotaGroups } = geminiService.getModelsData();
  quotaGroups[groupName] = models;
  await geminiService.updateQuotaGroups(quotaGroups);
  logger.info(`Added quota group: ${groupName} with ${models.length} models`);
};

/**
 * Remove a quota group.
 * @param {string} groupName - The group name to remove
 */
const removeQuotaGroup = async (groupName) => {
  const { quotaGroups } = geminiService.getModelsData();
  if (quotaGroups[groupName]) {
    delete quotaGroups[groupName];
    await geminiService.updateQuotaGroups(quotaGroups);
    logger.info(`Removed quota group: ${groupName}`);
    return true;
  }
  return false;
};

/**
 * Get the quota group for a specific model.
 * @param {string} model - The model name
 * @returns {string|null} The group name or null if not in a group
 */
const getGroupForModel = (model) => {
  const quotaGroups = getQuotaGroups();
  for (const [groupName, models] of Object.entries(quotaGroups)) {
    if (models.includes(model)) {
      return groupName;
    }
  }
  return null;
};

/**
 * Get all models in the same quota group as the given model.
 * @param {string} model - The model name
 * @returns {string[]} Array of models in the same group (including the input model)
 */
const getModelsInGroup = (model) => {
  const quotaGroups = getQuotaGroups();
  for (const models of Object.values(quotaGroups)) {
    if (models.includes(model)) {
      return models;
    }
  }
  return [model]; // Return just the model if not in a group
};

module.exports = {
  getQuotaGroups,
  addQuotaGroup,
  removeQuotaGroup,
  getGroupForModel,
  getModelsInGroup,
};
