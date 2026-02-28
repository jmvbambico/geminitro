const { generateContentWithApiKey } = require("../services/geminiService");

describe("geminiService - API Key Authentication", () => {
  test("should call Gemini API with raw fetch using API key", async () => {
    const apiKey = "test-api-key-123";
    const model = "gemini-2.0-flash-exp";
    const messages = [{ role: "user", content: "Hello" }];

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "Hello! How can I help?" }],
            },
          },
        ],
      }),
    });

    const result = await generateContentWithApiKey(apiKey, model, messages);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        }),
      }),
    );

    expect(result.response.text()).toBe("Hello! How can I help?");
  });
});
