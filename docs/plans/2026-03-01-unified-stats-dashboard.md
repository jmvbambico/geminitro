# Unified Usage Statistics Dashboard Design

**Date:** 2026-03-01  
**Status:** Design Proposal  
**Context:** Add visual quota/usage tracking to the web dashboard following TUI implementation

## Background

We implemented unified model statistics tracking across all account types (API keys, Antigravity OAuth, Gemini CLI OAuth) in the backend (`statsService.js`) and added CLI display via `geminitro stats`. Now we need a dashboard counterpart.

**Reference:** LLM-API-Key-Proxy uses custom usage caps set via environment variables (e.g., `CUSTOM_CAP_ANTIGRAVITY_T2_CLAUDE=80%`) with cooldown strategies. They don't have a visual dashboard.

**Constraint:** Gemini doesn't expose quota limits via API, so we can't show "X of Y requests remaining" without user input.

---

## Design Overview

### Primary Goal

**Monitor quota consumption** — Track how much of each model's quota is being used to avoid hitting limits.

### Approach

**Hybrid model** combining actual usage tracking with optional user-defined limits:

- Show real usage data (requests/time) for all models
- Let users optionally set custom caps per model for visual warnings
- Display account type breakdown to identify bottlenecks
- Surface error rates to catch problematic keys

---

## UI Components

### 1. Unified Stats Overview Card (Top of Dashboard)

**Location:** New card row below existing "Traffic / Success Rate / Errors / Avg Daily" cards

**Content:**

```
┌─────────────────────────────────────────────────────────┐
│ 📊 Model Usage (All Accounts)                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ gemini-2.0-flash              ████████░░  1,234 req    │
│ API Keys: 800 • OAuth: 434 • 2.1% errors               │
│                                                         │
│ gemini-exp-1206               ███████░░░  890 req      │
│ API Keys: 890 • OAuth: 0 • 0.5% errors                 │
│                                                         │
│ [View Detailed Stats →]                                │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- Horizontal bar showing request volume (relative to highest-usage model)
- Account type breakdown inline
- Error rate highlighted (red if >10%, yellow if >5%)
- Top 3-4 models shown, link to full page

**Visual Design:**

- Uses existing `StatCard` component style (rounded-2xl border)
- Bar colors from existing chart palette (`--chart-1`, `--chart-2`)
- Error rates use semantic colors (`--destructive` for high errors)

---

### 2. Detailed Stats Page (New Tab)

**Navigation:** Add "Stats" tab to existing navbar (between "Keys" and "Logs")

**Layout:** Full-width page with multiple sections

#### Section A: Model Usage Table

```
┌──────────────────────────────────────────────────────────────────────┐
│ Model Usage Breakdown                                 [Last 24h ▼]  │
├──────────────────────────────────────────────────────────────────────┤
│ Model              │ Total Req │ API Keys │ OAuth │ Errors │ Avg Latency │
├────────────────────┼───────────┼──────────┼───────┼────────┼─────────────┤
│ gemini-2.0-flash   │ 1,234     │ 800      │ 434   │ 2.1%   │ 1.2s        │
│ gemini-exp-1206    │ 890       │ 890      │ 0     │ 0.5%   │ 2.8s        │
│ gemini-2.0-flash-thinking-exp-01-21 │ 456 │ 200 │ 256 │ 5.4% │ 4.1s │
└──────────────────────────────────────────────────────────────────────┘
```

**Features:**

- Sortable columns
- Time range filter (Last hour / 24h / 7 days / 30 days / All time)
- Search/filter by model name
- Color-coded error rates
- Click row to expand detailed breakdown

**Expanded Row View:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▼ gemini-2.0-flash                                                   │
│                                                                      │
│   Request Timeline (Last 24h)                                       │
│   ▁▂▃▅▇█▇▅▃▂▁ [sparkline chart]                                    │
│                                                                      │
│   Account Breakdown:                                                │
│   • API Key (...abc123): 450 req (1.2% errors)                     │
│   • API Key (...xyz789): 350 req (0.8% errors)                     │
│   • OAuth (alice@gmail.com): 234 req (4.5% errors)                 │
│   • OAuth (bob@gmail.com): 200 req (2.1% errors)                   │
│                                                                      │
│   [Set Usage Cap for this model]                                   │
└──────────────────────────────────────────────────────────────────────┘
```

