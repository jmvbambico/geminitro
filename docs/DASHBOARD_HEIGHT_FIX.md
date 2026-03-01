# Dashboard Model Usage Card Height Fix - Status

## Problem

Model Usage (All Accounts) card shows as 32px height instead of matching Live Traffic's 326px.

## Root Cause

The 220px height is applied to the INNER content wrapper, not the card itself. When unified stats are empty (modelStats = {}), the card shows collapsed view with minimal content, causing it to shrink.

## Live Traffic Structure (CORRECT - 326px total)

```tsx
<div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
  {" "}
  {/* Card wrapper */}
  <div className="flex items-center gap-2 mb-6">
    {" "}
    {/* Header - 24px + 24px margin = 48px */}
    <h2>Live Traffic</h2>
  </div>
  <div style={{ height: 220 }}>
    {" "}
    {/* Content - 220px */}
    <ResponsiveContainer>...</ResponsiveContainer>
  </div>
</div>
```

**Total**: 24px (padding-top) + 48px (header) + 220px (content) + 24px (padding-bottom) = **316px**
(Actual measured: 326px - includes border/margins)

## Model Usage Current Structure (BROKEN - 32px)

```tsx
<div>  {/* Outer wrapper - NO height */}
  <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">  {/* Card - NO height */}
    <div className="flex items-center justify-between mb-6">  {/* Header */}
      ...
    </div>
    {!expanded && (
      <div style={{ height: 220 }}>  {/* Content wrapper - HAS height */}
        <div className="space-y-3">
          {topModels.map(...)}  {/* EMPTY when no stats */}
          <div>Total: 0 requests...</div>
        </div>
      </div>
    )}
  </div>
</div>
```

When `topModels` is empty, the height: 220 div exists but collapses because the content is minimal.

## Solution Required

Remove the outer wrapper div and ensure the height: 220 content div actually enforces its height even when content is minimal. The issue is likely that the div with `height: 220` needs `min-height: 220px` or the content needs to fill the height properly.

## Files to Fix

- `/Users/cryogenix/projects/geminitro/dashboard/src/components/stats/UnifiedStatsCard.tsx`
  - Lines 67-71: Outer wrapper and card structure
  - Lines 98-137: Collapsed view height wrapper
  - Lines 140-240: Expanded view height wrapper

## Next Steps

1. Change `style={{ height: 220 }}` to `style={{ minHeight: 220 }}` OR add `className="flex items-center"` to ensure content fills height
2. Verify in browser that card now matches Live Traffic height
3. Test with both empty stats and populated stats
