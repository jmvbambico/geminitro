const oauthService = require("./oauthService");
const logger = require("../utils/logger");

const ANTIGRAVITY_ENDPOINTS = {
  prod: "https://cloudcode-pa.googleapis.com",
  daily: "https://daily-cloudcode-pa.sandbox.googleapis.com",
  autopush: "https://autopush-cloudcode-pa.sandbox.googleapis.com",
};

const ANTIGRAVITY_ENDPOINT = ANTIGRAVITY_ENDPOINTS.prod;
const ANTIGRAVITY_MODELS_SOURCE_URL =
  "https://raw.githubusercontent.com/NoeFabris/opencode-antigravity-auth/main/docs/ANTIGRAVITY_API_SPEC.md";

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

// Per-token project ID cache — populated on first successful discovery.
// Avoids re-calling loadCodeAssist on every inference request.
const projectIdCache = new Map();

function getClientMetadata() {
  return JSON.stringify({
    ideType: "ANTIGRAVITY",
    platform: process.platform === "darwin" ? "MACOS" : "LINUX",
    pluginType: "GEMINI",
  });
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

// Discover or provision the correct projectId via Antigravity endpoints
// This mirrors the opencode-antigravity-auth plugin's ensureProjectContext flow
async function discoverProject(refreshToken, provider = "antigravity") {
  try {
    const { accessToken } = await oauthService.getAccessTokenFromRefreshToken(
      refreshToken,
      provider,
    );

    const endpoint = ANTIGRAVITY_ENDPOINTS.daily;
    const headers = {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      Client_Metadata: getClientMetadata(),
    };

    // Step 1: Try to load an existing cloud AI companion project
    let loadPayload = null;
    let projectId = null;

    try {
      const loadRes = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (loadRes.ok) {
        loadPayload = await loadRes.json();

        // Check if loadPayload contains a managed project
        if (typeof loadPayload.cloudaicompanionProject === "string") {
          projectId = loadPayload.cloudaicompanionProject;
        } else if (loadPayload.cloudaicompanionProject?.id) {
          projectId = loadPayload.cloudaicompanionProject.id;
        } else if (loadPayload.metadata?.duetProject) {
          projectId = loadPayload.metadata.duetProject;
        } else {
          // Additional fallback parser for older account payloads
          projectId =
            loadPayload.project ||
            loadPayload.projectId ||
            loadPayload.name?.split("/").pop() ||
            null;
        }
      }
    } catch (e) {
      logger.warn(`loadCodeAssist failed: ${e.message}`);
    }

    if (projectId) {
      logger.info(`Discovered managed Antigravity project: ${projectId}`);
      return projectId;
    }

    // Step 2: Auto-provision a managed project via onboardUser if missing
    // Determine tier ID from allowed. Defaults to FREE.
    let tierId = "FREE";
    if (loadPayload?.allowedTiers?.length > 0) {
      const defaultTier = loadPayload.allowedTiers.find((t) => t.isDefault);
      tierId = defaultTier ? defaultTier.id : loadPayload.allowedTiers[0].id;
    }

    try {
      logger.info(`Attempting to auto-provision managed project with tier ${tierId}`);
      const onboardRes = await fetch(`${endpoint}/v1internal:onboardUser`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tierId }),
      });

      if (onboardRes.ok) {
        const onboardPayload = await onboardRes.json();
        if (onboardPayload.done && onboardPayload.response?.cloudaicompanionProject?.id) {
          projectId = onboardPayload.response.cloudaicompanionProject.id;
          logger.info(`Successfully provisioned new managed project: ${projectId}`);
          return projectId;
        }
      }
    } catch (e) {
      logger.warn(`onboardUser failed: ${e.message}`);
    }

    // Step 3: Hardcoded fallback used by the Opencode plugin when provisioning fails
    logger.warn(`Failed to discover or provision managed project, using magic fallback`);
    return "rising-fact-p41fc";
  } catch (error) {
    logger.warn(`discoverProject flow failed entirely: ${error.message}`);
    return "rising-fact-p41fc";
  }
}

