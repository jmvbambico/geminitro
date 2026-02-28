import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

export interface UsageCap {
  model: string;
  limit: number;
  period: "daily" | "hourly" | "weekly";
  alertThreshold: number;
  action: "try_next" | "warn_only";
  enabled: boolean;
  lastReset?: string;
}

export interface CapProgress {
  model: string;
  current: number;
  limit: number;
  percentage: number;
  alertThreshold: number;
  atWarning: boolean;
  atCap: boolean;
  nextReset: string;
  lastReset: string | null;
}

interface CapsConfig {
  caps: UsageCap[];
  resetTime: string;
  timezone: string;
}

export function useUsageCaps() {
  const [caps, setCaps] = useState<UsageCap[]>([]);
  const [progress, setProgress] = useState<CapProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchCaps = async () => {
    try {
      const data: CapsConfig = await api.get("/api/stats/caps");
      setCaps(data.caps);
    } catch (err) {
      console.error("Failed to fetch usage caps:", err);
    }
  };

  const fetchProgress = async () => {
    try {
      const data: CapProgress[] = await api.get("/api/stats/caps/progress");
      setProgress(data);
    } catch (err) {
      console.error("Failed to fetch cap progress:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaps();
    fetchProgress();
  }, []);

  // Socket.IO event listeners
  useEffect(() => {
    if (!socket) return;

    const handleCapWarning = (data: {
      model: string;
      current: number;
      limit: number;
      percentage: number;
      threshold: number;
    }) => {
      console.warn(`Usage cap warning: ${data.model} at ${data.percentage.toFixed(1)}%`);
      fetchProgress();
    };

    const handleCapExceeded = (data: { model: string; current: number; limit: number }) => {
      console.error(`Usage cap exceeded: ${data.model} (${data.current}/${data.limit})`);
      fetchProgress();
    };

    const handleCapUpdated = () => {
      fetchCaps();
      fetchProgress();
    };

    socket.on("usage:cap-warning", handleCapWarning);
    socket.on("usage:cap-exceeded", handleCapExceeded);
    socket.on("usage:cap-updated", handleCapUpdated);

    return () => {
      socket.off("usage:cap-warning", handleCapWarning);
      socket.off("usage:cap-exceeded", handleCapExceeded);
      socket.off("usage:cap-updated", handleCapUpdated);
    };
  }, [socket]);

  const addCap = async (cap: Omit<UsageCap, "lastReset">) => {
    try {
      await api.post("/api/stats/caps", cap);
      await fetchCaps();
      await fetchProgress();
    } catch (err) {
      console.error("Failed to add usage cap:", err);
      throw err;
    }
  };

  const updateCap = async (cap: UsageCap) => {
    try {
      await api.post("/api/stats/caps", cap);
      await fetchCaps();
      await fetchProgress();
    } catch (err) {
      console.error("Failed to update usage cap:", err);
      throw err;
    }
  };

  const removeCap = async (model: string) => {
    try {
      await api.delete(`/api/stats/caps/${model}`);
      await fetchCaps();
      await fetchProgress();
    } catch (err) {
      console.error("Failed to remove usage cap:", err);
      throw err;
    }
  };

  const getProgress = (model: string): CapProgress | null => {
    return progress.find((p) => p.model === model) || null;
  };

  return {
    caps,
    progress,
    loading,
    addCap,
    updateCap,
    removeCap,
    getProgress,
    refresh: () => {
      fetchCaps();
      fetchProgress();
    },
  };
}
