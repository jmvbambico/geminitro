"use strict";

const crypto = require("crypto");
const http = require("http");
const url = require("url");
const config = require("../config");

// Validate OAuth credentials
if (!config.OAUTH_CLIENT_ID || !config.OAUTH_CLIENT_SECRET) {
  throw new Error(
    "OAuth credentials not configured. Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env",
  );
}

// OAuth client configurations
const OAUTH_CLIENTS = {
  antigravity: {
    clientId: config.OAUTH_CLIENT_ID,
    clientSecret: config.OAUTH_CLIENT_SECRET,
    redirectUri: "http://localhost:7536/oauth-callback",
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
    redirectUri: "http://localhost:7536/oauth-callback",
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
let pending_verifiers = {}; // { state: { verifier, provider, resolve, reject, timeout } }

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

// OAuth callback server - returns promise that resolves when OAuth completes
let oauthResolve = null;
let oauthReject = null;

function startOAuthServer() {
  return new Promise((resolve, reject) => {
    oauthResolve = resolve;
    oauthReject = reject;

    if (oauthServer) {
      // Server already running
      resolve({ alreadyRunning: true });
      return;
    }

    oauthServer = http.createServer(async (req, res) => {
      const parsedUrl = new url.URL(req.url, `http://localhost:${config.PORT}`);
      const pathname = parsedUrl.pathname;

      if (pathname === "/oauth-callback") {
        const code = parsedUrl.searchParams.get("code");
        const state = parsedUrl.searchParams.get("state");
        const error = parsedUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>Error: ${error}</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (oauthReject) oauthReject(new Error(error));
          return;
        }

        if (!code || !state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Missing Parameters</h1>
                <p>Authorization code or state missing.</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (oauthReject) oauthReject(new Error("Missing code or state"));
          return;
        }

        // Find the pending verifier
        const pending = pending_verifiers[state];
        if (!pending) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Invalid State</h1>
                <p>State parameter not found or expired.</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (oauthReject) oauthReject(new Error("Invalid state"));
          return;
        }

        try {
          const tokens = await exchangeCode(pending.provider, code, state);
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
                <script>setTimeout(() => window.close(), 2000)</script>
              </body>
            </html>
          `);
          if (oauthResolve) oauthResolve(tokens);
        } catch (err) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body>
                <h1>Authentication Failed</h1>
                <p>${err.message}</p>
                <script>window.close()</script>
              </body>
            </html>
          `);
          if (oauthReject) oauthReject(err);
        }
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    oauthServer.on("error", (err) => {
      oauthServer = null;
      reject(err);
    });

    oauthServer.listen(config.PORT, () => {
      // Server started - don't resolve promise yet.
      // It will resolve when oauthResolve() is called from the callback.
    });
  });
}

function stopOAuthServer() {
  return new Promise((resolve) => {
    if (oauthServer) {
      oauthServer.close(() => {
        oauthServer = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}

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
  startOAuthServer,
  stopOAuthServer,
  getOAuthClient,
  getAvailableProviders,
  getAccessTokenFromRefreshToken,
  OAUTH_CLIENTS,
};
