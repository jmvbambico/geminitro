import { useState, useEffect } from "react";
import { useUnifiedStats } from "@/hooks/useUnifiedStats";
import { useUsageCaps } from "@/hooks/useUsageCaps";
import { UsageProgressBar } from "./UsageProgressBar";
import { UsageCapsModal } from "./UsageCapsModal";
import { BarChart3 } from "lucide-react";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";

interface TimeRange {
  label: string;
  value: number | undefined;
}

const TIME_RANGES: TimeRange[] = [
  { label: "Last hour", value: Date.now() - 3600000 },
  { label: "Last 24h", value: Date.now() - 86400000 },
  { label: "Last 7 days", value: Date.now() - 604800000 },
  { label: "Last 30 days", value: Date.now() - 2592000000 },
  { label: "All time", value: undefined },
];

export function UnifiedStatsCard() {
  const [expanded, setExpanded] = useState(() => {
    const saved = localStorage.getItem("geminitro_stats_expanded");
    return saved === "true";
  });

  const [timeRange, setTimeRange] = useState<number | undefined>(TIME_RANGES[1].value);
  const [searchQuery, setSearchQuery] = useState("");
  const [capsModalOpen, setCapsModalOpen] = useState(false);

  const { stats, loading } = useUnifiedStats({ since: timeRange });
  const { getProgress } = useUsageCaps();

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem("geminitro_stats_expanded", String(expanded));
  }, [expanded]);

  if (loading || !stats) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">📊 Model Usage</h2>
        </div>
        <p className="text-sm text-muted-foreground">Loading stats...</p>
      </div>
    );
  }

  const modelEntries = Object.entries(stats)
    .sort(([, a], [, b]) => b.totalRequests - a.totalRequests)
    .filter(([modelName]) =>
      searchQuery ? modelName.toLowerCase().includes(searchQuery.toLowerCase()) : true,
    );

  const totalRequests = modelEntries.reduce((sum, [, stat]) => sum + stat.totalRequests, 0);
  const avgErrorRate =
    modelEntries.length > 0
      ? modelEntries.reduce((sum, [, stat]) => sum + stat.errorRate, 0) / modelEntries.length
      : 0;

  const topModels = modelEntries.slice(0, 3);
  const maxRequests = topModels[0]?.[1]?.totalRequests || 1;

  return (
    <div style={{ height: 220 }}>
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm h-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 size={18} className="text-muted-foreground" />
            <h2 className="text-base font-semibold">Model Usage (All Accounts)</h2>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-muted transition-colors"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
          <button
            onClick={() => setCapsModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-sm font-medium transition-colors"
            title="Manage usage caps"
          >
            <Settings size={14} />
            Caps
          </button>
        </div>

        {/* Collapsed View - fills available space */}
        {!expanded && (
          <div className="space-y-3 overflow-y-auto flex-1">
            {topModels.map(([modelName, modelStat]) => {
              const capProgress = getProgress(modelName);
              const barWidth = (modelStat.totalRequests / maxRequests) * 100;

              return (
                <div key={modelName} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-medium truncate flex-1">
                      {modelName}
                    </span>
                    <span className="text-muted-foreground ml-2">
                      {modelStat.totalRequests} req
                    </span>
                  </div>

                  {/* Usage quota meter */}
                  {capProgress ? (
                    <UsageProgressBar
                      current={capProgress.current}
                      limit={capProgress.limit}
                      alertThreshold={capProgress.alertThreshold}
                    />
                  ) : (
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            <div className="pt-2 border-t border-border/50 text-sm text-muted-foreground">
              Total: {totalRequests.toLocaleString()} requests • {modelEntries.length} models •{" "}
              {(avgErrorRate * 100).toFixed(1)}% avg errors
            </div>
          </div>
        )}

        {/* Expanded View - fills available space */}
        {expanded && (
          <div className="space-y-4 flex-1 flex flex-col overflow-hidden">
            {/* Filters */}
            <div className="flex gap-3">
              <select
                value={TIME_RANGES.findIndex((r) => r.value === timeRange)}
                onChange={(e) => setTimeRange(TIME_RANGES[parseInt(e.target.value)].value)}
                className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm"
              >
                {TIME_RANGES.map((range, idx) => (
                  <option key={idx} value={idx}>
                    {range.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm"
              />
            </div>

            {/* Model List */}
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {modelEntries.map(([modelName, modelStat]) => {
                const capProgress = getProgress(modelName);
                const apiRequests = modelStat.accountTypes.api_key || 0;
                const oauthRequests = modelStat.accountTypes.oauth || 0;
                const errorRate = (modelStat.errorRate * 100).toFixed(1);

                return (
                  <div
                    key={modelName}
                    className="space-y-2 pb-3 border-b border-border/30 last:border-0"
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-medium text-sm">{modelName}</span>
                    </div>

                    <UsageProgressBar
                      current={modelStat.totalRequests}
                      limit={capProgress?.limit}
                      alertThreshold={capProgress?.alertThreshold}
                    />

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>API: {apiRequests}</span>
                      <span>•</span>
                      <span>OAuth: {oauthRequests}</span>
                      <span>•</span>
                      <span
                        className={
                          parseFloat(errorRate) > 10
                            ? "text-destructive"
                            : parseFloat(errorRate) > 5
                              ? "text-yellow-600"
                              : ""
                        }
                      >
                        Errors: {errorRate}% ({modelStat.errors})
                      </span>
                    </div>

                    {/* Top accounts */}
                    {modelStat.accounts && Object.keys(modelStat.accounts).length > 0 && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Top accounts ({Object.keys(modelStat.accounts).length})
                        </summary>
                        <div className="mt-2 space-y-1 pl-4">
                          {Object.entries(modelStat.accounts)
                            .sort(([, a], [, b]) => b.requests - a.requests)
                            .slice(0, 5)
                            .map(([accountId, accountStat]) => (
                              <div key={accountId} className="flex justify-between">
                                <span className="text-muted-foreground">
                                  {accountId} (
                                  {accountStat.type === "api_key" ? "API Key" : "OAuth"})
                                </span>
                                <span>
                                  {accountStat.requests} req, {accountStat.errors} err
                                </span>
                              </div>
                            ))}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>

            {modelEntries.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No models match your search.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Usage Caps Modal */}
      <UsageCapsModal open={capsModalOpen} onClose={() => setCapsModalOpen(false)} />
    </div>
  );
}