async function discoverModelsFromApi(refreshToken, provider = "antigravity") {
  try {
    const { accessToken } = await oauthService.getAccessTokenFromRefreshToken(
      refreshToken,
      provider,
    );

    const endpoint = ANTIGRAVITY_ENDPOINTS.daily;
    const url = `${endpoint}/v1internal:loadCodeAssist`;

    const headers = {
      ...DEFAULT_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      Client_Metadata: getClientMetadata(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) return [];

    const data = await response.json();

    // Try to extract a model list from any known response fields
    const candidates =
      data.supportedModels ||
      data.models ||
      (Array.isArray(data.allowedFeatures)
        ? data.allowedFeatures.filter((f) => typeof f === "string" && f.includes("-"))
        : null) ||
      [];

    const models = Array.isArray(candidates)
      ? candidates.map((m) => (typeof m === "string" ? m : m.id || m.name || null)).filter(Boolean)
      : [];

    if (models.length > 0) {
      logger.info(`Discovered ${models.length} models from loadCodeAssist API`);
    }

    return models;
  } catch (error) {
    logger.warn(`discoverModelsFromApi failed: ${error.message}`);
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

async function fetchAntigravityModels(refreshToken, _email) {
  // Discovery priority:
  //   1. loadCodeAssist API response (may carry supported model list)
  //   2. GitHub markdown spec (community-maintained, 24h cached effectively)
  //   3. Hardcoded DEFAULT_ANTIGRAVITY_MODELS (last resort)
  //
  // Note: Antigravity has no dedicated /v1/models endpoint, so we use
  // loadCodeAssist as the most API-native signal, falling back to the
  // GitHub spec crawl that OpenCode maintainers keep up to date.

  if (refreshToken) {
    const apiModels = await discoverModelsFromApi(refreshToken);
    if (apiModels.length > 0) {
      return apiModels;
    }
  }

  const githubModels = await fetchModelsFromGitHub();
  if (githubModels.length > 0) {
    return githubModels;
  }

  logger.warn("All model discovery sources failed, using hardcoded Antigravity model list");
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
  projectIdFromKey = null,
  tools = null,
  toolConfig = null,
) {
  const { accessToken } = await oauthService.getAccessTokenFromRefreshToken(refreshToken, provider);

  let projectId = projectIdFromKey || projectIdCache.get(refreshToken) || null;

  if (!projectId) {
    try {
      const projects = await fetchUserProjects(accessToken);
      if (projects.length > 0) {
        projectId = projects[0];
        logger.info(`Using project from Google Cloud: ${projectId}`);
        projectIdCache.set(refreshToken, projectId);
      }
    } catch (e) {
      logger.warn(`Could not fetch projects from Google Cloud: ${e.message}`);
    }
  }

  // Try discoverProject via loadCodeAssist if no projectId yet
  // This is the correct way to get an Antigravity-enabled project
  if (!projectId) {
    try {
      const discovered = await discoverProject(refreshToken, provider);
      if (discovered) {
        projectId = discovered;
        projectIdCache.set(refreshToken, projectId);
      }
    } catch (e) {
      logger.warn(`discoverProject failed: ${e.message}`);
    }
  }

  const url = `${ANTIGRAVITY_ENDPOINT}/v1internal:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "X-Goog-Api-Client": "google-cloud-sdk vscode/1.96.0",
    "User-Agent": "antigravity/1.18.3 darwin/arm64",
    Client_Metadata: getClientMetadata(),
  };
  if (stream) {
    headers["Accept"] = "text/event-stream";
  }

  const systemParts = [];
  const contents = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const parts = convertContentToParts(msg.content);
      systemParts.push(...parts);
    } else if (msg.role === "assistant") {
      // Assistant messages may have text content AND/OR tool_calls.
      const parts = [];

      if (msg.content) {
        parts.push(...convertContentToParts(msg.content));
      }

      // OpenAI-format tool_calls → Gemini functionCall parts
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.type === "function") {
            let args = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch {}
            parts.push({ functionCall: { name: tc.function.name, args } });
          }
        }
      }

      if (parts.length > 0) {
        contents.push({ role: "model", parts });
      }
    } else if (msg.role === "tool") {
      // OpenAI tool result → Gemini functionResponse part
      let output = msg.content;
      try {
        output = JSON.parse(msg.content);
      } catch {}
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: msg.name || msg.tool_call_id || "tool",
              response: { output },
            },
          },
        ],
      });
    } else {
      // user role
      const parts = convertContentToParts(msg.content);
      if (parts.length > 0) {
        contents.push({ role: "user", parts });
      }
    }
  }

  // Claude forbids ending the conversation on a model/assistant turn
  // (assistant prefill). Strip any trailing model turns so the last
  // entry is always from the user side.
  while (contents.length > 0 && contents[contents.length - 1].role === "model") {
    contents.pop();
  }

  // Model resolution: gemini-3-pro requires -low or -high suffix
  // Note: gemini-3-pro is deprecated, use gemini-3.1-pro
  let effectiveModel = modelName;
  if (modelName.startsWith("gemini-3-pro")) {
    effectiveModel = modelName.replace("gemini-3-pro", "gemini-3.1-pro");
  }

  const isGemini3Pro = /^gemini-3(?:\.\d+)?-pro/i.test(effectiveModel);
  const hasTierSuffix = /-(low|medium|high)$/i.test(effectiveModel);
  if (isGemini3Pro && !hasTierSuffix) {
    effectiveModel = `${effectiveModel}-low`;
  }

  const requestBody = {
    project: projectId,
    model: effectiveModel,
    request: {
      contents,
      generationConfig: generationConfig || {},
    },
    requestType: "agent",
    userAgent: "antigravity",
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
  };

  // Forward tools as Gemini functionDeclarations
  if (Array.isArray(tools) && tools.length > 0) {
    const functionDeclarations = tools
      .filter((t) => t.type === "function" && t.function)
      .map((t) => ({
        name: t.function.name,
        description: t.function.description || "",
        parameters: sanitizeToolParameters(t.function.parameters) || {
          type: "object",
          properties: {},
        },
      }));
    if (functionDeclarations.length > 0) {
      requestBody.request.tools = [{ functionDeclarations }];
    }
  }

  // Forward tool_choice as Gemini toolConfig
  if (toolConfig) {
    requestBody.request.toolConfig = toolConfig;
  }

  if (systemParts.length > 0) {
    // Antigravity system instructions use role: "user"
    requestBody.request.systemInstruction = {
      role: "user",
      parts: systemParts,
    };
  }

  // For Claude thinking models (e.g. claude-opus-4-6-thinking), inject the thinking budget
  // at the request root level. The cloudcode-pa endpoint expects it as thinkingBudgetTokens
  // rather than inside generationConfig.
  if (generationConfig?.thinkingConfig?.thinkingBudget !== undefined) {
    const budget = generationConfig.thinkingConfig.thinkingBudget;
    if (budget > 0) {
      requestBody.thinkingBudgetTokens = budget;
    }
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
      stream: (async function* () {
        let buffer = "";
        const decoder = new TextDecoder();
        for await (const chunk of response.body) {
          const chunkStr = decoder.decode(chunk, { stream: true });
          buffer += chunkStr;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data:")) {
              try {
                const jsonStr = line.slice(5).trim();
                if (!jsonStr) continue;
                let data = JSON.parse(jsonStr);

                // Internal Antigravity API wraps the response in a 'response' field
                if (data.response) {
                  data = data.response;
                }

                yield {
                  text: () => {
                    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                      return data.candidates[0].content.parts
                        .map((p) => {
                          // Extract text from standard parts; skip thought/thinking parts
                          if (p.thought) return "";
                          return p.text || "";
                        })
                        .join("");
                    }
                    if (data.content && Array.isArray(data.content)) {
                      // Anthropic-style content array — filter out thinking blocks
                      return data.content
                        .filter((p) => p.type !== "thinking")
                        .map((p) => p.text || "")
                        .join("");
                    }
                    return "";
                  },
                  functionCalls:
                    data.candidates?.[0]?.content?.parts
                      ?.filter((p) => p.functionCall)
                      .map((p) => p.functionCall) || [],
                  // Expose usage metadata so the proxy can emit OpenAI-format usage stats
                  usageMetadata: data.usageMetadata || null,
                };
              } catch {}
            }
          }
        }
      })(),
    };
  }

  let data = await response.json();
  if (data.response) {
    data = data.response;
  }
  return {
    response: {
      text: () => {
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          return data.candidates[0].content.parts
            .map((p) => {
              if (p.thought) return "";
              return p.text || "";
            })
            .join("");
        }
        return "";
      },
      functionCalls:
        data.candidates?.[0]?.content?.parts
          ?.filter((p) => p.functionCall)
          .map((p) => p.functionCall) || [],
      usageMetadata: data.usageMetadata || null,
    },
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
];

function sanitizeToolParameters(params) {
  if (!params || typeof params !== "object") return params;
  if (Array.isArray(params)) return params.map(sanitizeToolParameters);

  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (ALLOWED_SCHEMA_KEYS.includes(k)) {
      out[k] = sanitizeToolParameters(v);
    }
  }
  return out;
}

module.exports = {
  generateContentAntigravity,
  getAntigravityModels,
  discoverProject,
  fetchAntigravityModels,
  ANTIGRAVITY_ENDPOINTS,
  DEFAULT_ANTIGRAVITY_MODELS,
  sanitizeToolParameters,
};
