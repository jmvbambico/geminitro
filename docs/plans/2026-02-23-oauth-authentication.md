# Plan: OAuth Authentication Flow for GemiNitro

> **⚠️ DEPRECATED**: See [2026-02-24-oauth-model-discovery.md](./2026-02-24-oauth-model-discovery.md) for current status.

## Goal

Implement full OAuth authentication for GemiNitro to allow users to authenticate with Google and add new accounts via browser OAuth flow, not just import existing ones.

## Background

Currently, GemiNitro can:

- Import existing Antigravity accounts from OpenCode
- Import existing Gemini CLI accounts from `~/.gemini/oauth_creds.json`

But it cannot trigger new OAuth flows - it only imports existing tokens.

**IMPORTANT UX RULE:** Never auto-import. Always ask the user first.

- If existing accounts detected: Ask "Import existing or authenticate new?"
- If no existing accounts: Offer to authenticate via OAuth

OpenCode's Antigravity uses (public credentials - set via env vars or use defaults):

- Client ID: Set via `OAUTH_CLIENT_ID` env var (default provided)
- Client Secret: Set via `OAUTH_CLIENT_SECRET` env var (default provided)
- Redirect URI: `http://localhost:7536/oauth-callback`
- Scopes: `https://www.googleapis.com/auth/cloud-platform`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`, `https://www.googleapis.com/auth/cclog`, `https://www.googleapis.com/auth/experimentsandconfigs`

## Architecture

### New Files (COMPLETED)

1. `services/oauthService.js` - OAuth authentication service ✅
2. `services/antigravityService.js` - Antigravity API + model discovery ✅

### Modified Files (COMPLETED)

1. `services/keyService.js` - Add OAuth import functions ✅
2. `src/cli/firstRun.js` - Updated flow ✅
3. `src/cli/keys.js` - Add new CLI commands ✅
4. `routes/apiRoutes.js` - Add API endpoints for OAuth flow ✅
5. `dashboard/src/pages/Setup.tsx` - Add OAuth button flow ✅

## Current Status

All phases completed ✅ EXCEPT projectId discovery via `/v1internal:loadCodeAssist`.

See [2026-02-24-oauth-model-discovery.md](./2026-02-24-oauth-model-discovery.md) for details.

## Verification

After each task:

- Run `npm run lint` - must pass
- Run `npm run build` - must pass
- Test the feature manually

## Notes

- Use `@openauthjs/openauth` PKCE generation or implement manually
- Need to handle both Antigravity and Gemini CLI OAuth (they use different endpoints)
- Gemini CLI uses production endpoint: `https://cloudcode-pa.googleapis.com`
- Antigravity uses daily sandbox: `https://daily-cloudcode-pa.sandbox.googleapis.com`
