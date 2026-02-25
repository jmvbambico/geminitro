"use strict";

const config = require("../config");
const chalk = require("chalk");

const LOG_COLORS = {
  HTTP: chalk.cyan,
  KEY: chalk.yellow,
  PROXY: chalk.hex("#FF8800"),
  MODEL: chalk.magenta,
  ERROR: chalk.red,
  INFO: chalk.green,
  WARN: chalk.hex("#FFAA00"),
};

let ioInstance = null;
const setIo = (io) => {
  ioInstance = io;
};

const log = (type, message, data = null) => {
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  const colorFn = LOG_COLORS[type] || chalk.white;
  const prefix = colorFn(`[${type}]`);

  let output = `${chalk.gray(timestamp)} ${prefix} ${message}`;
  if (data) {
    output += ` ${chalk.gray(JSON.stringify(data))}`;
  }

  console.log(output);

  if (ioInstance) {
    const entry = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      message,
      timestamp,
      data,
    };
    ioInstance.emit("log", entry);
  } else {
    // console.log("!! ioInstance is NULL - cannot emit log !!");
  }
};

const http = (req, res, duration) => {
  const method = req.method.padEnd(6);
  const path = req.path;
  const status = res.statusCode < 400 ? chalk.green(res.statusCode) : chalk.red(res.statusCode);
  const ms = `${duration.toFixed(0)}ms`.padStart(6);

  log("HTTP", `${chalk.white(method)} ${path} ${status} ${chalk.gray(ms)}`);
};

/**
 * Sanitize a request/response body before verbose logging.
 * - Summarises `messages` arrays (common in AI proxy payloads) so that large
 *   model inference blobs and raw <function_calls> XML never reach the log.
 * - Truncates any individual string value that exceeds MAX_STR_LEN characters.
 */
const MAX_STR_LEN = 300;

function sanitizeForLog(obj, depth = 0) {
  if (obj === null || obj === undefined) return obj;

  // Summarise `messages` arrays at the top two levels only (avoids false positives)
  if (depth <= 1 && Array.isArray(obj?.messages)) {
    const summarised = obj.messages.map((m) => {
      const role = m?.role ?? "?";
      const content = m?.content;
      if (typeof content === "string") {
        let preview = content.slice(0, 80).replace(/\n/g, " ");
        if (content.length > 80) preview += `…`;
        return { role, content: `[${content.length} chars] ${preview}` };
      }
      if (Array.isArray(content)) {
        return { role, content: `[${content.length} parts]` };
      }
      return { role };
    });
    return { ...obj, messages: summarised };
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item, depth + 1));
  }

  if (typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeForLog(v, depth + 1);
    }
    return out;
  }

  if (typeof obj === "string" && obj.length > MAX_STR_LEN) {
    return `${obj.slice(0, MAX_STR_LEN)}…(${obj.length} chars)`;
  }

  return obj;
}

const httpVerbose = (req, res, duration, reqBody, resBody) => {
  if (!config.VERBOSE_LOGGING) return;

  const method = req.method;
  const path = req.path;
  const status = res.statusCode;
  const ms = `${duration.toFixed(0)}ms`;

  // Build multi-line verbose log
  const lines = [];
  lines.push(`${method} ${path} - ${status} (${ms})`);

  // Request details — sanitised to avoid dumping multi-paragraph AI content
  if (reqBody && Object.keys(reqBody).length > 0) {
    lines.push(`Request:`);
    try {
      const formatted = JSON.stringify(sanitizeForLog(reqBody), null, 2);
      formatted.split("\n").forEach((line) => lines.push(`  ${line}`));
    } catch {
      lines.push(`  ${String(reqBody)}`);
    }
  }

  // Response details — sanitised similarly
  if (resBody) {
    lines.push(`Response:`);
    try {
      const formatted = JSON.stringify(sanitizeForLog(resBody), null, 2);
      formatted.split("\n").forEach((line) => lines.push(`  ${line}`));
    } catch {
      lines.push(`  ${String(resBody)}`);
    }
  }

  // Emit as single multi-line message
  const message = lines.join("\n");
  log("HTTP", message);
};

const keyAdded = (keyTail, modelCount) => {
  log("KEY", `Key added: ...${keyTail} (${modelCount} models available)`);
};

const keyRemoved = (keyTail) => {
  log("KEY", `Key removed: ...${keyTail}`);
};

const keyCooldown = (keyTail, reason) => {
  log("KEY", `Key cooling down: ...${keyTail} — ${reason}`);
};

const keyRecovered = (keyTail) => {
  log("KEY", `Key recovered: ...${keyTail}`);
};

const proxyRequest = (model, keyTail) => {
  log("PROXY", `→ ${model} via ...${keyTail}`);
};

const proxyResponse = (model, status, duration) => {
  const statusStr = status === "success" ? chalk.green("✓") : chalk.red("✗");
  log("PROXY", `${statusStr} ${model} ${chalk.gray(duration + "ms")}`);
};

const proxyRetry = (model, keyTail, attempt) => {
  log("PROXY", `↻ Retrying ${model} with ...${keyTail} (attempt ${attempt})`);
};

const modelRefresh = (count, source = "Gemini API") => {
  log("MODEL", `Refreshed ${count} models from ${source}`);
};

const error = (message, err = null) => {
  if (err) {
    log("ERROR", `${message}: ${err.message}`);
  } else {
    log("ERROR", message);
  }
};

const info = (message) => {
  log("INFO", message);
};

const warn = (message) => {
  log("WARN", message);
};

module.exports = {
  setIo,
  log,
  http,
  httpVerbose,
  keyAdded,
  keyRemoved,
  keyCooldown,
  keyRecovered,
  proxyRequest,
  proxyResponse,
  proxyRetry,
  modelRefresh,
  error,
  info,
  warn,
};
