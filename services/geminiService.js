const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const keyService = require("./keyService");
const oauthService = require("./oauthService");
const antigravityService = require("./antigravityService");
const config = require("../config");
const logger = require("../utils/logger");

let dynamicModels = [];

const ensureDataDir = () => {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
};

const loadCachedModels = () => {
  ensureDataDir();
  try {
    if (fs.existsSync(config.MODELS_FILE)) {
      const raw = fs.readFileSync(config.MODELS_FILE, "utf8");
      const models = raw.trim() ? JSON.parse(raw) : [];
      if (Array.isArray(models) && models.length > 0) {
        dynamicModels = models;
        logger.info(`Loaded ${models.length} cached models`);
      }
    }
  } catch (e) {
    logger.error("Failed to load cached models", e);
  }
};

const saveCachedModels = async (models) => {
  ensureDataDir();
  try {
    await fs.promises.writeFile(config.MODELS_FILE, JSON.stringify(models, null, 2));
  } catch (e) {
    logger.error("Failed to save cached models", e);
  }
};

const validateKey = async (apiKey) => {
  try {
    const response = await fetch(`${config.GEMINI_API_BASE_URL}?key=${apiKey}`);
    const data = await response.json();

    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: data.error?.message || "Invalid API key" };
    }

    if (data.error) {
      return { valid: false, error: data.error.message || "Unknown error" };
    }

    if (data.models) {
      const models = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      models.sort((a, _b) => (a.includes("pro") ? -1 : 1));
      return { valid: true, models };
    }

    return { valid: true, models: [] };
  } catch (e) {
    return { valid: false, error: `Network error: ${e.message}` };
  }
};

const convertContentToParts = (content) => {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part.type === "text") {
          return { text: part.text };
        }

        if (part.type === "image_url" && part.image_url?.url) {
          const url = part.image_url.url;
          if (url.startsWith("data:")) {
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              return {
                inlineData: {
                  mimeType: match[1],
                  data: match[2],
                },
              };
            }
          }
          logger.warn("Image URL not in data URI format, skipping:", url.slice(0, 50));
          return null;
        }

        return null;
      })
      .filter(Boolean);
  }

  return [{ text: String(content) }];
};

const ALLOWED_SCHEMA_KEYS = [
  "type",
  "format",
  "description",
  "nullable",
  "enum",
  "items",
  "properties",
  "required",
  "example",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "multipleOf",
  "default",
  "pattern",
  "oneOf",
  "allOf",
  "definitions",
  "$ref",
];

const sanitizeToolParameters = (params) => {
  if (!params || typeof params !== "object") return params;
  if (Array.isArray(params)) return params.map(sanitizeToolParameters);

  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (k === "properties" || k === "definitions") {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        out[k] = {};
        for (const [propName, propSchema] of Object.entries(v)) {
          out[k][propName] = sanitizeToolParameters(propSchema);
        }
      }
    } else if (["default", "example", "enum", "required"].includes(k)) {
      out[k] = v;
    } else if (ALLOWED_SCHEMA_KEYS.includes(k)) {
      out[k] = sanitizeToolParameters(v);
    }
  }
  return out;
};

const mapMessagesToGemini = (messages) => {
  let systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const parts = convertContentToParts(msg.content);
      systemParts.push(...parts);
      continue;
    }

    let geminiRole = "user";
    let parts = [];

    if (msg.role === "assistant") {
      geminiRole = "model";
      if (msg.content) {
        parts.push(...convertContentToParts(msg.content));
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.type === "function") {
            let args = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {}
            parts.push({
              functionCall: {
                name: tc.function.name,
                args,
                id: tc.id, // Preserve ID for backends like Antigravity/Claude
              },
            });
          }
        }
      }
    } else if (msg.role === "tool") {
      let output = msg.content;
      try {
        output = JSON.parse(msg.content);
      } catch {}
      parts.push({
        functionResponse: {
          name: msg.name || msg.tool_call_id || "tool",
          response: { output },
          id: msg.tool_call_id, // Preserve ID for bridged backends
        },
      });
    } else {
      // user role
      parts = convertContentToParts(msg.content);
    }

    if (parts.length > 0) {
      // Group consecutive messages with the same role into a single turn
      const last = contents[contents.length - 1];
      if (last && last.role === geminiRole) {
        last.parts.push(...parts);
      } else {
        contents.push({ role: geminiRole, parts });
      }
    }
  }

  const systemInstruction = systemParts.length > 0 ? { parts: systemParts } : undefined;
  return { contents, systemInstruction };
};

