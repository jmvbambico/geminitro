# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-03-02

### Added

#### Enhanced Model Management

- **Dynamic Model Discovery**: Per-key model fetching with 6-hour refresh cycle (`MODEL_FETCH_INTERVAL=21600000`)
  - Eliminates stale model errors (e.g., experimental models like `gemini-2.0-flash-exp`)
  - Request-driven discovery when model unknown
  - Automatic removal of models no longer available
- **Cross-Source Routing**: Automatic failover across API keys → Antigravity OAuth → Gemini CLI OAuth
  - Configurable source preference order
  - Dynamic discovery across all sources
  - Unified model availability
- **Model Aliasing System**: Create user-friendly aliases for frequently-used models
  - CLI commands: `geminitro alias add/remove/list`
  - Stored in `.geminitro/models.json`
  - Transparent resolution in request flow
  - Example: `flash` → `gemini-2.0-flash`
- **Quota Groups**: Share quota limits across model variants
  - CLI commands: `geminitro quota-group add/remove/list`
  - Default groups for Gemini CLI and Antigravity models
  - When one model hits quota, entire group enters cooldown
- **Background Quota Refresh**: Proactive 5-minute polling for OAuth keys (`QUOTA_REFRESH_INTERVAL=300000`)
  - Filters keys with <5% quota remaining before making requests
  - Prevents rate limit errors
  - OAuth-only feature (Antigravity, Gemini CLI)
- **Proper Case Normalization**: Consistent "Gemini 2.0 Flash" formatting across all sources
  - User input normalized to Proper Case
  - Converted to kebab-case for API calls
  - Works with API keys, Antigravity OAuth, and Gemini CLI OAuth

#### New CLI Commands

- `geminitro alias add <name> <target>` - Create model alias
- `geminitro alias remove <name>` - Remove model alias
- `geminitro alias list` - List all aliases
- `geminitro quota-group add <name> <models...>` - Create quota group
- `geminitro quota-group remove <name>` - Remove quota group
- `geminitro quota-group list` - List all quota groups

#### New Configuration Options

- `MODEL_FETCH_INTERVAL` - Model refresh interval (default: 6 hours)
- `QUOTA_REFRESH_INTERVAL` - OAuth quota polling interval (default: 5 minutes)

#### New Services & Utilities

- `services/aliasService.js` - Model aliasing CRUD operations
- `services/quotaGroupService.js` - Quota group management
- `services/quotaRefreshService.js` - Background quota polling service
- `src/cli/migrateModelsJson.js` - Auto-migration script for `models.json` schema
- `utils/modelNormalizer.js` - Proper Case ↔ kebab-case conversion utilities

### Changed

- **Model Fetch Interval**: Increased from 1 hour to 6 hours for better performance
- **models.json Schema**: Migrated from array format to object with `models`, `aliases`, and `quotaGroups`
  - Auto-migration runs on server startup with timestamped backup
  - Fully backward compatible
- **Key Selection**: Enhanced `getOptimalKeyWithDiscovery()` with cross-source routing logic
- **Model Normalization**: All models displayed in Proper Case, sent to API in kebab-case

### Fixed

- **Critical Bug**: Removed `thought_signature` field from function calling (rejected by Gemini API in gemini-2.5-pro)
- **Stale Models**: Dynamic discovery prevents "all keys exhausted" errors for experimental models
- **OAuth Fallback**: Cross-source routing ensures OAuth sources are tried when API keys exhausted

### Testing

- Added 14 new unit tests (74 total across 13 test suites)
- `tests/keyService.crossSource.test.js` - 7 tests for cross-source routing
- `tests/keyService.dynamicDiscovery.test.js` - 7 tests for dynamic model discovery
- All tests passing with 100% backward compatibility

### Migration

**Automatic** - No manual action required. On first startup after upgrade:

1. Server detects legacy `models.json` array format
2. Creates timestamped backup (e.g., `models.json.backup.1234567890`)
3. Migrates to new schema: `{ models: [...], aliases: {}, quotaGroups: {...} }`
4. Pre-configures default quota groups for Antigravity and Gemini CLI

### Breaking Changes

**None.** Fully backward compatible with existing configurations.

## [1.5.5] - 2026-02-25

### Changed

- **UI Improvements**: Refined the log expansion toggle to appear as a "tab flap" anchored to the dark logs box for improved aesthetics and logical grouping.

## [1.5.4] - 2026-02-25

### Changed

- **UI Improvements**: Corrected the positioning of the "Expand/Collapse All" toggle in the dashboard logs to sit in the gap above the log box.

## [1.5.3] - 2026-02-25

### Changed

- **UI Improvements**: Repositioned the "Expand/Collapse All" (+) button in the dashboard logs to a floating position on the dark logs box for a cleaner layout.

### Fixed

- **Settings Persistence**: Implemented `.env` persistence for Verbose Logging and refactored settings updates for better reliability.

## [1.5.2] - 2026-02-25

### Fixed

- **Account Persistence**: Fixed issue where account types (Antigravity vs Gemini CLI) were not persisting after restart by adding `source` field to persistence layer.
- **Reliability**: Optimized `saveKeys` to be synchronous to prevent race conditions during state updates.

## [1.5.1] - 2026-02-25

### Fixed

- **Account Selection**: Refactored `getOptimalKey` to strictly honor `supportedModels` and prevent fallback to accounts that explicitly exclude the requested model.

