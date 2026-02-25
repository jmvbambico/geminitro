"use strict";

const crypto = require("crypto");
const http = require("http");
const config = require("../config");

// OAuth client configurations
// Credentials must be set via OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env
// See README for where to obtain these values
const OAUTH_CLIENTS = {
  antigravity: {
    clientId: config.OAUTH_CLIENT_ID,
    clientSecret: config.OAUTH_CLIENT_SECRET,
    redirectUri: `http://localhost:${config.PORT}/oauth-callback`,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    provider: "antigravity",
  },
  gemini_cli: {
    clientId: config.OAUTH_CLIENT_ID,
    clientSecret: config.OAUTH_CLIENT_SECRET,
    redirectUri: `http://localhost:${config.PORT}/oauth-callback`,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/cclog",
      "https://www.googleapis.com/auth/experimentsandconfigs",
    ],
    provider: "gemini_cli",
  },
};

let oauthServer = null;
let oauthServerResolver = null; // Resolves the startOAuthServer promise
let oauthServerRejecter = null; // Rejects the startOAuthServer promise
let pending_verifiers = {}; // { state: { verifier, provider, resolve, reject, timeout } }

const OAUTH_CALLBACK_PORT = config.PORT;

// Start a local OAuth server to receive the callback
// This is used by CLI-based OAuth flows
function startOAuthServer() {
  return new Promise((resolve, reject) => {
    // Prevent multiple servers
    if (oauthServer) {
      return resolve({
        refreshToken: null,
        accessToken: null,
        email: null,
        provider: "antigravity",
        message: "Server already running",
      });
    }

    oauthServerResolver = resolve;
    oauthServerRejecter = reject;

    oauthServer = http.createServer(async (req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${OAUTH_CALLBACK_PORT}`);

      if (parsedUrl.pathname === "/oauth-callback") {
        const code = parsedUrl.searchParams.get("code");
        const state = parsedUrl.searchParams.get("state");
        const error = parsedUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
                <div style="text-align: center;">
                  <h1 style="color: #ef4444;">Authentication Failed</h1>
                  <p>${error}</p>
                  <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
                </div>
              </body>
            </html>
          `);
          if (oauthServerRejecter) {
            oauthServerRejecter(new Error(error));
          }
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code or state");
          return;
        }

        try {
          // Try both providers since we don't know which one
          let tokens;
          try {
            tokens = await exchangeCode("antigravity", code, state);
          } catch {
            tokens = await exchangeCode("gemini_cli", code, state);
          }

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
                <div style="text-align: center;">
                  <h1 style="color: #22c55e;">Authentication Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                  <script>setTimeout(() => window.close(), 2000)</script>
                </div>
              </body>
            </html>
          `);

          if (oauthServerResolver) {
            oauthServerResolver(tokens);
          }
        } catch (e) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white;">
                <div style="text-align: center;">
                  <h1 style="color: #ef4444;">Authentication Failed</h1>
                  <p>${e.message}</p>
                  <button onclick="window.close()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
                </div>
              </body>
            </html>
          `);
          if (oauthServerRejecter) {
            oauthServerRejecter(e);
          }
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    oauthServer.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        // Port already in use - server might be running
        reject(
          new Error(
            `Port ${config.PORT} is already in use. Is the GemiNitro server running? Stop it first or use web-based authentication.`,
          ),
        );
      } else {
        reject(err);
      }
      oauthServer = null;
      oauthServerResolver = null;
      oauthServerRejecter = null;
    });

    oauthServer.listen(OAUTH_CALLBACK_PORT, () => {
      console.log(`OAuth server listening on http://localhost:${OAUTH_CALLBACK_PORT}`);
    });
  });
}

// Stop the OAuth server
async function stopOAuthServer() {
  if (oauthServer) {
    return new Promise((resolve) => {
      oauthServer.close(() => {
        oauthServer = null;
        oauthServerResolver = null;
        oauthServerRejecter = null;
        resolve();
      });
    });
  }
}

