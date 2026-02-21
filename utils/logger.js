"use strict";

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

const modelRefresh = (count) => {
  log("MODEL", `Refreshed ${count} models from Gemini API`);
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
