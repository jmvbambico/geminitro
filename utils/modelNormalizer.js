/**
 * Convert model name to Proper Case (Title Case).
 * Examples:
 *   "gemini-2.0-flash" -> "Gemini 2.0 Flash"
 *   "claude-opus-4-5-thinking" -> "Claude Opus 4.5 Thinking"
 *   "gpt-oss-120b-medium" -> "GPT-OSS 120B Medium"
 */
const toProperCase = (modelName) => {
  if (!modelName) return modelName;

  // Special handling for known acronyms
  const acronyms = new Set(["gpt", "oss", "tts", "it"]);

  return modelName
    .split("-")
    .map((part) => {
      // Keep version numbers as-is (e.g., "2.0", "4.5", "120b")
      if (/^\d+(\.\d+)?[a-z]?$/i.test(part)) {
        return part.toUpperCase();
      }

      // Uppercase known acronyms
      if (acronyms.has(part.toLowerCase())) {
        return part.toUpperCase();
      }

      // Proper case for regular words
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
};

/**
 * Convert Proper Case back to kebab-case for API calls.
 * Examples:
 *   "Gemini 2.0 Flash" -> "gemini-2.0-flash"
 *   "Claude Opus 4.5 Thinking" -> "claude-opus-4-5-thinking"
 */
const toKebabCase = (properCaseName) => {
  if (!properCaseName) return properCaseName;

  return properCaseName.toLowerCase().replace(/\s+/g, "-");
};

/**
 * Normalize a model name array to Proper Case.
 */
const normalizeModelArray = (models) => {
  if (!Array.isArray(models)) return [];
  return models.map(toProperCase);
};

/**
 * Create a bidirectional mapping of Proper Case <-> kebab-case.
 */
const createModelMapping = (models) => {
  const mapping = {
    toProper: {}, // kebab-case -> Proper Case
    toKebab: {}, // Proper Case -> kebab-case
  };

  for (const model of models) {
    const proper = toProperCase(model);
    const kebab = model.toLowerCase();

    mapping.toProper[kebab] = proper;
    mapping.toKebab[proper] = kebab;
  }

  return mapping;
};

module.exports = {
  toProperCase,
  toKebabCase,
  normalizeModelArray,
  createModelMapping,
};
