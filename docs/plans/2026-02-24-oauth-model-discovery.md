# Plan: OAuth Model Discovery & Agent Config Updates

## Goal

Add Antigravity and Gemini CLI OAuth accounts to GemiNitro's account pool to extend rate limits. Implement dynamic model discovery - when an account authenticates, discover available models and update agent configs.

## Background

Current issues found:

- Antigravity accounts can be imported but model discovery never triggers
- `updateAgentConfig` function exists but is never called anywhere
- When models ARE set, only the first model is used for most agents
- Fallback DEFAULT_ANTIGRAVITY_MODELS masks failures instead of failing gracefully
- Derived projectId from email doesn't work - need to use `/v1internal:loadCodeAssist`

## Discoveries (Research Phase)

1. **No Antigravity ListModels API exists** - Antigravity doesn't expose a models endpoint. Solution: crawl GitHub spec (`NoeFabris/opencode-antigravity-auth/docs/ANTIGRAVITY_API_SPEC.md`) for dynamic model list
2. **projectId is critical** - Antigravity OAuth tokens require a valid projectId tied to the user's Google Cloud account. Derived email-based projectIds (like `jmvbambico`) don't work
3. **fetchUserProjects from Google Cloud API fails** - The Google Cloud Resource Manager API returns user's projects but none work with Antigravity
4. **Plugin uses loadCodeAssist** - The opencode-antigravity-auth plugin uses `/v1internal:loadCodeAssist` endpoint to provision/discover the project (from API spec)

## Accomplished

### Phase 1 - Model Discovery on Import ✅

- Modified `keyService.js`: Added model discovery to `importAntigravityAccounts()`, `importGeminiCliAccounts()`, `addOAuthToken()`
- Modified `antigravityService.js`: Removed DEFAULT_ANTIGRAVITY_MODELS fallback, returns empty array on failure
- Modified `geminiService.js`: Fixed to prioritize API keys for model discovery, added `keyType` filter to `getOptimalKey`

### Phase 2 - Wired up updateAgentConfig ✅

- Modified `apiRoutes.js`: Import install module, call `updateAgentConfig` after key operations
- Modified `keys.js`: Call `updateAgentConfig` after CLI OAuth completions

### Phase 3 - Fix updateAgentConfig ✅

- Modified `install.js`: Fixed Continue.dev to add ALL models (was only first)
- OpenCode already worked with full list

### Phase 4 - Dynamic Model Discovery from GitHub ✅

- Added `fetchModelsFromGitHub()` to crawl community spec
- Added 24-hour caching
- Falls back to hardcoded DEFAULT_ANTIGRAVITY_MODELS

### Phase 5 - /v1/models endpoint ✅

- Now returns both API key models + OAuth models

### Phase 6 - ProjectId Infrastructure ✅

- Added `projectId` to key storage from Antigravity accounts
- Modified `oauthService.js` to extract email from id_token JWT
- Added `fetchUserProjects()` from Google Cloud API
- Switched to daily endpoint

## Remaining Work

### Critical Blocker: projectId from loadCodeAssist

**Current Error:**

```
Permission denied on resource project jmvbambico
```

The derived project from email doesn't have Antigravity access. Need to implement the loadCodeAssist flow.

**What needs to be done:**

1. **Implement `loadCodeAssist` call** in `antigravityService.js`:
   - Add function `discoverProject(refreshToken, provider)` that calls `POST /v1internal:loadCodeAssist`
   - Extract the correct `projectId` from the response
   - Cache discovered project per account (in memory or key storage)

2. **Update `generateContentAntigravity`** to use discovered project:
   - Before making generateContent call, call `discoverProject()` if no valid projectId
   - Use the returned projectId instead of derived email-based project

3. **Test the flow** with a real Antigravity OAuth account

## Files Modified

| File                             | Changes                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `services/keyService.js`         | OAuth account detection/import, model discovery triggers               |
| `services/antigravityService.js` | Antigravity API calls, model discovery from GitHub, projectId handling |
| `services/oauthService.js`       | OAuth token handling, email extraction from JWT                        |
| `services/geminiService.js`      | Model discovery, key type filtering                                    |
| `routes/apiRoutes.js`            | API endpoints, updateAgentConfig calls                                 |
| `src/cli/keys.js`                | CLI commands for OAuth, model discovery triggers                       |
| `src/cli/install.js`             | Agent config updates with ALL models                                   |

## Files Added

| File                                             | Purpose                             |
| ------------------------------------------------ | ----------------------------------- |
| `services/antigravityService.js`                 | Antigravity OAuth + model discovery |
| `services/oauthService.js`                       | OAuth token management              |
| `docs/plans/2026-02-23-oauth-authentication.md`  | Original OAuth auth plan            |
| `docs/plans/2026-02-24-oauth-model-discovery.md` | This plan                           |

## Verification

After each task:

- Run `npm run lint` - must pass
- Run `npm run format:check` - must pass
- Run `npm run build` - must pass
