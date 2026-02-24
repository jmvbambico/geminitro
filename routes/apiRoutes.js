const express = require("express");
const keyService = require("../services/keyService");
const geminiService = require("../services/geminiService");
const statsService = require("../services/statsService");
const config = require("../config");
const logger = require("../utils/logger");
const oauthService = require("../services/oauthService");
const install = require("../src/cli/install");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const handleRequest = async (req, res, io, attemptedKeys = []) => {
  // Determine the target model up-front so key selection can honor model support
  let targetModel = (req.body.model || "gemini-pro")
    .replace("models/", "")
    .replace(/^Proxy:\s*/, "");
  // Normalize model to a simple string for matching against key metadata
  const keyObj = keyService.getOptimalKey(attemptedKeys, targetModel);

  if (!keyObj) {
    const poolStatus = keyService.getPoolStatus();
    const waitTime = poolStatus.minCooldown > 0 ? ` Try again in ${poolStatus.minCooldown}s.` : "";
    logger.warn(`All keys exhausted or in cooldown${waitTime}`);
    return res.status(429).json({
      error: {
        message: `All keys are currently exhausted or in cooldown.${waitTime}`,
        code: 429,
        retryAfter: poolStatus.minCooldown,
      },
    });
  }

  keyService.updateKeyStatus(keyObj.key, "active");
  io.emit("stats_update", keyService.getSafeKeyPool());

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const currentKey = keyObj.key;
  if (!Array.isArray(req.body.messages)) {
    return res
      .status(400)
      .json({ error: { message: "Request body must include a `messages` array." } });
  }

  logger.proxyRequest(targetModel, currentKey.slice(-6));

  try {
    const generationConfig = {};
    if (req.body.temperature !== undefined) generationConfig.temperature = req.body.temperature;
    if (req.body.max_tokens !== undefined) generationConfig.maxOutputTokens = req.body.max_tokens;
    if (req.body.top_p !== undefined) generationConfig.topP = req.body.top_p;
    if (req.body.top_k !== undefined) generationConfig.topK = req.body.top_k;

    if (req.body.stream) {
      const result = await geminiService.generateContent(
        currentKey,
        targetModel,
        req.body.messages,
        generationConfig,
        true,
        keyObj,
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let isClientConnected = true;
      req.on("close", () => {
        isClientConnected = false;
      });

      const startTime = Date.now();
      try {
        for await (const chunk of result.stream) {
          if (!isClientConnected) break;
          let text = "";
          try {
            text = chunk.text();
          } catch {}
          if (text) {
            res.write(
              `data: ${JSON.stringify({
                id: requestId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: targetModel,
                choices: [{ delta: { content: text }, index: 0, finish_reason: null }],
              })}\n\n`,
            );
          }
        }
        if (isClientConnected) {
          res.write(`data: [DONE]\n\n`);
          res.end();
        }

        keyService.incrementKeyUsage(currentKey);
        statsService.trackRequest(currentKey, targetModel, true);
        io.emit("traffic_update");
        logger.proxyResponse(targetModel, "success", Date.now() - startTime);
        io.emit("stats_update", keyService.getSafeKeyPool());
        io.emit("stats_update_full", statsService.getStats());
      } catch (streamError) {
        logger.error("Stream interrupted", streamError);
        statsService.trackRequest(currentKey, targetModel, false);
        keyService.incrementKeyErrors(currentKey);
        io.emit("stats_update", keyService.getSafeKeyPool());
      }
    } else {
      const startTime = Date.now();
      const result = await geminiService.generateContent(
        currentKey,
        targetModel,
        req.body.messages,
        generationConfig,
        false,
        keyObj,
      );
      const text = result.response.text();

      keyService.incrementKeyUsage(currentKey);
      statsService.trackRequest(currentKey, targetModel, true);
      io.emit("traffic_update");
      logger.proxyResponse(targetModel, "success", Date.now() - startTime);

      res.json({
        id: requestId,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: targetModel,
        choices: [
          { message: { role: "assistant", content: text }, finish_reason: "stop", index: 0 },
        ],
      });
      io.emit("stats_update", keyService.getSafeKeyPool());
      io.emit("stats_update_full", statsService.getStats());
    }
  } catch (error) {
    const isRateLimit =
      error.message.includes("429") ||
      error.message.includes("Quota") ||
      error.message.includes("exhausted");

    if (isRateLimit) {
      logger.keyCooldown(currentKey.slice(-6), "rate limit");
      keyService.updateKeyStatus(currentKey, "cooldown");
      keyService.incrementKeyErrors(currentKey);
      io.emit("stats_update", keyService.getSafeKeyPool());

      const newAttemptedKeys = [...attemptedKeys, currentKey];
      if (newAttemptedKeys.length < keyService.getKeyPool().length && !res.headersSent) {
        logger.proxyRetry(
          targetModel,
          keyService.getOptimalKey(newAttemptedKeys)?.key?.slice(-6) || "??",
          newAttemptedKeys.length + 1,
        );
        await new Promise((r) => setTimeout(r, 200));
        return handleRequest(req, res, io, newAttemptedKeys);
      }
    } else {
      logger.error(`Proxy error for ${targetModel}`, error);
    }

    io.emit("traffic_update");
    io.emit("stats_update", keyService.getSafeKeyPool());
    io.emit("stats_update_full", statsService.getStats());

    if (!res.headersSent) {
      statsService.trackRequest(currentKey, targetModel, false);
      res.status(500).json({ error: { message: error.message } });
    }
  }
};

module.exports = (io) => {
  const router = express.Router();

  // OAuth callback route - handles the redirect from Google
  // This must be BEFORE the token middleware
  router.get("/oauth-callback", async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
            <div style="text-align: center;">
              <h1 style="color: #ef4444;">Authentication Failed</h1>
              <p>${error}</p>
              <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; rounded: 8px; cursor: pointer;">Close Window</button>
            </div>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    try {
      // In a real integration, we'd look up the provider from the state
      // but here we just need to exchange the code.
      // The oauthService already has pending_verifiers indexed by state.
      const tokens = await oauthService.exchangeCode("antigravity", code, state).catch(async () => {
        return await oauthService.exchangeCode("gemini_cli", code, state);
      });

      // Add to key pool
      const result = await keyService.addOAuthToken(
        tokens.refreshToken,
        tokens.provider,
        tokens.email,
      );

      if (result.success) {
        logger.info(`OAuth account added via dashboard: ${tokens.email}`);

        // Update agent configs
        const allModels = [
          ...(geminiService.getDynamicModels() || []),
          ...(keyService.getAllOAuthModels() || []),
        ];
        const uniqueModels = [...new Set(allModels)];
        if (uniqueModels.length > 0) {
          install.updateAgentConfig(uniqueModels);
        }

        io.emit("stats_update", keyService.getSafeKeyPool());

        // Redirect back to setup page with success flag
        res.send(`
          <html>
            <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
              <div style="text-align: center;">
                <h1 style="color: #10b981;">Authentication Successful!</h1>
                <p>Welcome, ${tokens.email}. Redirecting...</p>
                <script>
                  // Store success in localStorage
                  localStorage.setItem('geminitro_oauth_success', JSON.stringify({
                    email: '${tokens.email}',
                    provider: '${tokens.provider}',
                    timestamp: Date.now()
                  }));

                  // Redirect back to setup page
                  setTimeout(() => {
                    window.location.href = '/dashboard/setup?oauth=success';
                  }, 1000);
                </script>
              </div>
            </body>
          </html>
        `);
      } else {
        throw new Error(result.error || "Failed to add account to pool");
      }
    } catch (err) {
      logger.error("OAuth callback processing failed", err);
      res.status(500).send(`OAuth Error: ${err.message}`);
    }
  });

  router.get("/api/health", (req, res) => {
    const poolStatus = keyService.getPoolStatus();
    res.json({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      keys: poolStatus,
      models: geminiService.getDynamicModels().length,
      version: require("../package.json").version,
    });
  });

  router.use((req, res, next) => {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (token !== config.PROXY_API_KEY) {
      return res.status(401).json({ error: { message: "Invalid proxy API key.", code: 401 } });
    }
    next();
  });

  router.post("/v1/chat/completions", (req, res) => handleRequest(req, res, io, []));

  router.post(/^\/v1\/models\/([^/:]+):(streamGenerateContent|generateContent)$/, (req, res) => {
    const match = req.path.match(
      /^\/v1\/models\/([^/:]+):(streamGenerateContent|generateContent)$/,
    );
    if (match) {
      req.body.model = match[1];
      req.body.stream = match[2] === "streamGenerateContent";
    }
    if (!req.body.messages && Array.isArray(req.body.contents)) {
      req.body.messages = req.body.contents.map((c) => ({
        role: c.role === "model" ? "assistant" : c.role,
        content: Array.isArray(c.parts) ? c.parts.map((p) => p.text ?? "").join("") : "",
      }));
    }
    return handleRequest(req, res, io, []);
  });

  router.get("/v1/models", (req, res) => {
    // Combine models from API keys + OAuth accounts
    const apiKeyModels = geminiService.getDynamicModels() || [];
    const oauthModels = keyService.getAllOAuthModels() || [];
    const allModels = [...new Set([...apiKeyModels, ...oauthModels])];

    res.json({
      object: "list",
      data: allModels.map((id) => ({
        id,
        object: "model",
        created: 1677610602,
        owned_by: "google",
      })),
    });
  });

  router.get("/api/keys", (req, res) => res.json(keyService.getKeyPool()));
  router.get("/api/keys/safe", (req, res) => res.json(keyService.getSafeKeyPool()));

  router.post("/api/keys", async (req, res) => {
    const { key, validate = true } = req.body;

    if (!key) {
      return res.status(400).json({ error: "Key is required." });
    }

    if (keyService.getKeyPool().find((k) => k.key === key)) {
      return res.status(400).json({ error: "Key already exists." });
    }

    if (validate) {
      const result = await geminiService.validateKey(key);
      if (!result.valid) {
        logger.warn(`Key validation failed: ${result.error}`);
        return res.status(400).json({ error: result.error });
      }

      const wasEmpty = keyService.getKeyPool().length === 0;
      keyService.addKey(key, { models: result.models || [] });
      logger.keyAdded(key.slice(-6), result.models?.length || 0);

      if (wasEmpty) {
        geminiService.fetchGoogleModels().catch(() => {});
      } else if (result.models && result.models.length > 0) {
        await geminiService.saveCachedModels(result.models);
      }

      // Update agent configs with all available models (API keys + OAuth)
      const allModels = [
        ...(geminiService.getDynamicModels() || []),
        ...(keyService.getAllOAuthModels() || []),
      ];
      const uniqueModels = [...new Set(allModels)];
      if (uniqueModels.length > 0) {
        install.updateAgentConfig(uniqueModels);
      }

      io.emit("stats_update", keyService.getSafeKeyPool());
      return res.json({ success: true, models: result.models });
    }

    if (keyService.addKey(key)) {
      logger.keyAdded(key.slice(-6), 0);
      // Update agent configs
      const allModels = [
        ...(geminiService.getDynamicModels() || []),
        ...(keyService.getAllOAuthModels() || []),
      ];
      const uniqueModels = [...new Set(allModels)];
      if (uniqueModels.length > 0) {
        install.updateAgentConfig(uniqueModels);
      }
      io.emit("stats_update", keyService.getSafeKeyPool());
      return res.json({ success: true });
    }
    return res.status(400).json({ error: "Failed to add key." });
  });

  router.delete("/api/keys/:keyFragment", (req, res) => {
    const pool = keyService.getKeyPool();
    const keyObj = pool.find((k) => k.key.endsWith(req.params.keyFragment));
    const removed = keyService.removeKey(req.params.keyFragment);
    if (removed) {
      logger.keyRemoved(keyObj?.key?.slice(-6) || req.params.keyFragment);
      io.emit("stats_update", keyService.getSafeKeyPool());
      res.json({ success: true });
    } else {
      logger.warn(`Key not found: ...${req.params.keyFragment}`);
      res.status(404).json({ error: "Key not found." });
    }
  });

  router.post("/api/keys/import-antigravity", async (req, res) => {
    try {
      const result = await keyService.importAntigravityAccounts();

      // Update agent configs with all available models (API keys + OAuth)
      const allModels = [
        ...(geminiService.getDynamicModels() || []),
        ...(keyService.getAllOAuthModels() || []),
      ];
      const uniqueModels = [...new Set(allModels)];
      if (uniqueModels.length > 0) {
        install.updateAgentConfig(uniqueModels);
      }

      io.emit("stats_update", keyService.getSafeKeyPool());
      res.json(result);
    } catch (e) {
      logger.error("Failed to import antigravity accounts", e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post("/api/keys/oauth/:provider", async (req, res) => {
    const provider = req.params.provider;
    const validProviders = ["antigravity", "gemini_cli"];

    if (!validProviders.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider. Valid: ${validProviders.join(", ")}`,
      });
    }

    try {
      const { url, state } = oauthService.generateAuthUrl(provider);
      res.json({ authUrl: url, state });
    } catch (e) {
      logger.error("OAuth start failed", e);
      res.status(500).json({ error: e.message });
    }
  });

  router.get("/api/config-template", async (req, res) => {
    if (geminiService.getDynamicModels().length === 0) await geminiService.fetchGoogleModels();
    res.json(geminiService.getDynamicModels());
  });

  router.post("/api/refresh-models", async (req, res) => {
    await geminiService.fetchGoogleModels();
    const models = geminiService.getDynamicModels();
    logger.modelRefresh(models.length);
    io.emit("stats_update", keyService.getSafeKeyPool());
    res.json(models);
  });

  router.get("/api/stats", (req, res) => res.json(statsService.getStats()));

  router.get("/api/settings", (req, res) => {
    res.json({ autoUpdate: config.AUTO_UPDATE });
  });

  router.post("/api/settings", (req, res) => {
    const { autoUpdate } = req.body;
    if (typeof autoUpdate !== "boolean") {
      return res.status(400).json({ error: "autoUpdate must be a boolean." });
    }
    const envPath = path.join(__dirname, "../.env");
    let content = "";
    try {
      content = fs.readFileSync(envPath, "utf8");
    } catch {}
    const line = `AUTO_UPDATE=${autoUpdate ? "true" : "false"}`;
    const re = /^AUTO_UPDATE=.*$/m;
    content = re.test(content)
      ? content.replace(re, line)
      : content + (content.endsWith("\n") ? "" : "\n") + line + "\n";
    try {
      fs.writeFileSync(envPath, content);
      process.env.AUTO_UPDATE = autoUpdate ? "true" : "false";
      config.AUTO_UPDATE = autoUpdate;
      res.json({ success: true, autoUpdate });
    } catch (err) {
      res.status(500).json({ error: "Failed to write .env: " + err.message });
    }
  });

  router.post("/api/theme", (req, res) => {
    const { css } = req.body;
    if (typeof css !== "string" || !css) {
      return res.status(400).json({ error: "Invalid CSS" });
    }
    try {
      const cssPath = path.join(__dirname, "../dashboard/src/index.css");
      fs.writeFileSync(cssPath, css, "utf-8");
      logger.info("Theme updated. Building dashboard...");
      execSync("npm run build", { cwd: path.join(__dirname, "../dashboard"), stdio: "ignore" });
      logger.info("Dashboard build complete.");
      res.json({ success: true });
    } catch (error) {
      logger.error("Theme switch failed", error);
      res.status(500).json({ error: "Failed to apply theme." });
    }
  });

  router.get("/api/agents", (req, res) => {
    const install = require("../src/cli/install");
    const agents = install.detectAvailableAgents();
    res.json(agents);
  });
  router.post("/api/agents/install", async (req, res) => {
    const { agents, scope = "global", autoStart = "none", autoUpdate = true } = req.body;
    if (!Array.isArray(agents) || agents.length === 0) {
      return res.status(400).json({ error: "No agents selected" });
    }

    const install = require("../src/cli/install");
    const fs = require("fs");
    const path = require("path");
    const chalk = require("chalk");
    const allAvailableModels = [
      ...(geminiService.getDynamicModels() || []),
      ...(keyService.getAllOAuthModels() || []),
    ];
    const models = [...new Set(allAvailableModels)];
    const results = [];
    for (const agentId of agents) {
      try {
        if (agentId === "opencode") {
          await install.installOpenCode(
            models,
            config.PORT,
            config.PROXY_API_KEY,
            chalk,
            null,
            scope,
          );
        } else if (agentId === "continue") {
          await install.installContinue(models, config.PORT, config.PROXY_API_KEY, chalk);
        } else if (agentId === "aider") {
          await install.installAider(models, config.PORT, config.PROXY_API_KEY, chalk);
        } else if (agentId === "codex") {
          await install.installCodex(models, config.PORT, config.PROXY_API_KEY, chalk);
        } else if (agentId === "opencrabs") {
          await install.installOpenCrabs(models, config.PORT, config.PROXY_API_KEY, chalk);
        } else if (agentId === "kimi-code") {
          await install.installKimiCode(models, config.PORT, config.PROXY_API_KEY, chalk);
        }
        results.push({ agent: agentId, success: true });
      } catch (err) {
        results.push({ agent: agentId, success: false, error: err.message });
      }
    }

    if (autoStart !== "none") {
      try {
        const execPath = process.execPath;
        const scriptPath = require.resolve("../bin/geminitro.js");
        if (autoStart === "launchd") {
          install.installLaunchd(execPath, scriptPath);
        } else if (autoStart === "systemd") {
          install.installSystemd(execPath, scriptPath);
        }
      } catch {}
    }

    try {
      const envPath = path.join(__dirname, "../.env");
      let content = "";
      try {
        content = fs.readFileSync(envPath, "utf8");
      } catch {}
      const line = `AUTO_UPDATE=${autoUpdate ? "true" : "false"}`;
      const re = /^AUTO_UPDATE=.*$/m;
      content = re.test(content)
        ? content.replace(re, line)
        : content + (content.endsWith("\n") ? "" : "\n") + line + "\n";
      fs.writeFileSync(envPath, content);
    } catch {}

    res.json({ success: true, results });
  });
  return router;
};
