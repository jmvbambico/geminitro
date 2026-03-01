"use strict";
const chalk = require("chalk");

const bar = (value, max, width = 18) => {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  return chalk.hex("#FF8800")("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
};

const fmtUptime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(" ");
};

const run = async () => {
  const { PORT, PROXY_API_KEY } = require("../../config");
  const base = `http://localhost:${PORT}`;
  const headers = { Authorization: `Bearer ${PROXY_API_KEY}` };

  let health, stats, capsProgress;
  try {
    const [hr, sr, cr] = await Promise.all([
      fetch(`${base}/api/health`),
      fetch(`${base}/api/stats`, { headers }),
      fetch(`${base}/api/stats/caps/progress`, { headers }),
    ]);
    if (!hr.ok) throw new Error("no response");
    health = await hr.json();
    stats = await sr.json();
    capsProgress = cr.ok ? await cr.json() : [];
  } catch {
    console.error(chalk.red(`\n  ✗ Cannot reach GemiNitro on :${PORT} — is it running?\n`));
    console.error(chalk.gray("  Start with: geminitro start\n"));
    process.exit(1);
  }

  const total = stats.totalRequests || 0;
  const successRate = total > 0 ? ((stats.totalSuccess / total) * 100).toFixed(1) : "0.0";
  const rateColor = parseFloat(successRate) >= 90 ? chalk.green : chalk.yellow;

  console.log(chalk.bold("\n  GemiNitro — Live Stats\n"));
  console.log(chalk.gray("  " + "─".repeat(56)));
  console.log(
    `  ${chalk.cyan("Version")}    v${health.version}    ${chalk.cyan("Uptime")}  ${fmtUptime(health.uptime)}    ${chalk.cyan("Port")}  ${PORT}`,
  );
  console.log(chalk.gray("  " + "─".repeat(56)));

  console.log(chalk.bold("\n  Requests\n"));
  console.log(`  ${chalk.white("Total".padEnd(14))} ${total}`);
  console.log(
    `  ${chalk.green("Success".padEnd(14))} ${bar(stats.totalSuccess, total)}  ${stats.totalSuccess}`,
  );
  console.log(
    `  ${chalk.red("Errors".padEnd(14))} ${bar(stats.totalErrors, total)}  ${stats.totalErrors}`,
  );
  console.log(`  ${"Success Rate".padEnd(14)} ${rateColor(successRate + "%")}`);

  console.log(chalk.bold("\n  Key Pool\n"));
  console.log(`  ${"Total".padEnd(14)} ${health.keys.total}`);
  console.log(`  ${chalk.green("Active".padEnd(14))} ${health.keys.active}`);
  const cdCount = health.keys.cooldown;
  console.log(
    `  ${(cdCount > 0 ? chalk.yellow : chalk.gray)("Cooldown".padEnd(14))} ${cdCount > 0 ? chalk.yellow(cdCount) : chalk.gray(cdCount)}`,
  );
  console.log(`  ${"Models".padEnd(14)} ${health.models}`);

  // Legacy model usage (old tracking)
  if (stats.models && Object.keys(stats.models).length > 0) {
    console.log(chalk.bold("\n  Top Models\n"));
    const sorted = Object.entries(stats.models)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const peak = sorted[0][1];
    for (const [model, count] of sorted) {
      console.log(`  ${chalk.gray(model.padEnd(38))} ${bar(count, peak, 12)}  ${count}`);
    }
  }

  // Unified model statistics (new tracking - API keys + OAuth accounts)
  if (stats.modelStats && Object.keys(stats.modelStats).length > 0) {
    console.log(chalk.bold("\n  Unified Model Usage (All Account Types)\n"));
    const sorted = Object.entries(stats.modelStats)
      .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
      .slice(0, 6);
    const peak = sorted[0]?.[1]?.totalRequests || 1;

    for (const [model, modelStat] of sorted) {
      const errorRate = (modelStat.errorRate * 100).toFixed(1);
      const errorColor = parseFloat(errorRate) > 10 ? chalk.red : chalk.gray;

      // Account type breakdown
      const accountBreakdown = Object.entries(modelStat.accountTypes || {})
        .map(([type, count]) => {
          const label = type === "api_key" ? "API" : type === "oauth" ? "OAuth" : type;
          return `${label}:${count}`;
        })
        .join(" ");

      console.log(
        `  ${chalk.gray(model.padEnd(30))} ${bar(modelStat.totalRequests, peak, 12)}  ${modelStat.totalRequests} req`,
      );
      console.log(
        `  ${chalk.gray(" ".repeat(30))} ${chalk.dim(accountBreakdown)}  ${errorColor(errorRate + "% err")}`,
      );
    }
  }

  if (stats.dailyStats && Object.keys(stats.dailyStats).length > 0) {
    console.log(chalk.bold("\n  Daily (last 7 days)\n"));
    const days = Object.entries(stats.dailyStats)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7);
    const peak = Math.max(...days.map((d) => d[1].requests), 1);
    for (const [date, day] of days) {
      const errPart = day.errors > 0 ? `  ${chalk.red(day.errors + " err")}` : "";
      console.log(
        `  ${chalk.gray(date.padEnd(12))} ${bar(day.requests, peak, 14)}  ${day.requests} req${errPart}`,
      );
    }
  }

  // Usage Caps
  if (capsProgress && capsProgress.length > 0) {
    console.log(chalk.bold("\n  Usage Caps\n"));
    for (const cap of capsProgress) {
      const barColor = cap.atCap ? chalk.red : cap.atWarning ? chalk.yellow : chalk.green;
      const statusText = cap.atCap
        ? chalk.red("CAP REACHED")
        : cap.atWarning
          ? chalk.yellow("WARNING")
          : chalk.gray("OK");

      console.log(
        `  ${chalk.gray(cap.model.padEnd(30))} ${barColor(bar(cap.current, cap.limit, 12))}  ${cap.current}/${cap.limit}  ${statusText}`,
      );
    }
  }

  console.log("");
};

module.exports = { run };
