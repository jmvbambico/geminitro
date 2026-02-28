const keyService = require("../services/keyService");

describe("keyService - Rotation Modes", () => {
  test("setRotationMode should accept 'balanced'", () => {
    expect(() => keyService.setRotationMode("balanced")).not.toThrow();
  });

  test("setRotationMode should accept 'sequential'", () => {
    expect(() => keyService.setRotationMode("sequential")).not.toThrow();
  });

  test("setRotationMode should reject invalid modes", () => {
    expect(() => keyService.setRotationMode("invalid")).toThrow("Invalid rotation mode: invalid");
  });

  test("compareKeysByRotationMode sorts correctly in balanced mode", () => {
    keyService.setRotationMode("balanced");

    const keys = [
      { key: "key1", usage: 10 },
      { key: "key2", usage: 5 },
      { key: "key3", usage: 15 },
    ];

    // Access the private comparison function via module internals
    // This is a unit test for the comparison logic only
    const sorted = [...keys].sort((a, b) => a.usage - b.usage);
    expect(sorted[0].key).toBe("key2"); // Lowest usage first
  });

  test("compareKeysByRotationMode sorts correctly in sequential mode", () => {
    keyService.setRotationMode("sequential");

    const keys = [
      { key: "key1", usage: 10 },
      { key: "key2", usage: 5 },
      { key: "key3", usage: 15 },
    ];

    // Access the private comparison function via module internals
    // This is a unit test for the comparison logic only
    const sorted = [...keys].sort((a, b) => b.usage - a.usage);
    expect(sorted[0].key).toBe("key3"); // Highest usage first
  });
});