#### Section B: Usage Caps Configuration (Optional)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Usage Caps & Alerts                              [+ Add Cap]         │
├──────────────────────────────────────────────────────────────────────┤
│ Model: gemini-2.0-flash                                              │
│ Daily Limit: [1500] requests    Period: [Daily ▼]                   │
│ Current: 1,234 / 1,500 (82%)    ████████░░                          │
│ Alert at: [80]%   Action: [Warn ▼]                                  │
│ Reset: Daily at midnight                                             │
│                                                 [Save] [Remove]      │
├──────────────────────────────────────────────────────────────────────┤
│ Model: gemini-exp-1206                                               │
│ Daily Limit: 500 requests                                            │
│ Current: 890 / 500 (178%) ⚠️ OVER LIMIT                            │
│ Alert at: 80%   Action: Block new requests                          │
│                                                 [Edit] [Remove]      │
└──────────────────────────────────────────────────────────────────────┘
```

**Features:**

- Set custom caps per model (absolute number or percentage)
- Choose alert threshold (e.g., warn at 80%)
- Choose action: Warn only / Block new requests / Cool down key
- Visual progress bar with warning colors
- Persist caps in `.geminitro/usage_caps.json`

**Alert Actions:**

- **Warn only:** Show warning banner in dashboard
- **Block new requests:** Return 429 to client when cap hit
- **Cool down key:** Mark key as on cooldown until reset period

---

### 3. Real-Time Usage Widget (Optional - Live Dashboard Enhancement)

**Location:** Replace or augment existing "Live Traffic" area chart

**Content:**

```
┌─────────────────────────────────────────────────────────┐
│ Live Model Usage                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [Stacked area chart showing requests per model over time]
│                                                         │
│ Legend:                                                 │
│ ■ gemini-2.0-flash  ■ gemini-exp-1206  ■ Others       │
└─────────────────────────────────────────────────────────┘
```

**Features:**

- Stacked area chart (like existing Live Traffic)
- Real-time updates via Socket.IO
- Color-coded by model
- Tooltip shows breakdown per model

---

## Data Flow

### Backend Changes Needed

**1. New API Endpoints**

```javascript
// Get unified stats with filters
GET /api/stats/unified?since=<timestamp>&model=<model>
Response: {
  byModel: {
    "gemini-2.0-flash": {
      totalRequests: 1234,
      errors: 26,
      accountTypes: { api_key: 800, oauth: 434 },
      errorRate: 0.021,
      avgLatency: 1200,
      timeline: [{ timestamp, count }, ...],
      accounts: [
        { id: "...abc123", type: "api_key", requests: 450, errors: 5 },
        { id: "alice@gmail.com", type: "oauth", requests: 234, errors: 11 }
      ]
    }
  },
  totalRequests: 2500,
  byAccountType: { api_key: 1690, oauth: 810 }
}

// Get/set usage caps
GET /api/stats/caps
POST /api/stats/caps
  { model: "gemini-2.0-flash", limit: 1500, period: "daily", alertAt: 80, action: "warn" }
DELETE /api/stats/caps/:model

// Check if model at/over cap
GET /api/stats/caps/check/:model
Response: { atCap: false, current: 1234, limit: 1500, percentage: 82 }
```

**2. Enhanced Stats Tracking**

Extend `statsService.js`:

- Track per-account stats (currently only tracks per-model)
- Add latency tracking (record duration per request)
- Add timeline data (aggregate requests by time bucket)

**3. Usage Cap Enforcement**

New file: `services/usageCapService.js`:

- Load caps from `.geminitro/usage_caps.json`
- Check caps before selecting key in `keyService.js`
- Reset counters based on period (daily/hourly/weekly)
- Emit Socket.IO events when caps hit

**4. Socket.IO Events**

```javascript
// Emit when cap threshold crossed
socket.emit("usage:cap-warning", {
  model: "gemini-2.0-flash",
  current: 1200,
  limit: 1500,
  percentage: 80,
});

// Emit when cap exceeded
socket.emit("usage:cap-exceeded", {
  model: "gemini-2.0-flash",
  current: 1500,
  limit: 1500,
});

