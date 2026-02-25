import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useHealth } from "@/hooks/useHealth";

export function Settings() {
  const { health } = useHealth();
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("geminitro_api_key") ?? "geminitro",
  );
  const [saved, setSaved] = useState(false);
  const [setupPreference, setSetupPreference] = useState<"browser" | "terminal" | null>(null);

  useEffect(() => {
    api.get("/api/preferences").then((data) => {
      setSetupPreference(data.setupMethod || null);
    });
  }, []);

  const handlePreferenceChange = async (value: "browser" | "terminal" | null) => {
    const res = await api.post("/api/preferences", { setupMethod: value });
    if (!res.error) {
      setSetupPreference(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

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

      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-sm font-medium">Setup Flow Preference</h2>
        <p className="text-xs text-muted-foreground">
          Choose how to handle setup screens when running{" "}
          <code className="bg-muted px-1 rounded">geminitro start</code>
        </p>

        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
            <input
              type="radio"
              name="setupPreference"
              checked={setupPreference === "browser"}
              onChange={() => handlePreferenceChange("browser")}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-sm">Browser (Recommended)</div>
              <div className="text-xs text-muted-foreground">
                Always open dashboard wizard for setup tasks
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
            <input
              type="radio"
              name="setupPreference"
              checked={setupPreference === "terminal"}
              onChange={() => handlePreferenceChange("terminal")}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-sm">Terminal</div>
              <div className="text-xs text-muted-foreground">
                Use interactive CLI for setup tasks
              </div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
            <input
              type="radio"
              name="setupPreference"
              checked={setupPreference === null}
              onChange={() => handlePreferenceChange(null)}
              className="w-4 h-4"
            />
            <div>
              <div className="font-medium text-sm">Ask Every Time</div>
              <div className="text-xs text-muted-foreground">
                Choose browser or terminal each time (default)
              </div>
            </div>
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-medium mb-3">Server Info</h2>
        {health ? (
          <dl className="space-y-2 text-sm">
            {(
              [
                ["Status", health.status],
                ["Version", `v${health.version}`],
                ["Port", "7536"],
                ["Uptime", `${health.uptime}s`],
                ["Models", String(health.models)],
                ["Total keys", String(health.keys.total)],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="flex justify-between">
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
