const keyService = require("../services/keyService");
const geminiService = require("../services/geminiService");

// Mock geminiService.fetchModelsForKey
jest.mock("../services/geminiService", () => ({
  ...jest.requireActual("../services/geminiService"),
  fetchModelsForKey: jest.fn(),
}));

describe("keyService - dynamic model discovery", () => {
  beforeEach(() => {
    // Clear any existing keys
    while (keyService.getKeyPool().length > 0) {
      const key = keyService.getKeyPool()[0];
      keyService.removeKey(key.key.slice(-6));
    }
    jest.clearAllMocks();
  });

  test("should use cached supportedModels when model is known", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash", "gemini-2.5-pro"],
    });

    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-2.0-flash");

    expect(key).not.toBeNull();
    expect(key.key).toBe("test-key-1");
    // Should NOT trigger dynamic discovery
    expect(geminiService.fetchModelsForKey).not.toHaveBeenCalled();
  });

  test("should trigger dynamic discovery when model is unknown", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"], // Does NOT include gemini-2.0-flash-exp
    });

    // Mock fetchModelsForKey to return models including the experimental one
    geminiService.fetchModelsForKey.mockResolvedValue([
      "gemini-2.0-flash",
      "gemini-2.0-flash-exp",
      "gemini-2.5-pro",
    ]);

    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-2.0-flash-exp");

    expect(key).not.toBeNull();
    expect(key.key).toBe("test-key-1");
    // Should trigger dynamic discovery
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledTimes(1);
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledWith(
      expect.objectContaining({ key: "test-key-1" }),
    );
    // Should update supportedModels
    expect(key.supportedModels).toContain("gemini-2.0-flash-exp");
  });

  test("should return null when dynamic discovery fails to find model", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"],
    });

    // Mock fetchModelsForKey to return models NOT including the requested one
    geminiService.fetchModelsForKey.mockResolvedValue(["gemini-2.0-flash", "gemini-2.5-pro"]);

    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-3-ultra-nonexistent");

    expect(key).toBeNull();
    expect(geminiService.fetchModelsForKey).toHaveBeenCalled();
  });

  test("should try multiple keys during dynamic discovery", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"],
    });
    keyService.addKey("test-key-2", {
      type: "api_key",
      models: ["gemini-2.5-pro"],
    });

    // Mock: key-1 doesn't have the model, key-2 does
    geminiService.fetchModelsForKey
      .mockResolvedValueOnce(["gemini-2.0-flash"]) // key-1
      .mockResolvedValueOnce(["gemini-2.5-pro", "gemini-2.0-flash-exp"]); // key-2

    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-2.0-flash-exp");

    expect(key).not.toBeNull();
    expect(key.key).toBe("test-key-2");
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledTimes(2);
  });

  test("should respect excludeKeys during dynamic discovery", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"],
    });
    keyService.addKey("test-key-2", {
      type: "api_key",
      models: ["gemini-2.5-pro"],
    });

    geminiService.fetchModelsForKey.mockResolvedValue(["gemini-2.0-flash", "gemini-2.0-flash-exp"]);

    const key = await keyService.getOptimalKeyWithDiscovery(["test-key-1"], "gemini-2.0-flash-exp");

    expect(key).not.toBeNull();
    expect(key.key).toBe("test-key-2");
    // Should only call for key-2 (key-1 is excluded)
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledTimes(1);
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledWith(
      expect.objectContaining({ key: "test-key-2" }),
    );
  });

  test("should handle fetchModelsForKey errors gracefully", async () => {
    keyService.addKey("test-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"],
    });
    keyService.addKey("test-key-2", {
      type: "api_key",
      models: ["gemini-2.5-pro"],
    });

    // Mock: key-1 throws error, key-2 succeeds
    geminiService.fetchModelsForKey
      .mockRejectedValueOnce(new Error("Network timeout"))
      .mockResolvedValueOnce(["gemini-2.5-pro", "gemini-2.0-flash-exp"]);

    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-2.0-flash-exp");

    expect(key).not.toBeNull();
    expect(key.key).toBe("test-key-2");
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledTimes(2);
  });

  test("should respect keyType filter during dynamic discovery", async () => {
    keyService.addKey("api-key-1", {
      type: "api_key",
      models: ["gemini-2.0-flash"],
    });
    keyService.addOAuthToken("oauth-token-1", "antigravity", "test@example.com");

    geminiService.fetchModelsForKey.mockResolvedValue(["gemini-2.0-flash", "gemini-2.0-flash-exp"]);

    // Request api_key type only
    const key = await keyService.getOptimalKeyWithDiscovery([], "gemini-2.0-flash-exp", "api_key");

    expect(key).not.toBeNull();
    expect(key.key).toBe("api-key-1");
    // Should only try api_key type
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledTimes(1);
    expect(geminiService.fetchModelsForKey).toHaveBeenCalledWith(
      expect.objectContaining({ type: "api_key" }),
    );
  });
});
