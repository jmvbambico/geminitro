# GemiNitro Web Dashboard + Smart First-Run Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Vite + React + Tailwind v4 + shadcn web dashboard served at `/dashboard`, and rework `geminitro start` into a smart first-run wizard that detects install state and offers terminal or browser setup.

**Architecture:** Vite project lives in `dashboard/`, builds to `public/` which Express serves as static files at `/dashboard`. The existing Socket.IO events (`stats_update`, `traffic_update`, `log`) and REST API (`/api/*`) power the dashboard with no new backend routes needed. The CLI `start` command is restructured to detect whether the provider is installed and whether keys exist, then branch into an interactive setup flow or normal start.

**Tech Stack:** React 18, Vite 5, Tailwind v4 (`@import "tailwindcss"`), shadcn/ui, socket.io-client, recharts (for charts), @inquirer/prompts (already installed), open (npm package to launch browser), Node.js/Express 5

---

## Overview of All Tasks

1. Scaffold the Vite + React + Tailwind v4 + shadcn dashboard project
2. Create the OKLCH theme CSS and Tailwind config
3. Build the Layout shell (sidebar nav, dark mode toggle, Socket.IO connection)
4. Build the Overview page
5. Build the Keys page (table + add/remove + cooldown countdown)
6. Build the Stats page (7-day chart + model breakdown)
7. Build the Logs page (live Socket.IO log stream)
8. Build the Settings page (read-only config)
9. Build the first-run wizard page (key add flow)
10. Wire Vite build output → Express static serving
11. Rework `geminitro start` into the smart first-run flow
12. Add `open` package and browser launch helper
13. Final wiring + smoke test

---

## Task 1: Scaffold Vite + React project

**Files:**

- Create: `dashboard/` (directory)
- Create: `dashboard/package.json`
- Create: `dashboard/vite.config.ts`
- Create: `dashboard/index.html`
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/App.tsx`

**Step 1: Init the Vite project**

```bash
cd /path/to/geminitro
npm create vite@latest dashboard -- --template react-ts
cd dashboard
npm install
```

**Step 2: Install runtime dependencies**

```bash
npm install socket.io-client recharts lucide-react clsx tailwind-merge class-variance-authority @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-separator @radix-ui/react-tooltip @radix-ui/react-tabs @radix-ui/react-badge
```

**Step 3: Install Tailwind v4**

```bash
npm install tailwindcss@next @tailwindcss/vite@next
```

**Step 4: Update `dashboard/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:7536",
      "/v1": "http://localhost:7536",
      "/socket.io": { target: "http://localhost:7536", ws: true },
    },
  },
  base: "/dashboard/",
});
```

Note: `base: '/dashboard/'` ensures all asset URLs are relative to `/dashboard/` when served by Express.

**Step 5: Verify scaffold works**

```bash
cd dashboard && npm run dev
```

Expected: Vite dev server starts on :5173, React default page loads at http://localhost:5173/dashboard/

---

## Task 2: OKLCH Theme CSS

**Files:**

- Create: `dashboard/src/index.css`

**Step 1: Replace `dashboard/src/index.css` with the full theme**

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@layer base {
  :root {
    --background: oklch(1 0 0);
    --foreground: oklch(0.145 0 0);
    --card: oklch(1 0 0);
    --card-foreground: oklch(0.145 0 0);
    --popover: oklch(1 0 0);
    --popover-foreground: oklch(0.145 0 0);
    --primary: oklch(0.205 0 0);
    --primary-foreground: oklch(0.985 0 0);
    --secondary: oklch(0.97 0 0);
    --secondary-foreground: oklch(0.205 0 0);
    --muted: oklch(0.97 0 0);
    --muted-foreground: oklch(0.556 0 0);
    --accent: oklch(0.97 0 0);
    --accent-foreground: oklch(0.205 0 0);
    --destructive: oklch(0.577 0.245 27.325);
    --border: oklch(0.922 0 0);
    --input: oklch(0.922 0 0);
    --ring: oklch(0.708 0 0);
    --chart-1: oklch(0.646 0.222 41.116);
    --chart-2: oklch(0.6 0.118 184.714);
    --chart-3: oklch(0.398 0.07 227.392);
    --chart-4: oklch(0.828 0.189 84.429);
    --chart-5: oklch(0.769 0.188 70.08);
    --sidebar: oklch(0.985 0 0);
    --sidebar-foreground: oklch(0.145 0 0);
    --sidebar-primary: oklch(0.205 0 0);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.97 0 0);
    --sidebar-accent-foreground: oklch(0.205 0 0);
    --sidebar-border: oklch(0.922 0 0);
    --sidebar-ring: oklch(0.708 0 0);
  }

  .dark {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --popover: oklch(0.205 0 0);
    --popover-foreground: oklch(0.985 0 0);
    --primary: oklch(0.985 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --accent: oklch(0.269 0 0);
    --accent-foreground: oklch(0.985 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --input: oklch(1 0 0 / 15%);
    --ring: oklch(0.556 0 0);
    --chart-1: oklch(0.488 0.243 264.376);
    --chart-2: oklch(0.696 0.17 162.48);
    --chart-3: oklch(0.769 0.188 70.08);
    --chart-4: oklch(0.627 0.265 303.9);
    --chart-5: oklch(0.645 0.246 16.439);
    --sidebar: oklch(0.205 0 0);
    --sidebar-foreground: oklch(0.985 0 0);
    --sidebar-primary: oklch(0.488 0.243 264.376);
    --sidebar-primary-foreground: oklch(0.985 0 0);
    --sidebar-accent: oklch(0.269 0 0);
    --sidebar-accent-foreground: oklch(0.985 0 0);
    --sidebar-border: oklch(1 0 0 / 10%);
    --sidebar-ring: oklch(0.556 0 0);
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

* {
  border-color: var(--border);
}
body {
  background-color: var(--background);
  color: var(--foreground);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}
```

