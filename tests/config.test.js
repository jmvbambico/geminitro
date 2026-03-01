const config = require("../config");

describe("config - Timeout Configuration", () => {
  test("should have default timeout values", () => {
    expect(config.TIMEOUT_CONNECT).toBe(30);
    expect(config.TIMEOUT_WRITE).toBe(30);
    expect(config.TIMEOUT_READ_STREAMING).toBe(180);
    expect(config.TIMEOUT_READ_NON_STREAMING).toBe(600);
  });

  test("should allow environment variable overrides", () => {
    const originalConnect = process.env.TIMEOUT_CONNECT;

    process.env.TIMEOUT_CONNECT = "60";
    jest.resetModules();
    const newConfig = require("../config");
    expect(newConfig.TIMEOUT_CONNECT).toBe(60);

    // Restore
    if (originalConnect) {
      process.env.TIMEOUT_CONNECT = originalConnect;
    } else {
      delete process.env.TIMEOUT_CONNECT;
    }
    jest.resetModules();
  });
});
