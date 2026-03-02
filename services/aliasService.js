const geminiService = require("./geminiService");
const logger = require("../utils/logger");

/**
 * Resolve a model alias to its target model name.
 * @param {string} modelName - The potentially aliased model name
 * @returns {string} The resolved model name
 */
const resolveAlias = (modelName) => {
  if (!modelName) return modelName;

  try {
    const { aliases } = geminiService.getModelsData();

    // Check if this model name is an alias
    if (aliases && aliases[modelName]) {
      const target = aliases[modelName];
      logger.info(`Resolved alias: ${modelName} → ${target}`);
      return target;
    }

    // Not an alias - return as-is
    return modelName;
  } catch (error) {
    logger.warn(`Failed to resolve alias for ${modelName}: ${error.message}`);
    return modelName;
  }
};

/**
 * Add or update an alias.
 * @param {string} alias - The alias name
 * @param {string} target - The target model name
 */
const addAlias = async (alias, target) => {
  const { aliases } = geminiService.getModelsData();
  aliases[alias] = target;
  await geminiService.updateAliases(aliases);
  logger.info(`Added alias: ${alias} → ${target}`);
};

/**
 * Remove an alias.
 * @param {string} alias - The alias name to remove
 */
const removeAlias = async (alias) => {
  const { aliases } = geminiService.getModelsData();
  if (aliases[alias]) {
    delete aliases[alias];
    await geminiService.updateAliases(aliases);
    logger.info(`Removed alias: ${alias}`);
    return true;
  }
  return false;
};

/**
 * List all aliases.
 * @returns {object} All alias mappings
 */
const listAliases = () => {
  const { aliases } = geminiService.getModelsData();
  return aliases || {};
};

module.exports = {
  resolveAlias,
  addAlias,
  removeAlias,
  listAliases,
};
