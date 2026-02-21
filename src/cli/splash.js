"use strict";
const chalk = require("chalk");

const LOGO_LINES = [
  "▄▀▀▀ ▄███ █▄ ▄█ ▄█ █▄ █ 💥 █▀█▀█ █▀▀▄  ▄█▄",
  "█ ▀█ █▄▄  █ █ █ ██ █ ▀█ ██   █   █▄▄▀ ░▒ ▒░",
  "▀▀▀▀ ▀▀▀▀ ▀   ▀ ▀▀ ▀  ▀ ▀▀   ▀   ▀  ▀  ▀▀▀",
  "░░░░ ░░░░ ░   ░ ░░ ░  ░ ░░   ░   ░  ░   ░ ",
];

const printSplash = (version, port) => {
  const w = process.stdout.columns || 80;
  process.stdout.write("\n");

  const fireColors = [
    chalk.hex("#FF4400"),
    chalk.hex("#FF8800"),
    chalk.hex("#FFCC00"),
    chalk.hex("#FFFF66"),
  ];

  for (let i = 0; i < LOGO_LINES.length; i++) {
    process.stdout.write("  " + fireColors[i](LOGO_LINES[i]) + "\n");
  }

  process.stdout.write("\n");
  process.stdout.write(chalk.gray("  " + "─".repeat(Math.min(w - 4, 56))) + "\n");
  process.stdout.write(
    `  ${chalk.bold.white("GemiNitro")} ${chalk.gray("v" + version)}` +
      `  ${chalk.gray("·")}  ${chalk.hex("#FF8800")("Gemini API Proxy")}  ${chalk.gray("·")}  ${chalk.cyan("Coding Agent Proxy")}\n`,
  );
  process.stdout.write(
    `  ${chalk.green("●")} ${chalk.white("http://localhost:" + port + "/v1")}` +
      `  ${chalk.gray("·")}  ${chalk.gray("apiKey:")} ${chalk.yellowBright("geminitro")}\n`,
  );
  process.stdout.write(chalk.gray("  " + "─".repeat(Math.min(w - 4, 56))) + "\n");
  process.stdout.write("\n");
};

module.exports = { printSplash };
