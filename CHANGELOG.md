# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
