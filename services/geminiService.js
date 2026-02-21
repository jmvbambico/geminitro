const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const keyService = require("./keyService");
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

const mapMessagesToGemini = (messages) => {
  let systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push({ text: msg.content });
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  const systemInstruction = systemParts.length > 0 ? { parts: systemParts } : undefined;
  return { contents, systemInstruction };
};

const fetchGoogleModels = async () => {
  const keyObj = keyService.getOptimalKey();
  if (!keyObj) {
    logger.warn("No active keys available to fetch models");
    return;
  }

  try {
    const response = await fetch(`${config.GEMINI_API_BASE_URL}?key=${keyObj.key}`);
    const data = await response.json();

    if (data.models) {
      dynamicModels = data.models
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      dynamicModels.sort((a, _b) => (a.includes("pro") ? -1 : 1));
      logger.modelRefresh(dynamicModels.length);
      await saveCachedModels(dynamicModels);
    } else if (data.error) {
      logger.error("Failed to fetch models from Google", new Error(data.error.message));
    }
  } catch (e) {
    logger.error("Network error fetching models", e);
    if (dynamicModels.length === 0) {
      dynamicModels = ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    }
  }
};

const getDynamicModels = () => dynamicModels;

const initializeModelFetching = () => {
  loadCachedModels();
  setTimeout(fetchGoogleModels, config.INITIAL_MODEL_FETCH_DELAY);
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
) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const { contents, systemInstruction } = mapMessagesToGemini(messages);
  const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, safetySettings });

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
