import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useHealth } from "@/hooks/useHealth";
import type { KeyEntry, LogEntry } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Trash2, Plus, Copy, Check } from "lucide-react";
import { AddKeyModal, Modal } from "@/components/Layout";

const CHART_VAR_COUNT = 8;
const SEMANTIC_VARS = [
  "--primary",
  "--destructive",
  "--muted-foreground",
  "--muted",
  "--border",
  "--card",
  "--card-foreground",
] as const;
type SemanticColors = Record<(typeof SEMANTIC_VARS)[number], string>;

function useCssColors(): { chart: string[]; semantic: SemanticColors } {
  const resolve = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    const chart = Array.from(
      { length: CHART_VAR_COUNT },
      (_, i) =>
        style.getPropertyValue(`--chart-${i + 1}`).trim() || `oklch(0.65 0.18 ${(i * 45) % 360})`,
    );
    const semantic = Object.fromEntries(
      SEMANTIC_VARS.map((v) => [v, style.getPropertyValue(v).trim()]),
    ) as SemanticColors;
    return { chart, semantic };
  }, []);

  const [colors, setColors] = useState(resolve);

  useEffect(() => {
    setColors(resolve());
    const observer = new MutationObserver(() => setColors(resolve()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [resolve]);

  return colors;
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
      <div className="text-sm text-muted-foreground font-medium mb-1">{label}</div>
      <div className={`text-3xl font-bold tracking-tight ${accent ?? ""}`}>{value}</div>
      {sub && <div className="text-sm text-muted-foreground mt-2">{sub}</div>}
    </div>
  );
}

const statusColors: Record<string, string> = {
  active: "text-green-500 bg-green-500/10",
  idle: "text-blue-500 bg-blue-500/10",
  cooldown: "text-yellow-500 bg-yellow-500/10",
};

const stripAnsi = (str: string) =>
  str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");

const formatAccountType = (type: string, source: string | null) => {
  if (type === "oauth") {
    if (source === "antigravity") return "Antigravity";
    if (source === "gemini_cli") return "Gemini CLI";
    return "OAuth";
  }
  return "API Key";
};

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 cursor-pointer">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-colors ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute top-2 right-4 p-1.5 rounded-md bg-muted/80 backdrop-blur-sm text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:text-foreground hover:bg-muted border border-border/50 z-10 shadow-sm"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function Overview({
  keys,
  logs,
  trafficTick,
  fullStats,
}: {
  keys: KeyEntry[];
  logs: LogEntry[];
  trafficTick: number;
  fullStats: any;
}) {
  const { error } = useHealth();
  const { chart: chartColors, semantic: sc } = useCssColors();

  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [keyToRemove, setKeyToRemove] = useState<{ tail: string; type: string } | null>(null);
  const [verboseLogging, setVerboseLogging] = useState(() => {
    const saved = localStorage.getItem("geminitro_verbose_logging");
    return saved === "true";
  });
  const [showHealthChecks, setShowHealthChecks] = useState(() => {
    const saved = localStorage.getItem("geminitro_show_health_checks");
    return saved === null ? true : saved === "true";
  });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  // Tracks IDs that have already been auto-expanded so the effect never fights
  // with manual user collapses ("Collapse All" or per-item click).
  const autoExpandedRef = useRef<Set<string>>(new Set());

  // Sync verboseLogging from backend on mount
  useEffect(() => {
    api
      .get("/api/settings")
      .then((data: any) => {
        if (typeof data?.verboseLogging === "boolean") {
          setVerboseLogging(data.verboseLogging);
        }
      })
      .catch(() => {});
  }, []);

  const [trafficHistory, setTrafficHistory] = useState<{ time: string; reqs: number }[]>([]);
  const latestTickRef = useRef(trafficTick);
  latestTickRef.current = trafficTick;
  const prevIntervalTickRef = useRef(trafficTick);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Stats are now managed by useSocket and passed via fullStats prop
  }, []);

  // Persist verbose logging state and sync to backend
  useEffect(() => {
    localStorage.setItem("geminitro_verbose_logging", String(verboseLogging));
  }, [verboseLogging]);

  const handleVerboseChange = useCallback(async (enabled: boolean) => {
    setVerboseLogging(enabled);
    try {
      await api.post("/api/settings/verbose", { enabled });
    } catch {
      // Silently ignore; the local UI state is still updated
    }
  }, []);

  // Persist health checks state
  useEffect(() => {
    localStorage.setItem("geminitro_show_health_checks", String(showHealthChecks));
  }, [showHealthChecks]);

  // Auto-expand NEW verbose log entries only.
  // Uses a ref to track which IDs have already been auto-expanded so that
  // manual collapses (per-item click or "Collapse All") are never overridden.
  useEffect(() => {
    if (!verboseLogging) return;

    const toExpand: string[] = [];
    logs.forEach((log) => {
      const isVerboseLog = log.message.includes("Request:") || log.message.includes("Response:");
      if (isVerboseLog && !autoExpandedRef.current.has(log.id)) {
        autoExpandedRef.current.add(log.id);
        toExpand.push(log.id);
      }
    });

    if (toExpand.length > 0) {
      // Functional update: no stale closure on expandedLogs, so expandedLogs
      // does NOT need to be in the dependency array.
      setExpandedLogs((prev) => {
        const next = new Set(prev);
        toExpand.forEach((id) => next.add(id));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, verboseLogging]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTrafficHistory((prev) => {
        const now = new Date().toLocaleTimeString("en-US", {
          minute: "2-digit",
          second: "2-digit",
        });
        const currentTicks = latestTickRef.current;
        const reqs = currentTicks - prevIntervalTickRef.current;
        prevIntervalTickRef.current = currentTicks;
        return [...prev.slice(-29), { time: now, reqs }];
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleRemoveClick = (tail: string, accountType: string) => {
    setKeyToRemove({ tail, type: accountType });
    setRemoveConfirmOpen(true);
  };

  const handleRemoveConfirm = async () => {
    if (!keyToRemove) return;
    setRemoving(keyToRemove.tail);
    try {
      await api.delete(`/api/keys/${keyToRemove.tail}`);
    } catch {}
    setRemoving(null);
    setRemoveConfirmOpen(false);
    setKeyToRemove(null);
  };

  const handleRemoveCancel = () => {
    setRemoveConfirmOpen(false);
    setKeyToRemove(null);
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const displayLogs = useMemo(() => {
    let filtered = [...logs];
    if (!showHealthChecks) {
      filtered = filtered.filter((log) => !log.message.includes("/api/health"));
    }
    return filtered.reverse();
  }, [logs, showHealthChecks]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-3">⚡</div>
          <p className="text-muted-foreground">GemiNitro server is not reachable</p>
          <p className="text-sm text-muted-foreground mt-1">
            Start it with: <code className="bg-muted px-1 rounded">geminitro start</code>
          </p>
        </div>
      </div>
    );
  }

  const totalReqs = fullStats?.totalRequests ?? 0;
  const totalSuccess = fullStats?.totalSuccess ?? 0;
  const totalErrors = fullStats?.totalErrors ?? 0;
  const successRate = totalReqs > 0 ? Math.round((totalSuccess / totalReqs) * 100) : 100;

  const dailyEntries = fullStats ? Object.entries(fullStats.daily ?? {}) : [];
  const avgDaily =
    dailyEntries.length > 0
      ? Math.round(
          dailyEntries.reduce((sum, [, d]: [string, any]) => sum + (d.requests ?? 0), 0) /
            dailyEntries.length,
        )
      : 0;

  const days = dailyEntries
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, data]: [string, any]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      success: data.success ?? 0,
      errors: data.errors ?? 0,
    }));

  const modelEntries = fullStats
    ? (Object.entries(fullStats.models ?? {})
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 8) as [string, number][])
    : [];

  const pieData = modelEntries.map(([name, value]) => ({ name, value }));

  return (
    <div className="p-8 w-full space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Traffic" value={totalReqs} sub={`+ ${trafficTick} this session`} />
        <StatCard
          label="Success Rate"
          value={`${successRate}% `}
          sub={`${totalSuccess} successful`}
          accent={
            successRate >= 90
              ? "text-green-500"
              : successRate >= 70
                ? "text-yellow-500"
                : "text-destructive"
          }
        />
        <StatCard
          label="Errors"
          value={totalErrors}
          sub="Total errors"
          accent={totalErrors > 0 ? "text-destructive" : undefined}
        />
        <StatCard
          label="Avg Daily"
          value={avgDaily}
          sub={`over ${dailyEntries.length} day${dailyEntries.length !== 1 ? "s" : ""} `}
        />
      </div>

      {/* Row 2: Live Traffic Area Chart */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
        <h2 className="text-base font-semibold mb-6">Live Traffic</h2>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trafficHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReqs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={sc["--primary"]} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={sc["--primary"]} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                tick={{ fill: sc["--muted-foreground"], fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
              />
              <YAxis
                tick={{ fill: sc["--muted-foreground"], fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: `1px solid ${sc["--border"]}`,
                  backgroundColor: sc["--card"],
                  color: sc["--card-foreground"],
                  boxShadow: "var(--shadow-md)",
                }}
                itemStyle={{ color: sc["--primary"], fontWeight: 600 }}
                cursor={{
                  stroke: sc["--muted-foreground"],
                  strokeWidth: 1,
                  strokeDasharray: "4 4",
                  opacity: 0.4,
                }}
              />
              <Area
                type="monotone"
                dataKey="reqs"
                name="Requests"
                stroke={sc["--primary"]}
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorReqs)"
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 3: 7-Day Chart + Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-6">7-Day Requests</h2>
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No request history yet.
            </p>
          ) : (
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: sc["--muted-foreground"], fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: sc["--muted-foreground"], fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: `1px solid ${sc["--border"]}`,
                      backgroundColor: sc["--card"],
                      color: sc["--card-foreground"],
                      boxShadow: "var(--shadow-md)",
                    }}
                    cursor={{ fill: sc["--muted"], opacity: 0.4 }}
                  />

                  <Bar
                    dataKey="success"
                    name="Success"
                    fill={sc["--primary"]}
                    radius={[4, 4, 0, 0] as any}
                  />
                  <Bar
                    dataKey="errors"
                    name="Errors"
                    fill={sc["--destructive"]}
                    radius={[4, 4, 0, 0] as any}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-6">Model Usage</h2>
          <div className="flex flex-row items-center h-[250px]">
            <div className="flex-1 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    labelLine={false}
                    stroke={sc["--card"]}
                    strokeWidth={2}
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: `1px solid ${sc["--border"]}`,
                      backgroundColor: sc["--card"],
                      color: sc["--card-foreground"],
                      boxShadow: "var(--shadow-md)",
                    }}
                    itemStyle={{ fontWeight: 500 }}
                    formatter={(value: any, name: any) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 overflow-y-auto max-h-full pl-6 space-y-2.5">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2 text-[11px]">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: chartColors[index % chartColors.length] }}
                  />
                  <span className="truncate text-foreground/90 font-medium">{entry.name}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Keys Table + System Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-[450px] shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold">Accounts</h2>
            <button
              onClick={() => setAddKeyOpen(true)}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex-1 overflow-auto overflow-x-auto min-h-0 border border-border/50 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Key</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Type</th>
                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Status</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Reqs</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Errs</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No keys in pool.
                    </td>
                  </tr>
                )}
                {keys.map((k) => (
                  <tr
                    key={k.tail}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2 font-mono">...{k.tail}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatAccountType(k.type, k.source)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColors[k.status] ?? "text-muted-foreground bg-muted"}`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{k.usage ?? 0}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-destructive">
                      {k.errors ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() =>
                          handleRemoveClick(k.tail, formatAccountType(k.type, k.source))
                        }
                        disabled={removing === k.tail}
                        title="Remove Key"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-6 flex flex-col h-[450px] shadow-sm">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <h2 className="text-base font-semibold">System Logs</h2>
            <div className="flex items-center gap-4">
              <Switch
                checked={showHealthChecks}
                onChange={setShowHealthChecks}
                label="Health Checks"
              />
              <Switch checked={verboseLogging} onChange={handleVerboseChange} label="Verbose" />
              {verboseLogging && (
                <button
                  onClick={() => {
                    if (expandedLogs.size > 0) {
                      setExpandedLogs(new Set());
                    } else {
                      const allVerboseLogIds = displayLogs
                        .filter(
                          (log) =>
                            log.message.includes("Request:") || log.message.includes("Response:"),
                        )
                        .map((log) => log.id);
                      setExpandedLogs(new Set(allVerboseLogIds));
                    }
                  }}
                  className="w-6 h-6 flex items-center justify-center rounded bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors text-xs font-bold"
                  title={expandedLogs.size > 0 ? "Collapse All" : "Expand All"}
                >
                  {expandedLogs.size > 0 ? "−" : "+"}
                </button>
              )}
            </div>
          </div>
          <div className="relative flex-1 min-h-0 overflow-hidden">
            <div
              ref={logsContainerRef}
              className="h-full overflow-auto rounded-lg p-3 font-mono text-[10px] shadow-inner"
              style={{
                backgroundColor: "oklch(0.22 0.008 50)",
                border: "1px solid oklch(0.30 0.008 50)",
              }}
            >
              {displayLogs.length === 0 ? (
                <div style={{ color: "oklch(0.45 0.008 50)" }} className="italic">
                  No logs yet...
                </div>
              ) : (
                displayLogs.map((log, idx) => {
                  const msgColor = idx % 2 === 0 ? chartColors[0] : chartColors[1];
                  const isExpanded = expandedLogs.has(log.id);
                  const isVerboseLog =
                    verboseLogging &&
                    (log.message.includes("Request:") || log.message.includes("Response:"));

                  return (
                    <div
                      key={log.id}
                      className="rounded break-all"
                      style={{
                        backgroundColor:
                          idx % 2 === 0 ? "oklch(0.25 0.008 50 / 0.6)" : "transparent",
                      }}
                    >
                      <div
                        className={`flex gap-2 py-0.5 px-1.5 ${isVerboseLog ? "cursor-pointer hover:bg-muted/20" : ""}`}
                        onClick={() => isVerboseLog && toggleLogExpanded(log.id)}
                      >
                        <span
                          className="shrink-0 tabular-nums"
                          style={{ color: "oklch(0.45 0.008 50)" }}
                        >
                          {log.timestamp}
                        </span>
                        <span
                          className="shrink-0 font-bold"
                          style={{ color: "oklch(0.50 0.008 50)" }}
                        >
                          [{log.type}]
                        </span>
                        <span style={{ color: msgColor }}>
                          {isVerboseLog && <span className="mr-2">{isExpanded ? "▼" : "▲"}</span>}
                          {stripAnsi(log.message).split("\n")[0]}
                        </span>
                      </div>
                      {isVerboseLog && isExpanded && (
                        <div className="relative group">
                          <CopyButton text={stripAnsi(log.message)} />
                          <div
                            className="px-8 py-1.5 text-[9px] space-y-0.5 overflow-y-auto"
                            style={{
                              color: "oklch(0.60 0.008 50)",
                              maxHeight: "200px",
                            }}
                          >
                            {stripAnsi(log.message)
                              .split("\n")
                              .slice(1)
                              .map((line, i) => (
                                <div key={i} className="whitespace-pre-wrap break-all">
                                  {line}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <AddKeyModal open={addKeyOpen} onClose={() => setAddKeyOpen(false)} />

      <Modal open={removeConfirmOpen} onClose={handleRemoveCancel} title="Remove Account">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove this account?
          </p>
          {keyToRemove && (
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <div className="text-xs text-muted-foreground">Account Type</div>
              <div className="font-medium">{keyToRemove.type}</div>
              <div className="text-xs text-muted-foreground mt-2">Key</div>
              <div className="font-mono text-sm">...{keyToRemove.tail}</div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleRemoveCancel}
              className="flex-1 px-4 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRemoveConfirm}
              disabled={removing === keyToRemove?.tail}
              className="flex-1 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {removing === keyToRemove?.tail ? "Removing..." : "Remove"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