**Step 2: Import in `dashboard/src/main.tsx`**

```tsx
import "./index.css";
```

---

## Task 3: Shared utilities + shadcn-compatible cn() helper

**Files:**

- Create: `dashboard/src/lib/utils.ts`
- Create: `dashboard/src/lib/api.ts`
- Create: `dashboard/src/hooks/useSocket.ts`
- Create: `dashboard/src/hooks/useHealth.ts`
- Create: `dashboard/src/hooks/useDarkMode.ts`

**Step 1: `lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 2: `lib/api.ts`**

The dashboard reads the proxy API key from `localStorage` (key: `geminitro_api_key`, default: `"geminitro"`).

```typescript
const getApiKey = () => localStorage.getItem("geminitro_api_key") ?? "geminitro";
const BASE = ""; // same origin — Express serves both API and dashboard

export const api = {
  get: (path: string) =>
    fetch(path, { headers: { Authorization: `Bearer ${getApiKey()}` } }).then((r) => r.json()),

  post: (path: string, body: unknown) =>
    fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getApiKey()}` },
      body: JSON.stringify(body),
    }).then((r) => r.json()),

  delete: (path: string) =>
    fetch(path, { method: "DELETE", headers: { Authorization: `Bearer ${getApiKey()}` } }).then(
      (r) => r.json(),
    ),
};
```

**Step 3: `hooks/useSocket.ts`**

```typescript
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export type LogEntry = { id: string; type: string; message: string; timestamp: string };
export type KeyEntry = {
  tail: string;
  status: string;
  usage: number;
  errors: number;
  lastUsed: number | null;
  cooldownUntil: number | null;
};

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trafficTick, setTrafficTick] = useState(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Connect to same origin (Express), not Vite dev server
    const origin = import.meta.env.DEV ? "http://localhost:7536" : window.location.origin;
    const socket = io(origin, { path: "/socket.io" });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("stats_update", (pool: KeyEntry[]) => setKeys(pool));
    socket.on("traffic_update", () => setTrafficTick((t) => t + 1));
    socket.on("log", (entry: LogEntry) => setLogs((prev) => [entry, ...prev].slice(0, 500)));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { keys, logs, trafficTick, connected };
}
```

