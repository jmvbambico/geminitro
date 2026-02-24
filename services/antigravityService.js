const oauthService = require("./oauthService");
const logger = require("../utils/logger");
const config = require("../config");
const fs = require("fs");
const path = require("path");

const ANTIGRAVITY_ENDPOINTS = {
  production: "https://cloudcode-pa.googleapis.com",
  daily: "https://daily-cloudcode-pa.sandbox.googleapis.com",
};

const ANTIGRAVITY_MODELS_SOURCE_URL =
  "https://raw.githubusercontent.com/NoeFabris/opencode-antigravity-auth/main/docs/ANTIGRAVITY_API_SPEC.md";

const getModelsCachePath = () => {
  return path.join(config.DATA_DIR || ".geminitro", "antigravity-models.json");
};

const DEFAULT_ANTIGRAVITY_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gemini-3-pro-high",
  "gemini-3-pro-low",
  "gpt-oss-120b-medium",
];

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "antigravity/1.15.8 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
};

function getClientMetadata() {
  return JSON.stringify({
    ideType: "ANTIGRAVITY",
    platform: process.platform === "darwin" ? "MACOS" : "LINUX",
    pluginType: "GEMINI",
  });
}

function getProjectFromEmail(email) {
  if (!email) return "antigravity-default";
  const hash = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
  return hash || "antigravity-default";
}

async function fetchUserProjects(accessToken) {
  try {
    const response = await fetch("https://cloudresourcemanager.googleapis.com/v1/projects", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.projects?.map((p) => p.projectId) || [];
  } catch {
    return [];
  }
}

async function fetchModelsFromGitHub() {
  try {
    const response = await fetch(ANTIGRAVITY_MODELS_SOURCE_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const markdown = await response.text();

    const models = [];
    const lines = markdown.split("\n");
    let inModelsTable = false;

    for (const line of lines) {
      if (line.includes("| Model Name | Model ID |")) {
        inModelsTable = true;
        continue;
      }

      if (inModelsTable && line.startsWith("|")) {
        if (line.includes("---")) continue;

        const cells = line.split("|").filter((c) => c.trim());
        if (cells.length >= 2) {
          const modelId = cells[1].trim().replace(/`/g, "");
          if (modelId && !modelId.includes("Model ID")) {
            models.push(modelId);
          }
        }
      } else if (inModelsTable && !line.startsWith("|")) {
        break;
      }
    }

    logger.info(`Fetched ${models.length} models from GitHub spec`);
    return models;
  } catch (error) {
    logger.warn(`Failed to fetch models from GitHub: ${error.message}`);
    return [];
  }
}

async function getAntigravityModelsFromGitHub() {
  const cachePath = getModelsCachePath();
  const cacheMaxAge = 24 * 60 * 60 * 1000;

  try {
    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      if (cached.timestamp && Date.now() - cached.timestamp < cacheMaxAge) {
        logger.info(`Using cached Antigravity models: ${cached.models.length}`);
        return cached.models;
      }
    }
  } catch {}

  const models = await fetchModelsFromGitHub();

  try {
    fs.writeFileSync(cachePath, JSON.stringify({ models, timestamp: Date.now() }, null, 2));
  } catch {}

  return models;
}

async function fetchAntigravityModels(_refreshToken, _email) {
  const models = await getAntigravityModelsFromGitHub();

  if (models.length > 0) {
    logger.info(`Fetched ${models.length} models from GitHub spec`);
    return models;
  }

  logger.warn("GitHub fetch failed, using hardcoded model list");
  return DEFAULT_ANTIGRAVITY_MODELS;
}

async function getAntigravityModels(refreshToken, email) {
  try {
    const models = await fetchAntigravityModels(refreshToken, email);

    if (models.length === 0) {
      logger.info("Using hardcoded community-verified Antigravity models");
      return DEFAULT_ANTIGRAVITY_MODELS;
    }

    logger.info(`Fetched ${models.length} models from Antigravity`);
    return models;
  } catch (error) {
    logger.warn(`Error getting Antigravity models: ${error.message}. Using hardcoded models.`);
    return DEFAULT_ANTIGRAVITY_MODELS;
  }
}

async function generateContentAntigravity(
  refreshToken,
  modelName,
  messages,
  generationConfig = {},
  stream = false,
  provider = "antigravity",
  emailFromKey = null,
  projectIdFromKey = null,
) {
  const { accessToken, email: emailFromToken } = await oauthService.getAccessTokenFromRefreshToken(
    refreshToken,
    provider,
  );

  let projectId = projectIdFromKey;

  if (!projectId) {
    try {
      const projects = await fetchUserProjects(accessToken);
      if (projects.length > 0) {
        projectId = projects[0];
        logger.info(`Using project from Google Cloud: ${projectId}`);
      }
    } catch (e) {
      logger.warn(`Could not fetch projects from Google Cloud: ${e.message}`);
    }
  }

  if (!projectId) {
    const email = emailFromKey || emailFromToken;
    projectId = getProjectFromEmail(email);
    logger.info(`Falling back to derived project: ${projectId}`);
  }

  const endpoint = ANTIGRAVITY_ENDPOINTS.daily;
  const path = stream ? "/v1internal:streamGenerateContent?alt=sse" : "/v1internal:generateContent";
  const url = `${endpoint}${path}`;

  const headers = {
    ...DEFAULT_HEADERS,
    Authorization: `Bearer ${accessToken}`,
    Client_Metadata: getClientMetadata(),
  };

  const systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const parts = convertContentToParts(msg.content);
      systemParts.push(...parts);
    } else {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts = convertContentToParts(msg.content);
      contents.push({ role, parts });
    }
  }

  const requestBody = {
    project: projectId,
    model: modelName,
    request: {
      contents,
      generationConfig: generationConfig || {},
    },
    userAgent: "antigravity",
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  };

  if (systemParts.length > 0) {
    requestBody.request.systemInstruction = { parts: systemParts };
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Antigravity API error: ${response.status}`);
  }

  if (stream) {
    return {
      stream: true,
      response: {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of response.body) {
            const lines = chunk.toString().split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  yield data;
                } catch {}
              }
            }
          }
        },
      },
    };
  }

  const data = await response.json();
  return {
    stream: false,
    response: data,
  };
}

function convertContentToParts(content) {
  if (!content) return [];
  if (typeof content === "string") {
    return [{ text: content }];
  }
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (typeof c === "string") return { text: c };
      if (c.type === "text") return { text: c.text };
      if (c.type === "image_url") {
        return {
          inlineData: {
            mimeType: c.image_url?.url?.split(";")[0]?.split("/")[1] || "image/jpeg",
            data: c.image_url?.url?.split(",")[1],
          },
        };
      }
      return { text: String(c) };
    });
  }
  return [{ text: String(content) }];
}

module.exports = {
  generateContentAntigravity,
  getAntigravityModels,
  getProjectFromEmail,
  ANTIGRAVITY_ENDPOINTS,
  DEFAULT_ANTIGRAVITY_MODELS,
};
