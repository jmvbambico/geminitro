"use strict";
const { execSync } = require("child_process");
const path = require("path");

const REPO = "jmvbambico/geminitro";
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const ROOT = path.join(__dirname, "..");

const parseSemver = (tag) => {
  const m = String(tag)
    .replace(/^v/, "")
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
};

const isNewer = (local, remote) => {
  const l = parseSemver(local);
  const r = parseSemver(remote);
  if (!l || !r) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
};

const fetchLatestRelease = async () => {
  try {
    const res = await fetch(RELEASES_URL, {
      headers: { "User-Agent": "geminitro-updater" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      tag: data.tag_name,
      url: data.html_url,
      notes: data.body || "",
    };
  } catch {
    return null;
  }
};

const checkForUpdate = async () => {
  const current = require("../package.json").version;
  const release = await fetchLatestRelease();
  if (!release) return { available: false, current };
  const available = isNewer(current, release.tag);
  return { available, current, latest: release.tag, url: release.url };
};

const applyUpdate = () => {
  try {
    execSync("git pull --ff-only", { cwd: ROOT, stdio: "pipe" });
    execSync("npm install --prefer-offline", { cwd: ROOT, stdio: "pipe" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const backgroundCheck = async (logger, autoUpdate = false) => {
  const result = await checkForUpdate();
  if (!result.available) return;

  if (autoUpdate) {
    logger.info(`Auto-updating to ${result.latest}...`);
    const applied = applyUpdate();
    if (applied.ok) {
      logger.info(`Updated to ${result.latest}. Restart to apply.`);
    } else {
      logger.warn(`Auto-update failed: ${applied.error}`);
    }
  } else {
    logger.info(
      `Update available: ${result.latest} (current: ${result.current}) — run \`geminitro update\``,
    );
  }
};

module.exports = { checkForUpdate, applyUpdate, backgroundCheck };