**Step 4: `hooks/useHealth.ts`**

Polls `/api/health` every 5 seconds (no auth required).

```typescript
import { useEffect, useState } from "react";

export type HealthData = {
  status: string;
  uptime: number;
  version: string;
  models: number;
  keys: {
    total: number;
    active: number;
    cooldown: number;
    minCooldown: number;
    cooldownKeys: { tail: string; remaining: number }[];
  };
};

export function useHealth() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchHealth = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((d) => {
          setHealth(d);
          setError(false);
        })
        .catch(() => setError(true));

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  return { health, error };
}
```

**Step 5: `hooks/useDarkMode.ts`**

```typescript
import { useEffect, useState } from "react";

export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("geminitro_dark");
    if (stored !== null) return stored === "true";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("geminitro_dark", String(dark));
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
```

---

## Task 4: Layout shell

**Files:**

- Create: `dashboard/src/components/Layout.tsx`
- Create: `dashboard/src/components/ui/` (shadcn-compatible primitives as needed)

**Step 1: `components/Layout.tsx`**

Sidebar nav with icons (lucide-react), connection indicator, dark mode toggle.

```tsx
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Key,
  BarChart2,
  ScrollText,
  Settings,
  Sun,
  Moon,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";

const navItems = [
  { to: "/overview", icon: LayoutDashboard, label: "Overview" },
  { to: "/keys", icon: Key, label: "Keys" },
  { to: "/stats", icon: BarChart2, label: "Stats" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ connected }: { connected: boolean }) {
  const { dark, toggle } = useDarkMode();

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col border-r border-border bg-sidebar">
        <div className="px-4 py-5 border-b border-sidebar-border">
          <span className="font-bold text-lg tracking-tight text-sidebar-foreground">
            GemiNitro
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            {connected ? (
              <>
                <Wifi className="w-3 h-3 text-green-500" />
                <span className="text-xs text-muted-foreground">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-red-500" />
                <span className="text-xs text-muted-foreground">Disconnected</span>
              </>
            )}
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-sidebar-border">
          <button
            onClick={toggle}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 2: Add react-router-dom**

```bash
cd dashboard && npm install react-router-dom
```

---

## Task 5: App.tsx routing

**Files:**

- Modify: `dashboard/src/App.tsx`

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Overview } from "@/pages/Overview";
import { Keys } from "@/pages/Keys";
import { Stats } from "@/pages/Stats";
import { Logs } from "@/pages/Logs";
import { Settings } from "@/pages/SettingsPage";
import { Setup } from "@/pages/Setup";
import { useSocket } from "@/hooks/useSocket";

export default function App() {
  const { keys, logs, trafficTick, connected } = useSocket();

  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        {/* First-run wizard — no layout */}
        <Route path="/setup" element={<Setup />} />

        {/* Main app */}
        <Route element={<Layout connected={connected} />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<Overview keys={keys} trafficTick={trafficTick} />} />
          <Route path="/keys" element={<Keys keys={keys} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/logs" element={<Logs logs={logs} />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

---

## Task 6: Overview page

**Files:**

- Create: `dashboard/src/pages/Overview.tsx`

Stat cards: uptime, total keys (active/cooldown), model count, traffic ticker.
Uses `useHealth` for server data + `trafficTick` prop for live traffic pulse.

```tsx
import { useHealth } from "@/hooks/useHealth";
import { KeyEntry } from "@/hooks/useSocket";
import { Server, Key, Zap, Clock } from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-muted">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