// Real-time model usage update (existing trafficTick can be extended)
socket.emit("usage:model-tick", {
  model: "gemini-2.0-flash",
  requests: 1235,
});
```

### Frontend Changes Needed

**1. New React Components**

```
dashboard/src/components/
├── stats/
│   ├── UnifiedStatsCard.tsx       // Overview card for main dashboard
│   ├── ModelUsageTable.tsx        // Sortable table with expand/collapse
│   ├── UsageCapManager.tsx        // Cap configuration UI
│   ├── UsageProgressBar.tsx       // Visual progress bar with warnings
│   └── ModelTimelineChart.tsx     // Sparkline for expanded row
```

**2. New Page**

```
dashboard/src/pages/Stats.tsx      // Full stats page
```

**3. Hook for Stats Data**

```typescript
// dashboard/src/hooks/useUnifiedStats.ts
export function useUnifiedStats(options?: { since?: number; model?: string }) {
  const [stats, setStats] = useState<UnifiedStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch from /api/stats/unified
    // Subscribe to Socket.IO events
  }, [options]);

  return { stats, loading, refresh };
}
```

**4. Hook for Usage Caps**

```typescript
// dashboard/src/hooks/useUsageCaps.ts
export function useUsageCaps() {
  const [caps, setCaps] = useState<UsageCap[]>([]);

  const addCap = async (cap: UsageCap) => {
    /* POST /api/stats/caps */
  };
  const removeCap = async (model: string) => {
    /* DELETE */
  };
  const checkCap = async (model: string) => {
    /* GET /api/stats/caps/check */
  };

  return { caps, addCap, removeCap, checkCap };
}
```

---

## Implementation Priority

### Phase 1: Essential (Implement First)

1. ✅ Backend unified stats endpoint (`GET /api/stats/unified`)
2. ✅ Enhanced stats tracking (per-account, latency, timeline)
3. ✅ `UnifiedStatsCard` component for main dashboard
4. ✅ New "Stats" page with `ModelUsageTable`

### Phase 2: Usage Caps (Next Priority)

5. Usage cap configuration backend (`usageCapService.js`)
6. Usage cap API endpoints
7. `UsageCapManager` component
8. Cap enforcement in `keyService.js`

### Phase 3: Real-Time Enhancements (Optional)

9. Socket.IO events for live model usage
10. Real-time usage widget
11. Cap warning notifications

---

## Visual Design Specs

### Colors

**Progress Bars:**

- 0-70%: `--chart-1` (primary blue/teal)
- 71-85%: `--chart-3` (warning yellow)
- 86-100%: `--destructive` (danger red)
- Over 100%: Pulsing red animation

**Error Rates:**

- <5%: `--muted-foreground` (gray)
- 5-10%: `--chart-3` (yellow)
- > 10%: `--destructive` (red)

### Typography

- Card titles: `text-base font-semibold`
- Stats labels: `text-sm text-muted-foreground font-medium`
- Big numbers: `text-3xl font-bold tracking-tight`
- Table headers: `text-xs font-semibold uppercase tracking-wide`

### Spacing

- Card padding: `p-6`
- Card borders: `rounded-2xl border border-border/50`
- Grid gaps: `gap-6` (24px)
- Section spacing: `space-y-8` (32px)

---

## File Changes Summary

### New Files

```
services/usageCapService.js        // Usage cap logic
routes/statsRoutes.js              // New stats endpoints (or extend apiRoutes.js)
dashboard/src/pages/Stats.tsx      // Stats page
dashboard/src/components/stats/UnifiedStatsCard.tsx
dashboard/src/components/stats/ModelUsageTable.tsx
dashboard/src/components/stats/UsageCapManager.tsx
dashboard/src/components/stats/UsageProgressBar.tsx
dashboard/src/hooks/useUnifiedStats.ts
dashboard/src/hooks/useUsageCaps.ts
.geminitro/usage_caps.json         // Persisted caps configuration
```

### Modified Files

```
services/statsService.js           // Add per-account tracking, latency, timeline
services/keyService.js             // Integrate cap checking
routes/apiRoutes.js                // Add stats endpoints (or new statsRoutes.js)
server.js                          // Socket.IO events for caps
dashboard/src/App.tsx              // Add Stats route
dashboard/src/components/Layout.tsx // Add Stats nav item
dashboard/src/pages/Overview.tsx   // Add UnifiedStatsCard
```

---

## Open Questions for User

1. **Cap reset timing:** Daily at midnight (local time or UTC)?
2. **Cap actions:** Should "Block new requests" return 429 to client, or fail silently and try next key?
3. **Multi-account caps:** Should caps apply per-account or globally per model?
4. **Chart library:** Keep Recharts for new visualizations or switch to something lighter?
5. **Real-time priority:** Is live model usage widget worth the Socket.IO complexity?

---

## Success Metrics

**User can:**

- See which models consume the most quota at a glance
- Identify which account types (API keys vs OAuth) are being used
- Spot problematic keys with high error rates
- Set custom caps to prevent quota exhaustion
- Get visual warnings before hitting limits
- Track usage trends over time (hourly/daily/weekly)

**Technical:**

- No performance degradation with stats tracking enabled
- Stats queries complete in <200ms
- Socket.IO events don't exceed 10/sec under normal load
- Usage caps enforce within 100ms of request
