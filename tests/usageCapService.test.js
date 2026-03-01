const usageCapService = require("../services/usageCapService");
const fs = require("fs");
const path = require("path");

// Mock dependencies
jest.mock("fs");
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  getIo: jest.fn(() => ({
    emit: jest.fn(),
  })),
}));

describe("usageCapService", () => {
  const mockDataDir = "/mock/data";
  const mockCapsFile = path.join(mockDataDir, "usage_caps.json");

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset service state completely
    usageCapService.resetForTesting();

    // Mock fs.existsSync
    fs.existsSync.mockImplementation((filePath) => {
      if (filePath === mockDataDir) return true;
      if (filePath === mockCapsFile) return false;
      return false;
    });

    // Mock fs.writeFileSync
    fs.writeFileSync.mockImplementation(() => {});

    // Mock fs.readFileSync
    fs.readFileSync.mockImplementation(() => "{}");
  });

  afterEach(() => {
    jest.useRealTimers();
    usageCapService.resetForTesting();
  });

  describe("Per-Account Tracking", () => {
    test("should track usage per account for the same model", () => {
      // Add a cap for gemini-2.0-flash
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        period: "daily",
        alertThreshold: 80,
        enabled: true,
      });

      // Increment usage for two different accounts
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2");

      const progress = usageCapService.getCapProgress("gemini-2.0-flash");

      // Combined usage should be 3 (2 from account1 + 1 from account2)
      expect(progress.current).toBe(3);
      expect(progress.limit).toBe(100);
      expect(progress.percentage).toBe(3);
    });

    test("should aggregate usage across multiple accounts for cap checking", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 5,
        period: "daily",
        enabled: true,
      });

      // Add usage from 3 different accounts
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2");
      usageCapService.incrementUsage("gemini-2.0-flash", "account3");
      usageCapService.incrementUsage("gemini-2.0-flash", "account3");

      // Combined usage: 2 + 1 + 2 = 5 (at cap)
      expect(usageCapService.isAtCap("gemini-2.0-flash")).toBe(true);

      const progress = usageCapService.getCapProgress("gemini-2.0-flash");
      expect(progress.current).toBe(5);
      expect(progress.atCap).toBe(true);
    });

    test("should handle models/ prefix in model names", () => {
      usageCapService.addOrUpdateCap({
        model: "models/gemini-2.0-flash",
        limit: 50,
        enabled: true,
      });

      usageCapService.incrementUsage("models/gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2"); // Without prefix

      const progress = usageCapService.getCapProgress("gemini-2.0-flash");
      expect(progress.current).toBe(2); // Should combine both
    });
  });

  describe("Cap Management", () => {
    test("should add new usage cap", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        period: "daily",
        alertThreshold: 80,
        enabled: true,
      });

      const allCaps = usageCapService.getAllCaps();
      expect(allCaps.caps).toHaveLength(1);
      expect(allCaps.caps[0].model).toBe("gemini-2.0-flash");
      expect(allCaps.caps[0].limit).toBe(100);
    });

    test("should update existing cap", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 200,
        enabled: true,
      });

      const allCaps = usageCapService.getAllCaps();
      expect(allCaps.caps).toHaveLength(1);
      expect(allCaps.caps[0].limit).toBe(200);
    });

    test("should remove cap", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      const removed = usageCapService.removeCap("gemini-2.0-flash");
      expect(removed).toBe(true);

      const allCaps = usageCapService.getAllCaps();
      expect(allCaps.caps).toHaveLength(0);
    });

    test("should return false when removing non-existent cap", () => {
      const removed = usageCapService.removeCap("non-existent-model");
      expect(removed).toBe(false);
    });

    test("should get cap for specific model", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      const cap = usageCapService.getCap("gemini-2.0-flash");
      expect(cap).not.toBeNull();
      expect(cap.limit).toBe(100);
    });

    test("should return null for disabled cap", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: false,
      });

      const cap = usageCapService.getCap("gemini-2.0-flash");
      expect(cap).toBeNull();
    });
  });

  describe("Usage Tracking", () => {
    test("should return false for isAtCap when no cap exists", () => {
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      expect(usageCapService.isAtCap("gemini-2.0-flash")).toBe(false);
    });

    test("should return false for isAtCap when under limit", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 10,
        enabled: true,
      });

      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      expect(usageCapService.isAtCap("gemini-2.0-flash")).toBe(false);
    });

    test("should return true for isAtCap when at or over limit", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 2,
        enabled: true,
      });

      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2");

      expect(usageCapService.isAtCap("gemini-2.0-flash")).toBe(true);
    });

    test("should calculate percentage correctly", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      for (let i = 0; i < 25; i++) {
        usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      }

      const progress = usageCapService.getCapProgress("gemini-2.0-flash");
      expect(progress.percentage).toBe(25);
    });

    test("should track warning threshold", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        alertThreshold: 80,
        enabled: true,
      });

      for (let i = 0; i < 85; i++) {
        usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      }

      const progress = usageCapService.getCapProgress("gemini-2.0-flash");
      expect(progress.atWarning).toBe(true);
      expect(progress.atCap).toBe(false);
    });
  });

  describe("getAllProgress", () => {
    test("should return progress for all enabled caps", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      usageCapService.addOrUpdateCap({
        model: "gemini-1.5-pro",
        limit: 50,
        enabled: true,
      });

      usageCapService.addOrUpdateCap({
        model: "gemini-1.0-pro",
        limit: 200,
        enabled: false, // Disabled
      });

      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-1.5-pro", "account1");

      const allProgress = usageCapService.getAllProgress();

      expect(allProgress).toHaveLength(2); // Only enabled caps
      expect(allProgress.find((p) => p.model === "gemini-2.0-flash")).toBeDefined();
      expect(allProgress.find((p) => p.model === "gemini-1.5-pro")).toBeDefined();
      expect(allProgress.find((p) => p.model === "gemini-1.0-pro")).toBeUndefined();
    });

    test("should return empty array when no caps exist", () => {
      const allProgress = usageCapService.getAllProgress();
      expect(allProgress).toEqual([]);
    });
  });

  describe("Reset Functionality", () => {
    test("should reset all usage counts", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2");

      expect(usageCapService.getCapProgress("gemini-2.0-flash").current).toBe(2);

      usageCapService.resetAllUsage();

      expect(usageCapService.getCapProgress("gemini-2.0-flash").current).toBe(0);
    });

    test("should preserve account structure after reset", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
        enabled: true,
      });

      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      usageCapService.incrementUsage("gemini-2.0-flash", "account2");

      usageCapService.resetAllUsage();

      // After reset, incrementing should still work
      usageCapService.incrementUsage("gemini-2.0-flash", "account1");
      expect(usageCapService.getCapProgress("gemini-2.0-flash").current).toBe(1);
    });
  });

  describe("Configuration", () => {
    test("should set reset time", () => {
      usageCapService.setResetTime("02:00");
      const config = usageCapService.getAllCaps();
      expect(config.resetTime).toBe("02:00");
    });

    test("should set timezone", () => {
      usageCapService.setTimezone("America/New_York");
      const config = usageCapService.getAllCaps();
      expect(config.timezone).toBe("America/New_York");
    });

    test("should provide default values for optional fields", () => {
      usageCapService.addOrUpdateCap({
        model: "gemini-2.0-flash",
        limit: 100,
      });

      const cap = usageCapService.getCap("gemini-2.0-flash");
      expect(cap.period).toBe("daily");
      expect(cap.alertThreshold).toBe(80);
      expect(cap.action).toBe("try_next");
      expect(cap.enabled).toBe(true);
    });
  });
});
