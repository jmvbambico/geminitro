const QuotaService = require("../services/quotaService");

describe("quotaService - Quota Groups", () => {
  test("should identify models in quota groups", () => {
    const quotaGroups = {
      "antigravity-claude": ["claude-sonnet-4-5", "claude-opus-4-5"],
      "gemini-pro": ["gemini-2.0-pro", "gemini-2.5-pro"],
    };

    const quotaService = new QuotaService(quotaGroups);

    const group1 = quotaService.findQuotaGroup("claude-sonnet-4-5");
    expect(group1).toEqual(["claude-sonnet-4-5", "claude-opus-4-5"]);

    const group2 = quotaService.findQuotaGroup("gemini-2.0-pro");
    expect(group2).toEqual(["gemini-2.0-pro", "gemini-2.5-pro"]);

    const group3 = quotaService.findQuotaGroup("unknown-model");
    expect(group3).toBeNull();
  });

  test("should return all models in group on quota error", () => {
    const quotaGroups = {
      "antigravity-claude": ["claude-sonnet-4-5", "claude-opus-4-5"],
    };

    const quotaService = new QuotaService(quotaGroups);

    const modelsToBlock = quotaService.handleQuotaError("key1", "claude-sonnet-4-5");
    expect(modelsToBlock).toEqual(["claude-sonnet-4-5", "claude-opus-4-5"]);
  });

  test("should return single model if not in quota group", () => {
    const quotaService = new QuotaService({});

    const modelsToBlock = quotaService.handleQuotaError("key1", "standalone-model");
    expect(modelsToBlock).toEqual(["standalone-model"]);
  });

  test("should handle empty quota groups", () => {
    const quotaService = new QuotaService({});

    expect(quotaService.findQuotaGroup("any-model")).toBeNull();
  });
});