const fetchGoogleModels = async () => {
  // First, try to get models from API keys (standard Google API)
  const apiKeyObj = keyService.getOptimalKey([], null, "api_key");

  if (apiKeyObj) {
    try {
      const url = `${config.GEMINI_API_BASE_URL}?key=${apiKeyObj.key}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.models) {
        dynamicModels = data.models
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => m.name.replace("models/", ""));
        dynamicModels.sort((a, _b) => (a.includes("pro") ? -1 : 1));
      } else if (data.error) {
        logger.error("Failed to fetch models from Google", new Error(data.error.message));
      }
    } catch (e) {
      logger.error("Network error fetching models", e);
    }
  }

  // Also get models from OAuth accounts and merge
  const oauthModels = keyService.getAllOAuthModels();
  if (oauthModels.length > 0) {
    // Merge with existing models, deduplicate
    const existingModels = dynamicModels || [];
    const allModels = [...new Set([...existingModels, ...oauthModels])];
    if (allModels.length !== existingModels.length) {
      dynamicModels = allModels;
    }
  }

  // Save and log final count (after merge)
  const source = oauthModels.length > 0 ? "Gemini API + OAuth" : "Gemini API";
  logger.modelRefresh(dynamicModels.length, source);
  await saveCachedModels(dynamicModels);

  // If no models at all, try OAuth as fallback (in case no API keys exist)
  if ((!dynamicModels || dynamicModels.length === 0) && !apiKeyObj) {
    const oauthKeyObj = keyService.getOptimalKey([], null, "oauth");
    if (oauthKeyObj) {
      try {
        const { email } = await oauthService.getAccessTokenFromRefreshToken(
          oauthKeyObj.key,
          oauthKeyObj.source || "antigravity",
        );
        dynamicModels = await antigravityService.getAntigravityModels(oauthKeyObj.key, email);
        logger.modelRefresh(dynamicModels.length, "OAuth (Antigravity)");
        await saveCachedModels(dynamicModels);
        return;
      } catch (error) {
        logger.warn(
          `Failed to fetch dynamic models for OAuth key: ${error.message}. Using empty model list.`,
        );
        dynamicModels = [];
        logger.modelRefresh(dynamicModels.length, "OAuth (Antigravity)");
        await saveCachedModels(dynamicModels);
        return;
      }
    }
  }
};

const getDynamicModels = () => dynamicModels;

const initializeModelFetching = () => {
  loadCachedModels();
  setTimeout(async () => {
    await fetchGoogleModels();
    // Sync agent config files on startup so they always reflect the
    // current key pool (API keys + OAuth) without needing a manual re-install.
    try {
      const install = require("../src/cli/install");
      const allModels = [...new Set([...dynamicModels, ...keyService.getAllOAuthModels()])];
      if (allModels.length > 0) {
        install.updateAgentConfig(allModels);
        logger.info(`Synced agent configs with ${allModels.length} models on startup`);
      }
    } catch (e) {
      logger.warn(`Failed to sync agent configs on startup: ${e.message}`);
    }
  }, config.INITIAL_MODEL_FETCH_DELAY);
  setInterval(fetchGoogleModels, config.MODEL_FETCH_INTERVAL);
};

const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
];

const generateContent = async (
  apiKey,
  modelName,
  messages,
  generationConfig = {},
  stream = false,
  keyObj = null,
  tools = null,
  toolConfig = null,
) => {
  if (keyObj && keyObj.type === "oauth") {
    const provider = keyObj.source || "antigravity";

    // Both Antigravity and Gemini CLI use cloudcode-pa endpoint
    return await antigravityService.generateContentAntigravity(
      keyObj.key,
      modelName,
      messages,
      generationConfig,
      stream,
      provider,
      keyObj.projectId,
      tools,
      toolConfig,
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const { contents, systemInstruction } = mapMessagesToGemini(messages);

  // Convert OpenAI-format tools → Gemini tools schema
  const geminiTools =
    Array.isArray(tools) && tools.length > 0
      ? [
          {
            functionDeclarations: tools
              .filter((t) => t.type === "function" && t.function)
              .map((t) => ({
                name: t.function.name,
                description: t.function.description || "",
                parameters: sanitizeToolParameters(t.function.parameters) || {
                  type: "object",
                  properties: {},
                },
              })),
          },
        ]
      : undefined;

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
    safetySettings,
    ...(geminiTools ? { tools: geminiTools } : {}),
    ...(toolConfig ? { toolConfig } : {}),
  });

  if (stream) {
    return await model.generateContentStream({ contents, generationConfig });
  }
  return await model.generateContent({ contents, generationConfig });
};

module.exports = {
  fetchGoogleModels,
  getDynamicModels,
  initializeModelFetching,
  generateContent,
  mapMessagesToGemini,
  validateKey,
  loadCachedModels,
  saveCachedModels,
};