## [1.5.0] - 2026-02-25

### Added

#### OAuth Authentication

- **Antigravity OAuth**: Sign in with Google via OAuth for Antigravity accounts
- **Gemini CLI OAuth**: Use existing Gemini CLI credentials with OAuth flow
- **Manual Token Entry**: Support for manually entering refresh tokens via dashboard and CLI
- **Auto-import**: Detect and import existing Antigravity accounts from OpenCode config
- **Browser-based Setup Wizard**: Interactive first-run flow with OAuth options
- **CLI Commands**: `geminitro key oauth-antigravity`, `geminitro key oauth-gemini-cli`, `geminitro key import-antigravity`

#### Model Discovery

- **Antigravity**: 3-tier discovery strategy (loadCodeAssist API → GitHub spec → hardcoded fallback)
- **Gemini CLI**: Direct retrieveUserQuota API for accurate model lists
- **Separate Logic**: Each account type uses its own appropriate discovery method
- **Dynamic Refresh**: Models are discovered and cached per account on addition

#### Enhanced Coding Agent Support

- **Tool Calls**: Full function calling support with proper argument validation
- **Reasoning Effort**: Maps OpenAI o-series `reasoning_effort` to Gemini `thinkingConfig.budgetTokens`
- **Extended Thinking**: Supports Claude-style `thinking.budget_tokens` passthrough for Antigravity
- **Usage Telemetry**: Accurate token usage tracking per request via `stream_options.include_usage`
- **Schema Validation**: Strict JSON schema sanitization to prevent Gemini API "Unknown name" errors

#### Dashboard Improvements

- **Account Management**: Visual distinction for API Key, Antigravity, and Gemini CLI accounts
- **Logo Assets**: Display account type with appropriate logos (AI Studio, Antigravity, Gemini CLI)
- **OAuth Flow**: In-dashboard OAuth initiation with state persistence and callback handling
- **Live Updates**: Real-time account status updates via Socket.IO
- **Add Key Modal**: Unified modal with OAuth options matching setup wizard design
- **Setup Wizard**: OAuth options alongside traditional API key entry

#### New Services

- `services/antigravityService.js` - Complete Antigravity/Gemini CLI API integration
- `services/oauthService.js` - OAuth flow management, token exchange, refresh token handling

### Changed

- **Key Pool**: Now supports mixed account types (API keys + OAuth accounts)
- **Model Refresh**: Separate discovery logic per account type instead of unified approach
- **Dashboard UI**: "Add Key" button changed to "+ Add" for consistency
- **Setup Flow**: Enhanced first-run experience with OAuth options

### Fixed

- Model discovery for Antigravity accounts now uses original 3-tier strategy (loadCodeAssist → GitHub → hardcoded)
- Gemini CLI accounts no longer receive incorrect Antigravity model lists
- JSON schema validation errors resolved by stripping unsupported keywords (`const`, `default`, `pattern`, `$schema`)
- Tool call IDs now properly preserved and passed through to satisfy Antigravity/Claude backend requirements
- Role-alternation grouping implemented to resolve payload validation issues
- Strict allow-list for tool parameter schema keys to prevent "Unknown name" errors

### Documentation

- Added OAuth setup instructions to README
- Updated `.env.example` with OAuth client credentials
- Implementation plans in `docs/plans/2026-02-23-oauth-authentication.md` and `docs/plans/2026-02-24-oauth-model-discovery.md`

---

## [1.4.4] - 2026-02-24

### Changed

- Minor improvements and bug fixes

## [1.4.3] - 2026-02-23

### Changed

- Dashboard and agent setup enhancements

## [1.4.2] - 2026-02-22

### Added

- Agent registration improvements

## [1.4.1] - 2026-02-21

### Added

- Auto-detect coding agents with multi-select install

## [1.4.0] - 2026-02-20

### Added

- Major feature release with improved agent support

## [1.3.3] - 2026-02-19

### Fixed

- Multimodal content support improvements

## [1.3.2] - 2026-02-18

### Fixed

- Port conflict resolution

## [1.3.1] - 2026-02-17

### Fixed

- Auto-create .env and build dashboard on fresh install

## [1.3.0] - 2026-02-16

### Added

- Initial dashboard release

## [1.2.0] - 2026-02-15

### Added

- CLI improvements and key management

---

[1.5.5]: https://github.com/jmvbambico/geminitro/compare/v1.5.4...v1.5.5
[1.5.4]: https://github.com/jmvbambico/geminitro/compare/v1.5.3...v1.5.4
[1.5.3]: https://github.com/jmvbambico/geminitro/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/jmvbambico/geminitro/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/jmvbambico/geminitro/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/jmvbambico/geminitro/compare/v1.4.4...v1.5.0
[1.4.4]: https://github.com/jmvbambico/geminitro/compare/v1.4.3...v1.4.4
[1.4.3]: https://github.com/jmvbambico/geminitro/compare/v1.4.2...v1.4.3
[1.4.2]: https://github.com/jmvbambico/geminitro/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/jmvbambico/geminitro/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/jmvbambico/geminitro/compare/v1.3.3...v1.4.0
[1.3.3]: https://github.com/jmvbambico/geminitro/compare/v1.3.2...v1.3.3
[1.3.2]: https://github.com/jmvbambico/geminitro/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/jmvbambico/geminitro/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/jmvbambico/geminitro/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/jmvbambico/geminitro/releases/tag/v1.2.0
