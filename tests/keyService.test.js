const { getCooldownDuration } = require("../services/keyService");

describe("keyService - Escalating Cooldowns", () => {
  test("should return 10s for first failure", () => {
    expect(getCooldownDuration(1)).toBe(10);
  });

  test("should return 30s for second failure", () => {
    expect(getCooldownDuration(2)).toBe(30);
  });

  test("should return 60s for third failure", () => {
    expect(getCooldownDuration(3)).toBe(60);
  });

  test("should cap at 120s for 4+ failures", () => {
    expect(getCooldownDuration(4)).toBe(120);
    expect(getCooldownDuration(10)).toBe(120);
  });

  test("should handle zero/negative gracefully", () => {
    expect(getCooldownDuration(0)).toBe(10);
    expect(getCooldownDuration(-1)).toBe(10);
  });
});
