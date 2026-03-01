# Unified Usage Statistics Dashboard Design (REVISED)

**Date:** 2026-03-01  
**Status:** Design Proposal (REVISED with user clarifications)  
**Context:** Add visual quota/usage tracking to the web dashboard following TUI implementation

## User Clarifications

1. **Cap reset timing:** Local time (not UTC)
2. **Cap actions:** Try next key (don't return 429 to client)
3. **Multi-account caps:** Global per model (not per-account)
4. **Chart library:** Keep Recharts
5. **Real-time updates:** Yes, implement Socket.IO live updates
6. **⚠️ CRITICAL:** No separate stats page - everything in main dashboard (or modal)
7. **Settings storage:** Determine `.env` vs `.geminitro/*.json` - add dashboard controls

---

## Settings Storage Strategy

### Current State Analysis

**Existing `.geminitro/` files:**

- `keys.json` - API keys and OAuth credentials
- `history.json` - Usage statistics (totalRequests, daily, models, keyUsage)
- `models.json` - Cached model list from Gemini API

**Existing `.env` settings:**

- Infrastructure: `PORT`, `PROXY_API_KEY`, `NODE_ENV`
- Timeouts: `TIMEOUT_CONNECT`, `TIMEOUT_WRITE`, `TIMEOUT_READ_STREAMING`, `TIMEOUT_READ_NON_STREAMING`
- Rotation: `ROTATION_MODE`, `ROTATION_TOLERANCE`
- Concurrency: `MAX_CONCURRENT_REQUESTS_PER_KEY`
- Quota groups: `QUOTA_GROUPS_ANTIGRAVITY_CLAUDE`, `QUOTA_GROUPS_GEMINI_PRO`
- OAuth: `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`

### Storage Decision Matrix

| Setting Type           | Storage Location                | Reason                                          | Dashboard Control                        |
| ---------------------- | ------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| **Usage Caps**         | `.geminitro/usage_caps.json`    | User-configurable per model, changes frequently | ✅ Modal UI                              |
| **Model Filters**      | `.geminitro/model_filters.json` | User preference, not infrastructure             | ✅ Modal UI                              |
| **Rotation Settings**  | Keep in `.env`                  | Infrastructure-level, rarely changes            | ✅ Settings modal                        |
| **Timeout Settings**   | Keep in `.env`                  | Infrastructure-level, advanced users only       | ✅ Settings modal (collapsible advanced) |
| **Concurrency Limits** | Keep in `.env`                  | Infrastructure-level, performance tuning        | ✅ Settings modal (collapsible advanced) |
| **Quota Groups**       | Keep in `.env`                  | Provider-specific, rarely changes               | ❌ No UI (documented in README)          |

**Rationale:**

- **`.env`** = Infrastructure, server restart required, environment-specific (dev/prod)
- **`.geminitro/*.json`** = User preferences, hot-reloadable, per-installation settings

### New Configuration Files

**1. `.geminitro/usage_caps.json`**

```json
{
  "caps": [
    {
      "model": "gemini-2.0-flash",
      "limit": 1500,
      "period": "daily",
      "alertThreshold": 80,
      "action": "try_next",
      "enabled": true,
      "lastReset": "2026-03-01T00:00:00.000Z"
    }
  ],
  "resetTime": "00:00",
  "timezone": "local"
}
```

**2. `.geminitro/model_filters.json`**

```json
{
  "whitelist": [],
  "blacklist": ["*-preview", "gemini-1.0*"],
  "mode": "blacklist"
}
```

**3. Extend `.geminitro/history.json`** (add per-account tracking)

```json
{
  "totalRequests": 2500,
  "totalSuccess": 2450,
  "totalErrors": 50,
  "daily": { "2026-03-01": { "requests": 1234, "errors": 26 } },
  "models": { "gemini-2.0-flash": 1234 },
  "keyUsage": { "...abc123": { "requests": 450, "errors": 5 } },
  "modelStats": {
    "gemini-2.0-flash": {
      "totalRequests": 1234,
      "errors": 26,
      "accountTypes": { "api_key": 800, "oauth": 434 },
      "timestamps": [1709251200000, 1709251260000],
      "accounts": {
        "...abc123": { "type": "api_key", "requests": 450, "errors": 5 },
        "alice@gmail.com": { "type": "oauth", "requests": 234, "errors": 11 }
      }
    }
  }
}
```

---

## Revised UI Design (Single-Page Dashboard)

### 1. Unified Stats Card (Expandable)

**Location:** Main Overview page, below traffic stat cards, above "Live Traffic" chart

**Collapsed State (Default):**

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Model Usage                              [Expand ▼] │
├─────────────────────────────────────────────────────────┤
│ gemini-2.0-flash              ████████░░  1,234 req    │
│ gemini-exp-1206               ███████░░░  890 req      │
│ gemini-2.0-flash-thinking     ████░░░░░░  456 req      │
│                                                         │
│ Total: 2,580 requests • 3 models • 2.1% avg errors     │
└─────────────────────────────────────────────────────────┘
```

**Expanded State:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📊 Model Usage              [Collapse ▲] [⚙️ Manage Caps]          │
├─────────────────────────────────────────────────────────────────────┤
│ [Last 24h ▼] [Search models...]                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ gemini-2.0-flash                                      [▼ Timeline]  │
│ ████████████████░░░░ 1,234 / 1,500 (82%)  ⚠️ 80% cap               │
│ API: 800 • OAuth: 434 • Errors: 2.1% (26)                          │
│ Top accounts: ...abc123 (450), ...xyz789 (350), alice@ (234)       │
│                                                                     │
│ gemini-exp-1206                                       [▼ Timeline]  │
│ ██████████████░░░░░░ 890 req                                       │
│ API: 890 • OAuth: 0 • Errors: 0.5% (4)                             │
│                                                                     │
│ gemini-2.0-flash-thinking                             [▼ Timeline]  │
│ █████████░░░░░░░░░░░ 456 / 500 (91%)  🔴 NEAR CAP                  │
│ API: 200 • OAuth: 256 • Errors: 5.4% (25)                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Inline Timeline (when [▼ Timeline] clicked):**

```
│ gemini-2.0-flash                                      [▲ Timeline]  │
│ ████████████████░░░░ 1,234 / 1,500 (82%)  ⚠️ 80% cap               │
│ API: 800 • OAuth: 434 • Errors: 2.1% (26)                          │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ Last 24 hours                                               │   │
│ │ ▁▂▃▅▇█▇▅▃▂▁▂▃▅▇█ [Mini area chart - requests over time]   │   │
│ │                                                             │   │
│ │ Per-account breakdown:                                      │   │
│ │ • ...abc123 (API Key):  450 req │ 1.1% err │ ████████░░   │   │
│ │ • ...xyz789 (API Key):  350 req │ 0.9% err │ ███████░░░   │   │
│ │ • alice@gmail (OAuth):  234 req │ 4.7% err │ █████░░░░░   │   │
│ │ • bob@gmail (OAuth):    200 req │ 2.0% err │ ████░░░░░░   │   │
│ └─────────────────────────────────────────────────────────────┘   │
```

---

### 2. Usage Caps Modal (Accessed via "⚙️ Manage Caps" button)

**Modal Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⚙️  Usage Caps Configuration                        [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Set custom request limits to prevent quota exhaustion.     │
│ When a model hits its cap, the next available key is used. │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Active Caps                              [+ Add Cap]    │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │                                                         │ │
│ │ gemini-2.0-flash                         [Edit] [❌]    │ │
│ │ Limit: 1,500 requests/day • Alert at 80%               │ │
│ │ Current: 1,234 / 1,500 (82%)  ████████░░               │ │
│ │ Next reset: Today at 12:00 AM (in 8h 23m)              │ │
│ │                                                         │ │
│ │ gemini-2.0-flash-thinking                [Edit] [❌]    │ │
│ │ Limit: 500 requests/day • Alert at 80%                 │ │
│ │ Current: 456 / 500 (91%)  █████████░  🔴 NEAR LIMIT    │ │
│ │ Next reset: Today at 12:00 AM (in 8h 23m)              │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Save Changes] [Cancel]                                    │
└─────────────────────────────────────────────────────────────┘
```

**Add/Edit Cap Form:**

```
┌─────────────────────────────────────────────────────────────┐
│ Model:     [gemini-2.0-flash ▼]                            │
│ Limit:     [1500] requests per [Day ▼]                     │
│ Alert at:  [80]%                                            │
│ Action:    ⦿ Try next key    ○ Warn only                   │
│ Reset at:  [00:00] (local time)                            │
│                                                             │
│ [Save] [Cancel]                                            │
└─────────────────────────────────────────────────────────────┘
```

---

### 3. Model Filters Modal (NEW - separate from caps)

**Access:** Settings page → "Advanced" section → "Model Filters" button

**Modal Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Model Filters                                    [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Control which models are visible in the dashboard.         │
│ Uses wildcards: * (any), ? (single char)                   │
│                                                             │
│ Mode:  ⦿ Blacklist (hide matching)  ○ Whitelist (show only)│
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Blacklist Patterns                      [+ Add]         │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ *-preview                                      [❌]      │ │
│ │ gemini-1.0*                                    [❌]      │ │
│ │ gemini-*-vision                                [❌]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Preview (3 models hidden):                                 │
│ • gemini-1.0-pro-vision-latest                             │
│ • gemini-2.0-flash-exp-preview                             │
│ • gemini-2.5-pro-preview                                   │
│                                                             │
│ [Apply Filters] [Reset] [Cancel]                           │
└─────────────────────────────────────────────────────────────┘
```

---

### 4. Enhanced Settings Modal

**New "Advanced Configuration" section:**

```
┌─────────────────────────────────────────────────────────────┐
│ Settings                                            [✕]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ [Existing sections: API Key, Interface Preference...]      │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ⚙️  Advanced Configuration                  [Expand ▼]  │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │                                                         │ │
│ │ Rotation Mode:  ⦿ Balanced  ○ Sequential                │ │
│ │ Rotation Tolerance: [0.0] (0=deterministic, 3=random)   │ │
│ │ Max Concurrent Requests: [3] per key                    │ │
│ │                                                         │ │
│ │ [Model Filters]  [Timeout Settings]                    │ │
│ │                                                         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [Save All Changes]                                         │
└─────────────────────────────────────────────────────────────┘
```

**Timeout Settings Sub-Modal:**

```
┌─────────────────────────────────────────────────────────────┐
│ ⏱️  Timeout Configuration                           [✕]     │
├─────────────────────────────────────────────────────────────┤
│ All values in seconds. Changes require server restart.     │
│                                                             │
│ Connection:         [30] seconds                            │
│ Write:              [30] seconds                            │
│ Read (Streaming):   [180] seconds                           │
│ Read (Non-Stream):  [600] seconds                           │
│                                                             │
│ ⚠️  Restart required for changes to take effect.            │
│                                                             │
│ [Save to .env] [Reset to Defaults] [Cancel]                │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow & Implementation

### Backend Changes

**1. New Service: `usageCapService.js`**

```javascript
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

const CAPS_FILE = path.join(config.DATA_DIR, 'usage_caps.json');

let caps = { caps: [], resetTime: '00:00', timezone: 'local' };
let currentUsage = {}; // { modelName: requestCount }

// Load caps from file
async function loadCaps() { /* ... */ }

// Check if model is at/over cap
function isAtCap(model) {
  const cap = caps.caps.find(c => c.model === model && c.enabled);
  if (!cap) return false;

  const current = currentUsage[model] || 0;
  return current >= cap.limit;
}

// Get cap progress
function getCapProgress(model) {
  const cap = caps.caps.find(c => c.model === model && c.enabled);
  if (!cap) return null;

  const current = currentUsage[model] || 0;
  return {
    current,
    limit: cap.limit,
    percentage: (current / cap.limit) * 100,
    alertThreshold: cap.alertThreshold,
    atWarning: (current / cap.limit) * 100 >= cap.alertThreshold,
    atCap: current >= cap.limit
  };
}

// Reset caps (runs daily at configured time)
function resetCaps() {
  currentUsage = {};
  // Save reset timestamp
}

module.exports = { loadCaps, isAtCap, getCapProgress, resetCaps, ... };
```

**2. Extend `statsService.js`**

```javascript
// Add per-account tracking to modelStats
const recordRequest = (model, accountType, accountId, timestamp = Date.now()) => {
  const cleanModel = model.replace("models/", "");

  if (!stats.modelStats[cleanModel]) {
    stats.modelStats[cleanModel] = {
      totalRequests: 0,
      errors: 0,
      accountTypes: {},
      timestamps: [],
      accounts: {}, // NEW: per-account stats
    };
  }

  const modelStat = stats.modelStats[cleanModel];
  modelStat.totalRequests++;
  modelStat.timestamps.push(timestamp);

  // Track by account type
  if (!modelStat.accountTypes[accountType]) {
    modelStat.accountTypes[accountType] = 0;
  }
  modelStat.accountTypes[accountType]++;

  // NEW: Track by individual account
  if (!modelStat.accounts[accountId]) {
    modelStat.accounts[accountId] = {
      type: accountType,
      requests: 0,
      errors: 0,
    };
  }
  modelStat.accounts[accountId].requests++;

  scheduleSave();
};
```

**3. Integrate into `keyService.js`**

```javascript
const usageCapService = require('./usageCapService');

async function selectKey(model) {
  // Existing rotation logic...

  const selectedKey = /* ... */;

  // NEW: Check if model is at cap
  if (usageCapService.isAtCap(model)) {
    // Mark key as "soft cooldown" and try next
    logger.warn(`Model ${model} at usage cap, trying next key`);
    return selectKey(model); // Recurse to try next key
  }

  return selectedKey;
}
```

**4. New API Routes**

```javascript
// GET /api/stats/unified?since=<timestamp>&model=<model>
router.get("/stats/unified", auth, async (req, res) => {
  const { since, model } = req.query;
  const stats = statsService.getModelStats({ since });

  if (model) {
    return res.json({ [model]: stats[model] });
  }

  res.json(stats);
});

// GET /api/stats/caps
router.get("/stats/caps", auth, (req, res) => {
  res.json(usageCapService.getAllCaps());
});

// POST /api/stats/caps
router.post("/stats/caps", auth, async (req, res) => {
  const cap = req.body;
  await usageCapService.addOrUpdateCap(cap);
  res.json({ success: true });
});

// DELETE /api/stats/caps/:model
router.delete("/stats/caps/:model", auth, async (req, res) => {
  await usageCapService.removeCap(req.params.model);
  res.json({ success: true });
});

// GET /api/stats/caps/check/:model
router.get("/stats/caps/check/:model", auth, (req, res) => {
  const progress = usageCapService.getCapProgress(req.params.model);
  res.json(progress);
});

// GET /api/settings/model-filters
router.get("/settings/model-filters", auth, (req, res) => {
  // Load from .geminitro/model_filters.json
});

// POST /api/settings/model-filters
router.post("/settings/model-filters", auth, async (req, res) => {
  // Save to .geminitro/model_filters.json
});

// POST /api/settings/advanced (rotation mode, tolerance, concurrency)
router.post("/settings/advanced", auth, async (req, res) => {
  // Update .env file dynamically
  // NOTE: Server restart required for these to take effect
});
```

**5. Socket.IO Events**

```javascript
// Emit when cap warning crossed
io.emit("usage:cap-warning", {
  model: "gemini-2.0-flash",
  current: 1200,
  limit: 1500,
  percentage: 80,
});

// Emit when cap exceeded
io.emit("usage:cap-exceeded", {
  model: "gemini-2.0-flash",
  current: 1500,
  limit: 1500,
});

// Real-time model usage (piggyback on existing trafficTick)
io.emit("usage:model-update", {
  model: "gemini-2.0-flash",
  requests: 1235,
  errors: 26,
});
```

---

### Frontend Changes

**1. New Components**

```
dashboard/src/components/
├── stats/
│   ├── UnifiedStatsCard.tsx         // Main expandable card
│   ├── ModelStatsRow.tsx            // Individual model row with expand
│   ├── ModelTimeline.tsx            // Inline sparkline chart
│   ├── UsageProgressBar.tsx         // Progress bar with warnings
│   ├── UsageCapsModal.tsx           // Caps management modal
│   ├── ModelFiltersModal.tsx        // Filter configuration modal
│   └── AdvancedSettingsSection.tsx  // Settings modal addition
```

**2. New Hooks**

```typescript
// dashboard/src/hooks/useUnifiedStats.ts
export function useUnifiedStats(options?: { since?: number, model?: string }) {
  const [stats, setStats] = useState<UnifiedStats | null>(null);
  const { socket } = useSocket();

  useEffect(() => {
    // Initial fetch
    api.get(`/api/stats/unified`, { params: options }).then(setStats);

    // Real-time updates
    socket?.on('usage:model-update', (data) => {
      setStats(prev => /* update model stats */);
    });

    return () => socket?.off('usage:model-update');
  }, [options, socket]);

  return { stats, loading, refresh };
}

// dashboard/src/hooks/useUsageCaps.ts
export function useUsageCaps() {
  const [caps, setCaps] = useState<UsageCap[]>([]);
  const { socket } = useSocket();

  useEffect(() => {
    api.get('/api/stats/caps').then(data => setCaps(data.caps));

    socket?.on('usage:cap-warning', (data) => {
      // Show toast notification
    });

    socket?.on('usage:cap-exceeded', (data) => {
      // Show alert notification
    });

    return () => {
      socket?.off('usage:cap-warning');
      socket?.off('usage:cap-exceeded');
    };
  }, [socket]);

  const addCap = async (cap) => {
    await api.post('/api/stats/caps', cap);
    setCaps(prev => [...prev, cap]);
  };

  const removeCap = async (model) => {
    await api.delete(`/api/stats/caps/${model}`);
    setCaps(prev => prev.filter(c => c.model !== model));
  };

  return { caps, addCap, removeCap };
}
```

**3. Modified Files**

```
dashboard/src/pages/Overview.tsx        // Add UnifiedStatsCard component
dashboard/src/pages/SettingsPage.tsx    // Add AdvancedSettingsSection
dashboard/src/components/Layout.tsx     // No changes (no new tab)
```

---

## Implementation Plan (REVISED)

### Phase 1: Backend Foundation (Essential)

1. ✅ Create `usageCapService.js`
2. ✅ Extend `statsService.js` with per-account tracking
3. ✅ Add `/api/stats/unified` endpoint
4. ✅ Add usage cap API endpoints
5. ✅ Create `.geminitro/usage_caps.json` schema
6. ✅ Integrate cap checking into `keyService.js`

### Phase 2: Dashboard UI (Core Features)

7. ✅ Create `UnifiedStatsCard` component (collapsed + expanded states)
8. ✅ Create `UsageProgressBar` component
9. ✅ Create `UsageCapsModal` component
10. ✅ Add to Overview page below traffic cards
11. ✅ Implement expand/collapse persistence (localStorage)

### Phase 3: Real-Time Updates

12. ✅ Add Socket.IO events for model usage
13. ✅ Add Socket.IO events for cap warnings
14. ✅ Implement live progress bar updates
15. ✅ Implement toast notifications for caps

### Phase 4: Advanced Features

16. ✅ Create `ModelFiltersModal` component
17. ✅ Create `.geminitro/model_filters.json` schema
18. ✅ Add filter API endpoints
19. ✅ Create `AdvancedSettingsSection` for Settings modal
20. ✅ Implement .env hot-reload for rotation/concurrency settings

### Phase 5: Polish

21. ✅ Add inline model timelines (sparkline charts)
22. ✅ Add per-account breakdown in expanded view
23. ✅ Add time range filtering
24. ✅ Add search/filter for models
25. ✅ Write tests for new services

---

## Success Metrics

**User can:**

- ✅ See all model usage stats on main dashboard (no page navigation)
- ✅ Expand/collapse detailed stats inline
- ✅ Set custom caps per model via modal
- ✅ Get real-time warnings when approaching caps
- ✅ See which accounts (API keys/OAuth) are consuming quota
- ✅ Filter/hide unwanted models
- ✅ Configure rotation/concurrency settings without editing .env manually

**Technical:**

- ✅ No performance degradation with stats tracking
- ✅ Settings changes persist without server restart (where possible)
- ✅ Real-time updates don't exceed 10 events/sec
- ✅ All data stored in `.geminitro/` (except infrastructure in `.env`)
- ✅ Dashboard remains single-page (modals only)

---

## File Changes Summary

### New Files

```
services/usageCapService.js
.geminitro/usage_caps.json
.geminitro/model_filters.json
dashboard/src/components/stats/UnifiedStatsCard.tsx
dashboard/src/components/stats/ModelStatsRow.tsx
dashboard/src/components/stats/ModelTimeline.tsx
dashboard/src/components/stats/UsageProgressBar.tsx
dashboard/src/components/stats/UsageCapsModal.tsx
dashboard/src/components/stats/ModelFiltersModal.tsx
dashboard/src/components/stats/AdvancedSettingsSection.tsx
dashboard/src/hooks/useUnifiedStats.ts
dashboard/src/hooks/useUsageCaps.ts
```

### Modified Files

```
services/statsService.js           // Add per-account tracking
services/keyService.js             // Integrate cap checking
routes/apiRoutes.js                // Add new endpoints
server.js                          // Socket.IO events
dashboard/src/pages/Overview.tsx   // Add UnifiedStatsCard
dashboard/src/pages/SettingsPage.tsx // Add AdvancedSettingsSection
.geminitro/history.json            // Extended schema with accounts
```

### No Changes

```
dashboard/src/App.tsx              // No new routes
dashboard/src/components/Layout.tsx // No new nav items
```
