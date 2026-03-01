import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

export interface AccountStat {
  type: "api_key" | "oauth";
  requests: number;
  errors: number;
}

export interface ModelStats {
  totalRequests: number;
  errors: number;
  accountTypes: Record<string, number>;
  timestamps: number[];
  accounts: Record<string, AccountStat>;
  errorRate: number;
}

export interface UnifiedStats {
  [modelName: string]: ModelStats;
}

interface UseUnifiedStatsOptions {
  since?: number;
  model?: string;
}

export function useUnifiedStats(options: UseUnifiedStatsOptions = {}) {
  const [stats, setStats] = useState<UnifiedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { socket } = useSocket();

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (options.since) params.since = String(options.since);
      if (options.model) params.model = options.model;

      const data = await api.get("/api/stats/unified", { params });
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.since, options.model]);

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleStatsUpdate = () => {
      // Refresh stats when traffic updates
      fetchStats();
    };

    socket.on("traffic_update", handleStatsUpdate);
    socket.on("stats_update_full", handleStatsUpdate);

    return () => {
      socket.off("traffic_update", handleStatsUpdate);
      socket.off("stats_update_full", handleStatsUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);
  return { stats, loading, error, refresh: fetchStats };
}