// PKCE helpers
function base64urlEncode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  return base64urlEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64urlEncode(crypto.createHash("sha256").update(verifier).digest());
}

function generateState() {
  return base64urlEncode(crypto.randomBytes(16));
}

// Generate OAuth authorization URL
function generateAuthUrl(providerName) {
  const client = OAUTH_CLIENTS[providerName];
  if (!client) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }

  if (!client.clientId || !client.clientSecret) {
    throw new Error(
      "OAuth not configured. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env — see README for details.",
    );
  }

  const codeVerifier = generateCodeVerifier();
  const state = generateState();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store verifier for callback
  pending_verifiers[state] = {
    verifier: codeVerifier,
    provider: providerName,
    createdAt: Date.now(),
  };

  const authUrl = new URL(client.authUrl);
  authUrl.searchParams.set("client_id", client.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", client.redirectUri);
  authUrl.searchParams.set("scope", client.scopes.join(" "));
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return {
    url: authUrl.toString(),
    state,
  };
}

// Exchange authorization code for tokens
async function exchangeCode(providerName, code, state) {
  const client = OAUTH_CLIENTS[providerName];
  if (!client) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }

  const pending = pending_verifiers[state];
  if (!pending) {
    throw new Error("Invalid state - no pending verification found");
  }

  if (pending.provider !== providerName) {
    throw new Error("Provider mismatch");
  }

  const { verifier } = pending;

  // Clean up pending verifier
  delete pending_verifiers[state];

  // Exchange code for tokens
  const tokenResponse = await fetch(client.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: client.redirectUri,
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${errorText}`);
  }

  const tokenPayload = await tokenResponse.json();

  // Get user info
  const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });

  const userInfo = userInfoResponse.ok ? await userInfoResponse.json() : {};

  // Google OAuth may not return refresh_token if user already authorized
  // This happens even with prompt=consent when tokens already exist
  if (!tokenPayload.refresh_token) {
    throw new Error(
      "No refresh token returned. Google OAuth doesn't return refresh tokens for already-authorized accounts. " +
        "Use 'geminitro key import-antigravity' or 'geminitro key import-gemini-cli' instead.",
    );
  }

  return {
    refreshToken: tokenPayload.refresh_token,
    accessToken: tokenPayload.access_token,
    expiresIn: tokenPayload.expires_in,
    email: userInfo.email,
    provider: providerName,
  };
}

// Cleaning up pending verifiers older than 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const state in pending_verifiers) {
    if (now - pending_verifiers[state].createdAt > 10 * 60 * 1000) {
      delete pending_verifiers[state];
    }
  }
}, 60 * 1000);

function getOAuthClient(providerName) {
  return OAUTH_CLIENTS[providerName] || null;
}

function getAvailableProviders() {
  return Object.keys(OAUTH_CLIENTS);
}

// Exchange refresh token for access token (used for API calls)
async function getAccessTokenFromRefreshToken(refreshToken, providerName = "antigravity") {
  const client = OAUTH_CLIENTS[providerName];
  if (!client) {
    throw new Error(`Unknown OAuth provider: ${providerName}`);
  }

  if (!client.clientId || !client.clientSecret) {
    throw new Error(
      "OAuth not configured. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env — see README for details.",
    );
  }

  const tokenResponse = await fetch(client.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokenPayload = await tokenResponse.json();

  // Decode id_token JWT to get user email
  let email = null;
  if (tokenPayload.id_token) {
    try {
      const jwtParts = tokenPayload.id_token.split(".");
      if (jwtParts.length === 3) {
        const payload = JSON.parse(Buffer.from(jwtParts[1], "base64").toString("utf8"));
        email = payload.email || null;
      }
    } catch {}
  }

  return {
    accessToken: tokenPayload.access_token,
    expiresIn: tokenPayload.expires_in,
    email,
  };
}

module.exports = {
  generateAuthUrl,
  exchangeCode,
  getOAuthClient,
  getAvailableProviders,
  getAccessTokenFromRefreshToken,
  startOAuthServer,
  stopOAuthServer,
  OAUTH_CLIENTS,
};
