const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");

const config = require("./config");

// Clean up old cache file (if exists)
const oldCachePath = path.join(config.DATA_DIR, "antigravity-models.json");
if (fs.existsSync(oldCachePath)) {
  try {
    fs.unlinkSync(oldCachePath);
  } catch {}
}

const keyService = require("./services/keyService");
const geminiService = require("./services/geminiService");
const statsService = require("./services/statsService");
const updateService = require("./services/updateService");
const apiRoutes = require("./routes/apiRoutes");
const logger = require("./utils/logger");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
logger.setIo(io);
io.on("connection", (socket) => {
  socket.emit("stats_update", keyService.getSafeKeyPool());
  socket.emit("stats_update_full", statsService.getStats());
  logger.info("Dashboard connected to live socket stream");
});
const PORT = config.PORT;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "50mb" }));

app.use((req, res, next) => {
  const start = Date.now();
  const reqBody = req.body;

  // Capture response body for verbose logging
  const originalJson = res.json.bind(res);
  let resBody = null;

  res.json = function (body) {
    resBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(req, res, duration);

    // Verbose logging with request/response bodies
    if (config.VERBOSE_LOGGING) {
      logger.httpVerbose(req, res, duration, reqBody, resBody);
    }
  });

  next();
});

try {
  keyService.loadKeys();
  geminiService.initializeModelFetching();
  statsService.initialize();
} catch (error) {
  console.error("Failed to initialize services:", error);
  process.exit(1);
}

updateService.backgroundCheck(logger, config.AUTO_UPDATE).catch(() => {});

// Ensure dashboard is built
const dashboardPath = path.join(__dirname, "public");
if (!fs.existsSync(dashboardPath)) {
  console.log("Building dashboard (first run)...");
  try {
    require("child_process").execSync("npm run build", { stdio: "inherit" });
  } catch {
    console.error("Failed to build dashboard. Run 'npm run build' manually.");
  }
}

// Serve built dashboard at /dashboard
if (fs.existsSync(dashboardPath)) {
  app.use("/dashboard", express.static(dashboardPath));
  // SPA fallback — send index.html for any /dashboard/* route not matched as a file
  app.get(/^\/dashboard(\/.*)?$/, (req, res) => {
    res.sendFile(path.join(dashboardPath, "index.html"));
  });
}

app.use("/", apiRoutes(io));

app.use((err, req, res, _next) => {
  logger.error("Unhandled error", err);
  res.status(500).json({ error: "Internal Server Error" });
});

const shutdown = () => {
  console.log("");
  logger.info("Shutting down gracefully...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

server.listen(PORT, () => {
  console.log(`\n===========================================`);
  console.log(`GemiNitro is running`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`===========================================\n`);
});
