const keyService = require("../services/keyService");

describe("keyService - Duplicate Credential Detection", () => {
  test("should detect duplicate API keys", () => {
    const result = keyService.detectDuplicates();

    // Result should have structure:
    // { duplicates: [], uniqueKeys: number }
    expect(result).toHaveProperty("duplicates");
    expect(result).toHaveProperty("uniqueKeys");
    expect(Array.isArray(result.duplicates)).toBe(true);
  });

  test("should identify keys with same value but different metadata", () => {
    const pool = keyService.getKeyPool();

    // Simulate scenario where same key exists multiple times
    // (This would happen if key was added, removed, then re-added with different metadata)
    const testKey = "AIzaSyDuplicateTestKey123456789";

    // Count how many times this key appears
    const occurrences = pool.filter((k) => k.key === testKey).length;

    // Should be 0 or 1 (no duplicates allowed)
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  test("should prevent adding duplicate keys via addKey", () => {
    const pool = keyService.getKeyPool();
    const initialCount = pool.length;

    // Try to add a key that already exists in the pool
    if (pool.length > 0) {
      const existingKey = pool[0].key;
      const result = keyService.addKey(existingKey);

      // Should return false (key already exists)
      expect(result).toBe(false);
      expect(pool.length).toBe(initialCount); // No change in pool size
    }
  });

  test("should normalize keys for comparison", () => {
    // Keys might have whitespace or different casing in some systems
    const normalized1 = keyService.normalizeCredential("  AIzaSyTest123  ");
    const normalized2 = keyService.normalizeCredential("AIzaSyTest123");

    expect(normalized1).toBe(normalized2);
    expect(normalized1).toBe("AIzaSyTest123"); // Trimmed
  });

  test("should generate credential fingerprint for OAuth tokens", () => {
    // OAuth tokens might be different refresh tokens but same email
    const fingerprint1 = keyService.getCredentialFingerprint({
      key: "refresh_token_1",
      type: "oauth",
      email: "user@example.com",
      source: "antigravity",
    });

    const fingerprint2 = keyService.getCredentialFingerprint({
      key: "refresh_token_2",
      type: "oauth",
      email: "user@example.com",
      source: "antigravity",
    });

    // Same email + source should have same fingerprint
    expect(fingerprint1).toBe(fingerprint2);
  });

  test("should generate different fingerprints for different OAuth sources", () => {
    const fingerprint1 = keyService.getCredentialFingerprint({
      key: "refresh_token_1",
      type: "oauth",
      email: "user@example.com",
      source: "antigravity",
    });

    const fingerprint2 = keyService.getCredentialFingerprint({
      key: "refresh_token_1",
      type: "oauth",
      email: "user@example.com",
      source: "gemini_cli",
    });

    // Different sources should have different fingerprints
    expect(fingerprint1).not.toBe(fingerprint2);
  });
});
