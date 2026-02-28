import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import {
  Sun,
  Moon,
  Wifi,
  WifiOff,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  X,
  Palette,
} from "lucide-react";
import { useDarkMode } from "@/hooks/useDarkMode";
import { useHealth } from "@/hooks/useHealth";
import { api } from "@/lib/api";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function AddKeyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

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
        setAddSuccess(`Added. ${res.models?.length ?? 0} models available.`);
        setNewKey("");
        setTimeout(onClose, 1500);
      }
    } catch {
      setAddError("Request failed — is the server running?");
    }
    setAdding(false);
  };

  const startOAuth = async (provider: "antigravity" | "gemini_cli") => {
    setAdding(true);
    setAddError("");
    setAddSuccess("");

    try {
      const res = await api.post(`/api/keys/oauth/${provider}`, {});
      if (res.error) {
        setAddError(res.error);
        setAdding(false);
        return;
      }

      if (!res.authUrl) {
        setAddError("Invalid response from server.");
        setAdding(false);
        return;
      }

      // Store OAuth state before navigating
      localStorage.setItem(
        "geminitro_oauth_pending",
        JSON.stringify({
          provider,
          returnTo: "overview",
          timestamp: Date.now(),
        }),
      );

      // Navigate to OAuth in same window
      window.location.href = res.authUrl;
    } catch {
      setAddError("Request failed.");
      setAdding(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add API Key">
      <div className="space-y-4">
        {/* Method 1: API Key */}
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <img src="/aistudio.webp" alt="AI Studio" className="w-5 h-5 object-contain" />
            </div>
            <div>
              <h3 className="text-sm font-medium">Google AI Studio</h3>
              <p className="text-xs text-muted-foreground">Free & Fast API Keys</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                placeholder="AIzaSy..."
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="w-full pr-9 pl-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !newKey.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Add"}
            </button>
          </div>
        </div>

        {/* Method 2: Antigravity OAuth */}
        <button
          onClick={() => startOAuth("antigravity")}
          disabled={adding}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/30 text-left transition-all hover:border-primary hover:shadow-sm disabled:opacity-50"
        >
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 flex items-center justify-center">
            <img
              src="/antigravity.webp"
              alt="Antigravity"
              className="w-5 h-5 object-contain rounded-full"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium">Antigravity Account</h3>
            <p className="text-xs text-muted-foreground">Sign in with Google via OAuth</p>
          </div>
        </button>

        {/* Method 3: Gemini CLI OAuth */}
        <button
          onClick={() => startOAuth("gemini_cli")}
          disabled={adding}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-muted/30 text-left transition-all hover:border-primary hover:shadow-sm disabled:opacity-50"
        >
          <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
            <img src="/gemini.webp" alt="Gemini CLI" className="w-5 h-5 object-contain" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium">Gemini CLI Account</h3>
            <p className="text-xs text-muted-foreground">Use existing CLI credentials</p>
          </div>
        </button>

        {addError && <p className="text-xs text-destructive text-center">{addError}</p>}
        {addSuccess && <p className="text-xs text-green-500 text-center">{addSuccess}</p>}
      </div>
    </Modal>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { health } = useHealth();
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("geminitro_api_key") ?? "geminitro",
  );
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState<boolean | null>(null);
  const [resetTime, setResetTime] = useState("00:00");
  const [timezone, setTimezone] = useState("local");
  const [capsSaving, setCapsSaving] = useState(false);
  const [setupPreference, setSetupPreference] = useState<"browser" | "terminal" | null>(null);
  const [autoUpdateSaving, setAutoUpdateSaving] = useState(false);

  useEffect(() => {
    api
      .get("/api/settings")
      .then((data: any) => {
        if (typeof data?.autoUpdate === "boolean") setAutoUpdate(data.autoUpdate);
      })
      .catch(() => {});
    api.get("/api/preferences").then((data) => {
      setSetupPreference(data.setupMethod || null);
    });
    api.get("/api/stats/caps").then((data) => {
      if (data.resetTime) setResetTime(data.resetTime);
      if (data.timezone) setTimezone(data.timezone);
    });
  }, []);

  const saveKey = () => {
    localStorage.setItem("geminitro_api_key", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleAutoUpdate = async () => {
    if (autoUpdate === null) return;
    const next = !autoUpdate;
    setAutoUpdateSaving(true);
    try {
      await api.post("/api/settings", { autoUpdate: next });
      setAutoUpdate(next);
    } catch {}
    setAutoUpdateSaving(false);
  };

  const handlePreferenceChange = async (value: "browser" | "terminal" | null) => {
    const res = await api.post("/api/preferences", { setupMethod: value });
    if (!res.error) {
      setSetupPreference(value);
    }
  };

  const saveCapSettings = async () => {
    setCapsSaving(true);
    try {
      await api.post("/api/stats/caps/config", { resetTime, timezone });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setCapsSaving(false);
  };

  return (
    <Modal open onClose={onClose} title="Settings">
      <div className="space-y-5">
        {health && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Status", value: health.status },
              { label: "Version", value: `v${health.version}` },
              { label: "Port", value: "7536" },
              { label: "Uptime", value: `${health.uptime}s` },
              { label: "Models", value: String(health.models) },
              { label: "Keys", value: String(health.keys.total) },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                <div className="text-sm font-medium font-mono">{value}</div>
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Proxy API Key
          </label>
          <p className="text-xs text-muted-foreground">
            Stored in localStorage. Sent as Bearer token on all API calls.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pr-9 pl-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => setShowApiKey((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={saveKey}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium shrink-0"
            >
              {saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </div>
        {autoUpdate !== null && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
            <div>
              <div className="text-sm font-medium">Auto Update</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Check and apply updates automatically on startup
              </div>
            </div>
            <button
              onClick={toggleAutoUpdate}
              disabled={autoUpdateSaving}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${autoUpdate ? "bg-primary" : "bg-muted"}`}
              role="switch"
              aria-checked={autoUpdate}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${autoUpdate ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          </div>
        )}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Interface Preference
          </label>
          <p className="text-xs text-muted-foreground">
            Choose your preferred interface when running{" "}
            <code className="bg-muted px-1 rounded">geminitro start</code>
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-input bg-background cursor-pointer hover:border-primary transition-colors">
              <input
                type="radio"
                name="setupPreference"
                checked={setupPreference === "browser"}
                onChange={() => handlePreferenceChange("browser")}
                className="w-3.5 h-3.5"
              />
              <div className="flex-1">
                <div className="font-medium text-xs">Browser (Recommended)</div>
                <div className="text-xs text-muted-foreground">
                  Always open dashboard automatically
                </div>
              </div>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-input bg-background cursor-pointer hover:border-primary transition-colors">
              <input
                type="radio"
                name="setupPreference"
                checked={setupPreference === "terminal"}
                onChange={() => handlePreferenceChange("terminal")}
                className="w-3.5 h-3.5"
              />
              <div className="flex-1">
                <div className="font-medium text-xs">Terminal</div>
                <div className="text-xs text-muted-foreground">Always use interactive CLI</div>
              </div>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-input bg-background cursor-pointer hover:border-primary transition-colors">
              <input
                type="radio"
                name="setupPreference"
                checked={setupPreference === null}
                onChange={() => handlePreferenceChange(null)}
                className="w-3.5 h-3.5"
              />
              <div className="flex-1">
                <div className="font-medium text-xs">Ask Every Time</div>
                <div className="text-xs text-muted-foreground">
                  Choose browser or terminal each time (default)
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Usage Cap Settings */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Usage Cap Reset Schedule
          </label>
          <p className="text-xs text-muted-foreground">
            Configure when daily usage caps should reset (applies to all models)
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Reset Time
              </label>
              <input
                type="time"
                value={resetTime}
                onChange={(e) => setResetTime(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Timezone
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="local">Local Time (System)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                <option value="America/Denver">America/Denver (MST/MDT)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                <option value="Asia/Shanghai">Asia/Shanghai (CST)</option>
                <option value="Asia/Saigon">Asia/Saigon (ICT)</option>
                <option value="Australia/Sydney">Australia/Sydney (AEDT/AEST)</option>
              </select>
            </div>
            <button
              onClick={saveCapSettings}
              disabled={capsSaving}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {capsSaving ? "Saving..." : saved ? "Saved ✓" : "Save Cap Settings"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ThemeModal({ onClose }: { onClose: () => void }) {
  const [css, setCss] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!css.trim()) return;
    setSaving(true);
    try {
      await api.post("/api/theme", { css });
      window.location.reload();
    } catch {
      alert("Failed to apply theme");
    }
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title="Custom CSS Theme">
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Paste a full CSS theme here (e.g. from tweakcn). This will permanently overwrite{" "}
          <code className="bg-muted px-1 rounded">index.css</code> and trigger a server rebuild. The
          page will reload when finished.
        </p>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          placeholder="@import 'tailwindcss';\n\n@layer base {\n  :root {\n    --background: oklch(1 0 0);\n..."
          className="w-full h-64 p-3 rounded-lg border border-input bg-background/50 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-none whitespace-pre"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !css.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {saving ? "Applying..." : "Apply Theme"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Layout({ connected }: { connected: boolean }) {
  const { dark, toggle } = useDarkMode();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 h-14 border-b border-border/50 bg-background/80 backdrop-blur-md flex items-center justify-between px-8 shadow-sm">
        <div className="flex items-center gap-0">
          <img src="/dashboard/logo.webp" alt="Logo" className="w-6 h-6 object-contain rounded" />
          <span className="font-bold text-base tracking-tight">GemiNitro</span>
        </div>
        <div className="flex items-center gap-0">
          <div className="flex items-center gap-1.5 mr-2 px-2 py-1 flex-shrink-0 rounded-md bg-muted/60 border border-border/50 shadow-sm backdrop-blur-sm">
            {connected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium text-muted-foreground mr-0.5">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium text-muted-foreground mr-0.5">Offline</span>
              </>
            )}
          </div>
          <button
            onClick={() => setThemeOpen(true)}
            title="Theme"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Palette className="w-4 h-4" />
          </button>
          <button
            onClick={toggle}
            title={dark ? "Light mode" : "Dark mode"}
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {themeOpen && <ThemeModal onClose={() => setThemeOpen(false)} />}
    </div>
  );
}
