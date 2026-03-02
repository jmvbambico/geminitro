#!/usr/bin/env node
const fs = require("fs");
const _path = require("path");
const config = require("../../config");

/**
 * Migrate models.json from legacy array format to new object format.
 * Legacy: ["model1", "model2"]
 * New: { models: [...], aliases: {}, quotaGroups: {} }
 */
function migrateModelsJson() {
  const modelsFile = config.MODELS_FILE;

  if (!fs.existsSync(modelsFile)) {
    console.log("No models.json found - nothing to migrate");
    return;
  }

  try {
    const raw = fs.readFileSync(modelsFile, "utf8");
    const data = raw.trim() ? JSON.parse(raw) : [];

    // Already in new format
    if (data && typeof data === "object" && !Array.isArray(data)) {
      console.log("models.json already in new format");
      return;
    }

    // Legacy array format - migrate
    if (Array.isArray(data)) {
      const newData = {
        models: data,
        aliases: {},
        quotaGroups: {
          // Default Gemini CLI quota groups
          pro: ["gemini-2.5-pro", "gemini-3-pro-preview"],
          "flash-25": ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
          "flash-3": ["gemini-3-flash-preview"],
          // Default Antigravity quota groups
          claude: [
            "claude-sonnet-4-5",
            "claude-sonnet-4-6",
            "claude-opus-4-5",
            "claude-opus-4-6-thinking",
            "gpt-oss-120b-medium",
          ],
          "gemini-3-pro": ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3-pro-preview"],
          "gemini-25-flash": [
            "gemini-2.5-flash",
            "gemini-2.5-flash-thinking",
            "gemini-2.5-flash-lite",
          ],
        },
      };

      // Backup old file
      const backupFile = modelsFile + `.backup.${Date.now()}`;
      fs.copyFileSync(modelsFile, backupFile);
      console.log(`Backed up old models.json to: ${backupFile}`);

      // Write new format
      fs.writeFileSync(modelsFile, JSON.stringify(newData, null, 2));
      console.log(`Migrated models.json to new format (${data.length} models)`);
      console.log(`Added ${Object.keys(newData.quotaGroups).length} default quota groups`);
    }
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  migrateModelsJson();
}

module.exports = { migrateModelsJson };