export function Overview({ keys, trafficTick }: { keys: KeyEntry[]; trafficTick: number }) {
  const { health, error } = useHealth();

  const formatUptime = (s: number) => {
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

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

  const activeKeys = keys.filter((k) => k.status === "active" || k.status === "idle").length;
  const coolingKeys = keys.filter((k) => k.status === "cooldown").length;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">Overview</h1>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Server}
          label="Uptime"
          value={health ? formatUptime(health.uptime) : "—"}
          sub={`v${health?.version ?? "..."}`}
        />
        <StatCard
          icon={Key}
          label="Keys"
          value={health ? `${activeKeys} / ${health.keys.total}` : "—"}
          sub={coolingKeys > 0 ? `${coolingKeys} cooling down` : "All active"}
        />
        <StatCard icon={Zap} label="Models" value={health?.models ?? "—"} sub="Available" />
        <StatCard icon={Clock} label="Traffic" value={trafficTick} sub="Requests this session" />
      </div>

      {health && health.keys.cooldown > 0 && (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">Keys on cooldown</h2>
          <div className="space-y-2">
            {health.keys.cooldownKeys.map((k) => (
              <div key={k.tail} className="flex justify-between items-center text-sm">
                <span className="font-mono text-muted-foreground">...{k.tail}</span>
                <span className="text-yellow-500">{k.remaining}s remaining</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Task 7: Keys page

**Files:**

- Create: `dashboard/src/pages/Keys.tsx`

Full key pool table with: masked key (last 6), status badge, usage count, error count, cooldown countdown. Add/remove via API.

```tsx
import { useState } from "react";
import { api } from "@/lib/api";
import { KeyEntry } from "@/hooks/useSocket";
import { Trash2, Plus, RefreshCw } from "lucide-react";

const statusColors: Record<string, string> = {
  active: "text-green-500 bg-green-500/10",
  idle: "text-blue-500 bg-blue-500/10",
  cooldown: "text-yellow-500 bg-yellow-500/10",
};

export function Keys({ keys }: { keys: KeyEntry[] }) {
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!newKey.trim()) return;
    setAdding(true);
    setAddError("");
    setAddSuccess("");
    try {
      const res = await api.post("/api/keys", { key: newKey.trim() });
      if (res.error) {
        setAddError(res.error);
      } else {
        setAddSuccess(`Key added. ${res.models?.length ?? 0} models available.`);
        setNewKey("");
      }
    } catch {
      setAddError("Request failed — is the server running?");
    }
    setAdding(false);
  };

  const handleRemove = async (tail: string) => {
    setRemoving(tail);
    try {
      await api.delete(`/api/keys/${tail}`);
    } catch {}
    setRemoving(null);
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-6">API Keys</h1>

      {/* Add key */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h2 className="text-sm font-medium mb-3">Add Key</h2>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="AIzaSy..."
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newKey.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {adding ? "Validating..." : "Add"}
          </button>
        </div>
        {addError && <p className="text-sm text-destructive mt-2">{addError}</p>}
        {addSuccess && <p className="text-sm text-green-500 mt-2">{addSuccess}</p>}
      </div>

      {/* Key table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Key</th>
              <th className="px-4 py-3 text-left text-muted-foreground font-medium">Status</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Requests</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium">Errors</th>
              <th className="px-4 py-3 text-right text-muted-foreground font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No keys in pool. Add one above.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.tail} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-mono">...{k.tail}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[k.status] ?? "text-muted-foreground bg-muted"}`}
                  >
                    {k.status}
                  </span>
                  {k.status === "cooldown" && k.cooldownUntil && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {Math.max(0, Math.ceil((k.cooldownUntil - Date.now()) / 1000))}s
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{k.usage ?? 0}</td>
                <td className="px-4 py-3 text-right tabular-nums text-destructive">
                  {k.errors ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(k.tail)}
                    disabled={removing === k.tail}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

## Task 8: Stats page

**Files:**

- Create: `dashboard/src/pages/Stats.tsx`

7-day request bar chart + model usage breakdown. Fetches from `/api/stats`.

```tsx
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function Stats() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api
      .get("/api/stats")
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) return <div className="p-6 text-muted-foreground">Loading stats...</div>;

  const days = Object.entries(stats.daily ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, data]: [string, any]) => ({
      date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      requests: data.requests ?? 0,
      success: data.success ?? 0,
      errors: data.errors ?? 0,
    }));

  const modelEntries = Object.entries(stats.models ?? {})
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 10) as [string, number][];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Stats</h1>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">7-Day Requests</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={days}>
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="success" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="errors" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">Model Usage</h2>
        {modelEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No model usage recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {modelEntries.map(([model, count]) => (
              <div key={model} className="flex justify-between text-sm">
                <span className="font-mono text-muted-foreground truncate max-w-xs">{model}</span>
                <span className="tabular-nums font-medium">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Task 9: Logs page

**Files:**

- Create: `dashboard/src/pages/Logs.tsx`

Live log stream with type filter. Receives logs via Socket.IO `log` event.

```tsx
import { useState } from "react";
import { LogEntry } from "@/hooks/useSocket";
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
        <div className="flex gap-1.5">
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
```

---

## Task 10: Settings page

**Files:**

- Create: `dashboard/src/pages/SettingsPage.tsx`

Read-only config display from `/api/health`. Also shows the API key input for updating `localStorage`.

```tsx
import { useHealth } from "@/hooks/useHealth";
import { useState } from "react";

export function Settings() {
  const { health } = useHealth();
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("geminitro_api_key") ?? "geminitro",
  );
  const [saved, setSaved] = useState(false);

  const saveKey = () => {
    localStorage.setItem("geminitro_api_key", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-lg">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-medium">Dashboard API Key</h2>
        <p className="text-xs text-muted-foreground">
          Stored in localStorage. Sent as Bearer token to all proxy API calls.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={saveKey}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            {saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-medium mb-3">Server Info</h2>
        {health ? (
          <dl className="space-y-2 text-sm">
            {[
              ["Status", health.status],
              ["Version", `v${health.version}`],
              ["Port", "7536"],
              ["Uptime", `${health.uptime}s`],
              ["Models", health.models],
              ["Total keys", health.keys.total],
            ].map(([k, v]) => (
              <div key={String(k)} className="flex justify-between">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Server not reachable</p>
        )}
      </div>
    </div>
  );
}
```

---

## Task 11: Setup / First-run wizard page

**Files:**

- Create: `dashboard/src/pages/Setup.tsx`

Standalone page (no sidebar layout). Shown when server redirects to `/dashboard/setup`.

```tsx
import { useState } from "react";
import { api } from "@/lib/api";
import { CheckCircle2, RefreshCw } from "lucide-react";

type Stage = "idle" | "validating" | "success" | "error";

export function Setup() {
  const [key, setKey] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);

  const handleAdd = async () => {
    if (!key.trim()) return;
    setStage("validating");
    setMessage("");
    try {
      const res = await api.post("/api/keys", { key: key.trim() });
      if (res.error) {
        setStage("error");
        setMessage(res.error);
      } else {
        setStage("success");
        setModels(res.models ?? []);
      }
    } catch {
      setStage("error");
      setMessage("Could not reach server. Make sure geminitro is running.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Welcome to GemiNitro</h1>
          <p className="text-muted-foreground">Add your first Gemini API key to get started.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Get a free key at{" "}
            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline text-primary"
            >
              aistudio.google.com
            </a>
          </p>
        </div>

        {stage !== "success" ? (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <label className="block text-sm font-medium">Gemini API Key</label>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {stage === "error" && <p className="text-sm text-destructive">{message}</p>}
            <button
              onClick={handleAdd}
              disabled={stage === "validating" || !key.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {stage === "validating" && <RefreshCw className="w-4 h-4 animate-spin" />}
              {stage === "validating" ? "Validating key..." : "Add Key & Continue"}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Key added successfully!</h2>
            <p className="text-sm text-muted-foreground">{models.length} models available.</p>
            <a
              href="/dashboard"
              className="block w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium text-center"
            >
              Open Dashboard →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Task 12: Wire build output → Express static serving

**Files:**

- Modify: `server.js`

**Step 1: Add static file serving for built dashboard**

After all existing middleware but BEFORE `app.use("/", apiRoutes(io))`:

```javascript
const path = require("path");

// Serve built dashboard at /dashboard
const dashboardPath = path.join(__dirname, "public");
if (require("fs").existsSync(dashboardPath)) {
  app.use("/dashboard", express.static(dashboardPath));
  // SPA fallback — send index.html for any /dashboard/* route not found as a file
  app.get(/^\/dashboard(\/.*)?$/, (req, res) => {
    res.sendFile(path.join(dashboardPath, "index.html"));
  });
}
```

**Step 2: Verify**

Build dashboard first (`cd dashboard && npm run build`), then:

```bash
node server.js
# curl http://localhost:7536/dashboard → should return HTML
```

---

## Task 13: Rework `geminitro start` — smart first-run flow

**Files:**

- Create: `src/cli/firstRun.js`
- Modify: `bin/geminitro.js` (start action)

### `src/cli/firstRun.js`

This module encapsulates the entire smart start flow.

```javascript
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const OPENCODE_GLOBAL_CONFIG = path.join(os.homedir(), ".config", "opencode", "opencode.json");
const OPENCODE_LOCAL_CONFIG = path.join(process.cwd(), "opencode.json");

const isProviderRegistered = () => {
  for (const p of [OPENCODE_GLOBAL_CONFIG, OPENCODE_LOCAL_CONFIG]) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
      if (cfg?.provider?.geminitro) return true;
    } catch {}
  }
  return false;
};

const hasKeys = () => {
  const config = require("../../config");
  try {
    const raw = fs.readFileSync(path.join(config.DATA_DIR, "keys.json"), "utf8");
    const keys = raw.trim() ? JSON.parse(raw) : [];
    return Array.isArray(keys) && keys.length > 0;
  } catch {
    return false;
  }
};

const openBrowser = async (url) => {
  // Lazy-load `open` package; fall back to platform shell command
  try {
    const open = require("open");
    await open(url);
  } catch {
    const { execSync } = require("child_process");
    const cmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      execSync(`${cmd} "${url}"`, { stdio: "ignore" });
    } catch {}
  }
};

const run = async (options = {}) => {
  const chalk = require("chalk");
  const { select } = require("@inquirer/prompts");
  const config = require("../../config");

  const registered = isProviderRegistered();
  const hasApiKeys = hasKeys();

  // ── Case 1: Not installed ──────────────────────────────────────────────────
  if (!registered) {
    console.log(chalk.yellow("\n  ⚠  GemiNitro is not yet registered as an OpenCode provider.\n"));

    const action = await select({
      message: "What would you like to do?",
      choices: [
        { name: "Install now (interactive)", value: "install" },
        { name: "Skip — just start the server", value: "skip" },
      ],
    });

    if (action === "install") {
      await require("./install").run();
    }
  }

  // ── Case 2: No keys ────────────────────────────────────────────────────────
  if (!hasApiKeys) {
    console.log(chalk.yellow("\n  ⚠  No API keys configured.\n"));

    const method = await select({
      message: "Add your first Gemini API key via:",
      choices: [
        { name: "Terminal — enter key now", value: "terminal" },
        { name: "Browser — open dashboard setup wizard", value: "browser" },
        { name: "Skip — I'll add keys later", value: "skip" },
      ],
    });

    if (method === "terminal") {
      const { input } = require("@inquirer/prompts");
      const apiKey = await input({ message: "Paste your Gemini API key:" });
      if (apiKey?.trim()) {
        await require("./keys").add(apiKey.trim());
      }
      // Start server normally after key add
      startServer(options);
    } else if (method === "browser") {
      // Start server first so the dashboard is reachable
      startServer(options);
      // Give server 1s to boot before opening browser
      await new Promise((r) => setTimeout(r, 1000));
      const setupUrl = `http://localhost:${config.PORT}/dashboard/setup`;
      console.log(chalk.cyan(`\n  Opening setup wizard: ${setupUrl}\n`));
      await openBrowser(setupUrl);
    } else {
      startServer(options);
    }
    return;
  }

  // ── Case 3: Fully configured ───────────────────────────────────────────────
  const choice = await select({
    message: "GemiNitro is ready. How do you want to proceed?",
    choices: [
      { name: "Open browser dashboard", value: "browser" },
      { name: "Stay in terminal", value: "terminal" },
    ],
  });

  startServer(options);

  if (choice === "browser") {
    await new Promise((r) => setTimeout(r, 1000));
    const dashUrl = `http://localhost:${config.PORT}/dashboard`;
    console.log(chalk.cyan(`\n  Opening dashboard: ${dashUrl}\n`));
    await openBrowser(dashUrl);
  }
};

const startServer = (options = {}) => {
  if (options.splash !== false) {
    const { version } = require("../../package.json");
    const config = require("../../config");
    require("./splash").printSplash(version, config.PORT);
  }
  require("../../server");
};

module.exports = { run };
```

### Update `bin/geminitro.js` start action

Replace the existing `start` action body:

```javascript
program
  .command("start")
  .description("Start the GemiNitro proxy server")
  .option("--no-splash", "Skip the splash screen")
  .option("--no-interactive", "Skip first-run prompts, start immediately")
  .option("-p, --port <port>", "Override port (also set via PORT env var)")
  .action(async (options) => {
    if (options.port) process.env.PORT = options.port;
    if (options.interactive === false) {
      // Direct start — no prompts
      const config = require("../config");
      if (options.splash !== false)
        require("../src/cli/splash").printSplash(require("../package.json").version, config.PORT);
      require("../server");
    } else {
      await require("../src/cli/firstRun").run(options);
    }
  });
```

---

## Task 14: Add `open` package

**Files:**

- Modify: `package.json` (root)

```bash
npm install open
```

Note: `open` is ESM-only from v9+. Pin to v8 which is CJS-compatible since the project uses `"type": "commonjs"`:

```bash
npm install open@8
```

---

## Task 15: Add `npm run build` script to root package.json

**Files:**

- Modify: `package.json` (root)

Add to `"scripts"`:

```json
"build": "cd dashboard && npm install && npm run build"
```

This lets users run `npm run build` from the repo root to (re)build the dashboard.

---

## Task 16: Build dashboard and smoke test

**Step 1: Build**

```bash
cd /path/to/geminitro/dashboard && npm run build
```

Expected: `../public/` created with `index.html` + assets.

**Step 2: Start server and verify dashboard loads**

```bash
node bin/geminitro.js start --no-interactive --no-splash
curl -s http://localhost:7536/dashboard | head -5
# Expected: <!doctype html>...
```

**Step 3: Verify SPA routing**

```bash
curl -s http://localhost:7536/dashboard/keys | head -5
# Expected: same index.html (SPA fallback)
```

**Step 4: Verify Socket.IO still works**

```bash
curl -s http://localhost:7536/socket.io/?EIO=4&transport=polling | head -1
# Expected: starts with 0{"sid":...
```

**Step 5: Manual browser check**

Open http://localhost:7536/dashboard — should see layout, sidebar, Overview page.

---

## Task 17: Update `.gitignore`

**Files:**

- Modify: `.gitignore`

Add:

```
public/
dashboard/node_modules/
dashboard/dist/
```

---

## Task 18: Update AGENTS.md

**Files:**

- Modify: `AGENTS.md`

Update the "Current State" checkboxes and Architecture section to reflect:

- Dashboard is implemented
- `geminitro start` has smart first-run flow
- `public/` is the build output (not committed)
- `dashboard/` is the source (committed)

---

## Post-Build Verification Checklist

- [ ] `npm run build` exits 0 from repo root
- [ ] `public/index.html` exists
- [ ] Dashboard loads at http://localhost:7536/dashboard
- [ ] `/dashboard/keys` route returns `index.html` (SPA fallback)
- [ ] Socket.IO connects (green "Live" indicator in sidebar)
- [ ] `geminitro start` with no config → prompts for install + key setup
- [ ] `geminitro start` with config + keys → prompts browser or terminal
- [ ] `geminitro start --no-interactive` → starts immediately, no prompts
- [ ] Key add via dashboard → appears in key pool
- [ ] Key remove via dashboard → removed from pool
- [ ] Logs stream in real-time on Logs page
- [ ] Dark mode toggle works, persists on reload
