import { useState } from "react";
import type { LogEntry } from "@/hooks/useSocket";
import { cn } from "@/lib/utils";

const LOG_COLORS: Record<string, string> = {
  HTTP: "text-blue-400",
  KEY: "text-yellow-400",
  PROXY: "text-green-400",
  MODEL: "text-purple-400",
  INFO: "text-muted-foreground",
  WARN: "text-orange-400",
  ERROR: "text-red-400",
};

export function Logs({ logs }: { logs: LogEntry[] }) {
  const [filter, setFilter] = useState<string>("ALL");
  const types = ["ALL", "HTTP", "PROXY", "KEY", "MODEL", "INFO", "WARN", "ERROR"];
  const filtered = filter === "ALL" ? logs : logs.filter((l) => l.type === filter);

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold">Logs</h1>
        <div className="flex gap-1.5 flex-wrap">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                filter === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-border bg-card font-mono text-xs p-3 space-y-1">
        {filtered.length === 0 && (
          <p className="text-muted-foreground">No logs yet — waiting for events...</p>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="flex gap-3">
            <span className="text-muted-foreground shrink-0">
              {new Date(l.timestamp).toLocaleTimeString()}
            </span>
            <span
              className={cn("shrink-0 font-bold", LOG_COLORS[l.type] ?? "text-muted-foreground")}
            >
              [{l.type}]
            </span>
            <span className="text-foreground break-all">{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
