const keyService = require("../services/keyService");
const Semaphore = require("../services/semaphore");
const fs = require("fs");
const path = require("path");
const config = require("../config");

describe("keyService - cross-source routing", () => {
  const testKeysFile = path.join(config.DATA_DIR, "keys.json");
  const originalKeys = fs.existsSync(testKeysFile) ? fs.readFileSync(testKeysFile, "utf8") : null;

  // Helper to add keys directly to pool (bypassing async OAuth calls)
  const addTestKey = (keyConfig) => {
    const pool = keyService._getKeyPoolDirect(); // Direct reference, not copy
    pool.push({
      key: keyConfig.key,
      type: keyConfig.type || "api_key",
      email: keyConfig.email || null,
      source: keyConfig.source || null,
      priorityTier: "standard",
      status: keyConfig.status || "active",
      usage: 0,
      errors: 0,
      failureCount: 0,
      failuresByModel: {},
      concurrentRequests: 0,
      semaphore: new Semaphore(config.MAX_CONCURRENT_REQUESTS_PER_KEY),
      // Set lastUsed to now for cooldown keys (prevents auto-recovery)
      lastUsed: keyConfig.status === "cooldown" ? Date.now() : 0,
      supportedModels: keyConfig.supportedModels || [],
    });
  };

  beforeEach(() => {
    // Clean slate
    if (fs.existsSync(testKeysFile)) {
      fs.unlinkSync(testKeysFile);
    }
    // Clear key pool
    const pool = keyService._getKeyPoolDirect();
    pool.length = 0;
  });

  afterAll(() => {
    // Restore original keys
    if (originalKeys) {
      fs.writeFileSync(testKeysFile, originalKeys);
    } else if (fs.existsSync(testKeysFile)) {
      fs.unlinkSync(testKeysFile);
    }
  });

  test("should prefer API keys over OAuth when both have the model", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-refresh-token-1",
      type: "oauth",
      source: "antigravity",
      email: "user@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.0 Flash");

    expect(keyObj).not.toBeNull();
    expect(keyObj.type).toBe("api_key");
    expect(keyObj.key).toBe("test-api-key-1");
  });

  test("should fallback to OAuth when API keys exhausted", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      status: "cooldown",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-refresh-token-1",
      type: "oauth",
      source: "antigravity",
      email: "user@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.0 Flash");

    expect(keyObj).not.toBeNull();
    expect(keyObj.type).toBe("oauth");
    expect(keyObj.source).toBe("antigravity");
    expect(keyObj.email).toBe("user@example.com");
  });

  test("should prefer Antigravity over Gemini CLI when API keys exhausted", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      status: "cooldown",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-antigravity-token",
      type: "oauth",
      source: "antigravity",
      email: "antigravity@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-gemini-cli-token",
      type: "oauth",
      source: "gemini_cli",
      email: "geminicli@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.0 Flash");

    expect(keyObj).not.toBeNull();
    expect(keyObj.type).toBe("oauth");
    expect(keyObj.source).toBe("antigravity");
    expect(keyObj.email).toBe("antigravity@example.com");
  });

  test("should fallback to Gemini CLI when API keys and Antigravity exhausted", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      status: "cooldown",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-antigravity-token",
      type: "oauth",
      source: "antigravity",
      status: "cooldown",
      email: "antigravity@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-gemini-cli-token",
      type: "oauth",
      source: "gemini_cli",
      email: "geminicli@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.0 Flash");

    expect(keyObj).not.toBeNull();
    expect(keyObj.type).toBe("oauth");
    expect(keyObj.source).toBe("gemini_cli");
    expect(keyObj.email).toBe("geminicli@example.com");
  });

  test("should return null when all sources exhausted", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      status: "cooldown",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-antigravity-token",
      type: "oauth",
      source: "antigravity",
      status: "cooldown",
      email: "antigravity@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-gemini-cli-token",
      type: "oauth",
      source: "gemini_cli",
      status: "cooldown",
      email: "geminicli@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.0 Flash");

    expect(keyObj).toBeNull();
  });

  test("should skip sources that don't support the model", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      supportedModels: ["Gemini 2.0 Flash"], // doesn't have Pro
    });
    addTestKey({
      key: "test-antigravity-token",
      type: "oauth",
      source: "antigravity",
      email: "antigravity@example.com",
      supportedModels: ["Gemini 2.5 Pro"], // has Pro
    });
    addTestKey({
      key: "test-gemini-cli-token",
      type: "oauth",
      source: "gemini_cli",
      email: "geminicli@example.com",
      supportedModels: ["Gemini 2.0 Flash"], // doesn't have Pro
    });

    const keyObj = await keyService.getOptimalKeyWithDiscovery([], "Gemini 2.5 Pro");

    expect(keyObj).not.toBeNull();
    expect(keyObj.type).toBe("oauth");
    expect(keyObj.source).toBe("antigravity");
    expect(keyObj.email).toBe("antigravity@example.com");
  });

  test("should respect keyType parameter when specified", async () => {
    addTestKey({
      key: "test-api-key-1",
      type: "api_key",
      supportedModels: ["Gemini 2.0 Flash"],
    });
    addTestKey({
      key: "test-oauth-token",
      type: "oauth",
      source: "antigravity",
      email: "oauth@example.com",
      supportedModels: ["Gemini 2.0 Flash"],
    });

    // Force OAuth only
    const oauthKeyObj = await keyService.getOptimalKeyWithDiscovery(
      [],
      "Gemini 2.0 Flash",
      "oauth",
    );

    expect(oauthKeyObj).not.toBeNull();
    expect(oauthKeyObj.type).toBe("oauth");

    // Force API key only
    const apiKeyObj = await keyService.getOptimalKeyWithDiscovery(
      [],
      "Gemini 2.0 Flash",
      "api_key",
    );

    expect(apiKeyObj).not.toBeNull();
    expect(apiKeyObj.type).toBe("api_key");
  });
});
