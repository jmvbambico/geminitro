const keyService = require("../services/keyService");

describe("keyService - Priority Tiers", () => {
  test("should calculate concurrency limit with multiplier", () => {
    const baseConcurrency = 3;
    const premiumMultiplier = 2.0; // Premium gets 2x concurrency

    const standardLimit = keyService.getConcurrencyLimit("standard", baseConcurrency);
    const premiumLimit = keyService.getConcurrencyLimit("premium", baseConcurrency);

    expect(standardLimit).toBe(baseConcurrency); // 3
    expect(premiumLimit).toBe(baseConcurrency * premiumMultiplier); // 6
  });

  test("should apply different multipliers for each tier", () => {
    const baseConcurrency = 5;

    expect(keyService.getConcurrencyLimit("free", baseConcurrency)).toBe(
      Math.floor(baseConcurrency * 0.5),
    ); // 2 (0.5x)
    expect(keyService.getConcurrencyLimit("standard", baseConcurrency)).toBe(baseConcurrency); // 5 (1x)
    expect(keyService.getConcurrencyLimit("premium", baseConcurrency)).toBe(baseConcurrency * 2); // 10 (2x)
    expect(keyService.getConcurrencyLimit("enterprise", baseConcurrency)).toBe(baseConcurrency * 3); // 15 (3x)
  });

  test("should default to standard multiplier for unknown tiers", () => {
    const baseConcurrency = 4;
    const unknownLimit = keyService.getConcurrencyLimit("unknown-tier", baseConcurrency);

    expect(unknownLimit).toBe(baseConcurrency); // Defaults to 1x
  });

  test("should support fractional multipliers", () => {
    const baseConcurrency = 10;

    // Free tier: 0.5x = 5
    expect(keyService.getConcurrencyLimit("free", baseConcurrency)).toBe(5);

    // Ensure floor is applied (0.5 * 7 = 3.5 → 3)
    expect(keyService.getConcurrencyLimit("free", 7)).toBe(3);
  });
});
