const statsService = require("../services/statsService");

describe("statsService - Unified Model Statistics", () => {
  beforeEach(() => {
    // Reset stats for clean test state
    statsService.resetStats();
  });

  test("should track usage per model across different account types", () => {
    // Simulate requests from different account types
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1");
    statsService.recordRequest("gemini-2.0-flash", "oauth", "antigravity-user1");
    statsService.recordRequest("gemini-2.0-flash", "oauth", "gemini-cli-user2");
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-2");

    const modelStats = statsService.getModelStats();

    // Should aggregate all requests for gemini-2.0-flash regardless of account type
    expect(modelStats["gemini-2.0-flash"]).toBeDefined();
    expect(modelStats["gemini-2.0-flash"].totalRequests).toBe(4);
    expect(modelStats["gemini-2.0-flash"].accountTypes).toEqual({
      api_key: 2,
      oauth: 2,
    });
  });

  test("should track usage per model per account type", () => {
    statsService.recordRequest("claude-sonnet-4-5", "oauth", "antigravity-1");
    statsService.recordRequest("claude-sonnet-4-5", "oauth", "antigravity-2");
    statsService.recordRequest("claude-opus-4-5", "oauth", "antigravity-1");

    const modelStats = statsService.getModelStats();

    expect(modelStats["claude-sonnet-4-5"].totalRequests).toBe(2);
    expect(modelStats["claude-opus-4-5"].totalRequests).toBe(1);
    expect(modelStats["claude-sonnet-4-5"].accountTypes.oauth).toBe(2);
  });

  test("should provide unified quota view across all accounts", () => {
    // Record various requests
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1");
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1");
    statsService.recordRequest("gemini-2.0-flash", "oauth", "agy-user");
    statsService.recordRequest("claude-sonnet-4-5", "oauth", "agy-user");

    const unifiedStats = statsService.getUnifiedStats();

    // Should have model-level aggregates
    expect(unifiedStats.byModel["gemini-2.0-flash"]).toBe(3);
    expect(unifiedStats.byModel["claude-sonnet-4-5"]).toBe(1);
    expect(unifiedStats.totalRequests).toBe(4);
  });

  test("should track errors per model per account type", () => {
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1");
    statsService.recordError("gemini-2.0-flash", "api_key", "key-1", "Rate limit");

    const modelStats = statsService.getModelStats();

    expect(modelStats["gemini-2.0-flash"].totalRequests).toBe(1);
    expect(modelStats["gemini-2.0-flash"].errors).toBe(1);
    expect(modelStats["gemini-2.0-flash"].errorRate).toBeCloseTo(1.0);
  });

  test("should support querying stats by time range", () => {
    const now = Date.now();

    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1", now - 3600000); // 1h ago
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1", now - 1800000); // 30m ago
    statsService.recordRequest("gemini-2.0-flash", "api_key", "key-1", now); // now

    const lastHourStats = statsService.getModelStats({ since: now - 3600000 });
    const last30MinStats = statsService.getModelStats({ since: now - 1800000 });

    expect(lastHourStats["gemini-2.0-flash"].totalRequests).toBe(3);
    expect(last30MinStats["gemini-2.0-flash"].totalRequests).toBe(2);
  });
});
