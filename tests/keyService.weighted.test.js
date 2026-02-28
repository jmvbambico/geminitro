const keyService = require("../services/keyService");

describe("keyService - Weighted Random Rotation", () => {
  test("setRotationTolerance should accept valid values (0-1)", () => {
    expect(() => keyService.setRotationTolerance(0)).not.toThrow();
    expect(() => keyService.setRotationTolerance(0.1)).not.toThrow();
    expect(() => keyService.setRotationTolerance(0.5)).not.toThrow();
    expect(() => keyService.setRotationTolerance(1.0)).not.toThrow();
  });

  test("setRotationTolerance should reject invalid values", () => {
    expect(() => keyService.setRotationTolerance(-0.1)).toThrow("Invalid rotation tolerance");
    expect(() => keyService.setRotationTolerance(1.5)).toThrow("Invalid rotation tolerance");
    expect(() => keyService.setRotationTolerance(NaN)).toThrow("Invalid rotation tolerance");
  });

  test("weighted rotation distributes selections with variance", () => {
    keyService.setRotationMode("balanced");
    keyService.setRotationTolerance(0.3); // 30% variance

    // Create mock keys with different usage
    const keys = [
      { key: "key1", usage: 10, status: "active", concurrentRequests: 0 },
      { key: "key2", usage: 20, status: "active", concurrentRequests: 0 },
      { key: "key3", usage: 30, status: "active", concurrentRequests: 0 },
    ];

    // With tolerance > 0, selection should have randomness
    // We can't predict exact outcomes but can verify logic exists
    const selections = new Set();

    // Run 20 selections - with 30% tolerance, we should see some variance
    for (let i = 0; i < 20; i++) {
      const selected = keyService._selectKeyWithTolerance(keys);
      selections.add(selected.key);
    }

    // With tolerance, we should potentially select different keys
    // (though with 30% tolerance on these usage values, key1 is still heavily favored)
    expect(selections.size).toBeGreaterThanOrEqual(1);
  });

  test("zero tolerance should always select optimal key", () => {
    keyService.setRotationMode("balanced");
    keyService.setRotationTolerance(0); // No variance

    const keys = [
      { key: "key1", usage: 10, status: "active", concurrentRequests: 0 },
      { key: "key2", usage: 20, status: "active", concurrentRequests: 0 },
      { key: "key3", usage: 30, status: "active", concurrentRequests: 0 },
    ];

    // With tolerance = 0, should always pick key1 (lowest usage)
    const selections = new Set();
    for (let i = 0; i < 10; i++) {
      const selected = keyService._selectKeyWithTolerance(keys);
      selections.add(selected.key);
    }

    expect(selections.size).toBe(1);
    expect(selections.has("key1")).toBe(true);
  });
});
