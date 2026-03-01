const logger = require("../utils/logger");

/**
 * Quota Service for managing shared quota across model groups.
 * Models in the same quota group (e.g., Claude Sonnet/Opus on Antigravity)
 * share quota limits and cool down together when one hits a rate limit.
 */
class QuotaService {
  /**
   * @param {object} quotaGroups - Map of group names to model arrays
   * Example: { 'antigravity-claude': ['claude-sonnet-4-5', 'claude-opus-4-5'] }
   */
  constructor(quotaGroups = {}) {
    this.quotaGroups = quotaGroups;
  }

  /**
   * Find the quota group that contains a given model.
   * @param {string} model - Model identifier
   * @returns {string[]|null} Array of models in the same quota group, or null if not grouped
   */
  findQuotaGroup(model) {
    for (const [_groupName, models] of Object.entries(this.quotaGroups)) {
      if (models.includes(model)) {
        return models;
      }
    }
    return null;
  }

  /**
   * Handle a quota error for a model. Returns all models that should be blocked.
   * If the model is in a quota group, all models in the group are returned.
   * @param {string} credentialPath - Credential identifier (for future per-credential tracking)
   * @param {string} model - Model that triggered the quota error
   * @returns {string[]} Array of models to block/cool down
   */
  handleQuotaError(credentialPath, model) {
    const group = this.findQuotaGroup(model);
    if (!group) {
      // No quota group - just cool down this model
      return [model];
    }

    // Cool down all models in the quota group
    logger.info(`Quota limit hit for ${model} - cooling down entire group: ${group.join(", ")}`);
    return group;
  }
}

module.exports = QuotaService;
