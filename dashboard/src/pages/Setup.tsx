import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useDarkMode } from "@/hooks/useDarkMode";
import { CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

type Stage =
  | "idle"
  | "select-type"
  | "validating"
  | "select"
  | "scope"
  | "options"
  | "installing"
  | "success"
  | "error";

type Agent = { id: string; name: string };

export function Setup() {
  useDarkMode();
  const [key, setKey] = useState("");
  const [stage, setStage] = useState<Stage>("idle");

  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [scope, setScope] = useState<"global" | "local">("global");
  const [autoStart, setAutoStart] = useState<"none" | "launchd" | "systemd">("none");
  // Agents already set in useEffect
  const [autoUpdate, setAutoUpdate] = useState<boolean>(true);
  const [setupPref, setSetupPref] = useState<"browser" | "terminal" | null>(null);

  const startOAuth = async (provider: "antigravity" | "gemini_cli") => {
    setStage("validating");
    setMessage(`Starting ${provider === "antigravity" ? "Antigravity" : "Gemini CLI"} OAuth...`);

    try {
      const res = await api.post(`/api/keys/oauth/${provider}`, {});
      if (res.error) {
        setStage("error");
        setMessage(res.error);
        return;
      }

      if (!res.authUrl) {
        setStage("error");
        setMessage("Invalid response from server - no auth URL received.");
        return;
      }

      // Store OAuth state in localStorage before navigating away
      localStorage.setItem(
        "geminitro_oauth_pending",
        JSON.stringify({
          provider,
          returnTo: "setup",
          timestamp: Date.now(),
        }),
      );

      // Navigate to OAuth URL in same window (popup blockers won't interfere)
      window.location.href = res.authUrl;
    } catch (err) {
      setStage("error");
      setMessage(`Could not reach server: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const handleImport = async () => {
    setStage("validating");
    setMessage("Importing existing accounts...");
    try {
      const res = await api.post("/api/keys/import-antigravity", {});
      if (res.error) {
        setStage("error");
        setMessage(res.error);
      } else if (res.imported > 0) {
        setMessage(`${res.imported} account(s) imported!`);
        setStage("select");
        setModels(res.models ?? []);
      } else {
        setStage("error");
        setMessage("No accounts found in OpenCode config.");
      }
    } catch {
      setStage("error");
      setMessage("Could not reach server.");
    }
  };

  useEffect(() => {
    // Parse query params for hints
    const urlParams = new URLSearchParams(window.location.search);
    const skipKey = urlParams.get("skip_key") === "true";

    // Fetch setup state
    api
      .get("/api/setup-state")
      .then((setupState) => {
        setAgents(setupState.agents || []);
        setSelectedAgents((setupState.agents || []).map((a: Agent) => a.id));

        // Determine initial stage based on state
        if (setupState.hasKeys || skipKey) {
          // Keys exist or skip hint → go to agent selection
          setModels(setupState.models || []);
          setStage("select");
        } else {
          // No keys → show key entry
          setStage("idle");
        }
      })
      .catch(() => {
        // Server not reachable, default to key entry
        setStage("idle");
      });

    // Check if returning from OAuth
    const checkOAuthReturn = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const oauthParam = urlParams.get("oauth");

      if (oauthParam === "success") {
        // Clear URL parameter
        window.history.replaceState({}, "", "/dashboard/setup");

        // Check localStorage for OAuth success data
        const successData = localStorage.getItem("geminitro_oauth_success");
        if (successData) {
          try {
            const data = JSON.parse(successData);
            localStorage.removeItem("geminitro_oauth_success");
            localStorage.removeItem("geminitro_oauth_pending");

            setMessage(`Authentication successful! Welcome, ${data.email}`);

            // Fetch models
            try {
              const modelsRes = await api.get("/v1/models");
              const modelList = modelsRes?.data?.map((m: any) => m.id) || [];
              setModels(modelList);
            } catch {
              setModels([]);
            }

            setStage("select");
          } catch (e) {
            console.error("[OAuth] Error processing success:", e);
            setStage("error");
            setMessage("Authentication succeeded but failed to process the result.");
          }
        } else {
          setStage("error");
          setMessage("Authentication data not found. Please try again.");
        }
      }
    };

    checkOAuthReturn();
  }, []);

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
        setStage("select");
        setModels(res.models ?? []);
      }
    } catch {
      setStage("error");
      setMessage("Could not reach server. Make sure geminitro is running.");
    }
  };

  const handleInstall = async () => {
    if (selectedAgents.length === 0) {
      setStage("options");
      return;
    }
    if (selectedAgents.includes("opencode")) {
      setStage("scope");
    } else {
      setStage("options");
    }
  };

  const handleScope = () => {
    setStage("options");
  };

  const handleOptions = async () => {
    setStage("installing");
    try {
      // Install to agents
      const res = await api.post("/api/agents/install", {
        agents: selectedAgents,
        scope,
        autoStart,
        autoUpdate,
      });

      if (!res.success) {
        setStage("error");
        setMessage("Failed to install to agents");
        return;
      }

      // Save setup preference
      await api.post("/api/preferences", { setupMethod: setupPref });

      setStage("success");
    } catch {
      setStage("error");
      setMessage("Could not reach server");
    }
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  };

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

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

        {(stage === "idle" || stage === "validating" || stage === "error") && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              {/* Method 1: API Key */}
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <img src="/aistudio.webp" alt="AI Studio" className="w-5 h-5 object-contain" />
                  </div>
                  <div>
                    <h3 className="font-medium">Google AI Studio</h3>
                    <p className="text-xs text-muted-foreground">Free & Fast API Keys</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={stage === "validating" || !key.trim()}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                  >
                    {stage === "validating" ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
              </div>

              {/* Method 2: Antigravity OAuth */}
              <button
                onClick={() => startOAuth("antigravity")}
                disabled={stage === "validating"}
                className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <img
                    src="/antigravity.webp"
                    alt="Antigravity"
                    className="w-6 h-6 object-contain rounded-full"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">Antigravity Account</h3>
                  <p className="text-xs text-muted-foreground">Sign in with Google via OAuth</p>
                </div>
                <div className="text-primary opacity-0 group-hover:opacity-100">→</div>
              </button>

              {/* Method 3: Gemini CLI OAuth */}
              <button
                onClick={() => startOAuth("gemini_cli")}
                disabled={stage === "validating"}
                className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <img src="/gemini.webp" alt="Gemini CLI" className="w-6 h-6 object-contain" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">Gemini CLI Account</h3>
                  <p className="text-xs text-muted-foreground">Use existing CLI credentials</p>
                </div>
              </button>

              {/* Method 4: Import */}
              <button
                onClick={handleImport}
                disabled={stage === "validating"}
                className="flex items-center gap-4 p-5 rounded-xl border border-border bg-card text-left transition-all hover:border-primary hover:shadow-md disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">Local Import</h3>
                  <p className="text-xs text-muted-foreground">Quickly import from OpenCode logs</p>
                </div>
              </button>
            </div>

            {stage === "validating" && (
              <div className="flex flex-col items-center gap-2 p-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm font-medium">{message}</p>
              </div>
            )}

            {stage === "error" && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                {message}
              </div>
            )}
          </div>
        )}

        {stage === "select" && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="text-center mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold">Key added successfully!</h2>
              <p className="text-sm text-muted-foreground">{models.length} models available</p>
            </div>
            <div className="border-t border-border pt-4">
              <h3 className="text-sm font-medium mb-3">Register with coding agents</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Select which coding agents to configure:
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {agents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgents.includes(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                      className="w-4 h-4 rounded border-primary"
                    />
                    <span className="text-sm">{agent.name}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleInstall}
                disabled={selectedAgents.length === 0}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {selectedAgents.length === 0
                  ? "Select at least one agent"
                  : `Continue with ${selectedAgents.length} agent${selectedAgents.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {stage === "scope" && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-medium mb-3">Where should GemiNitro be registered?</h3>
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "global"}
                  onChange={() => setScope("global")}
                  className="w-4 h-4"
                />
                <div className="text-sm">
                  <div className="font-medium">Global</div>
                  <div className="text-muted-foreground">
                    All projects (~/.config/opencode/opencode.json)
                  </div>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "local"}
                  onChange={() => setScope("local")}
                  className="w-4 h-4"
                />
                <div className="text-sm">
                  <div className="font-medium">Local</div>
                  <div className="text-muted-foreground">This project only (./opencode.json)</div>
                </div>
              </label>
            </div>
            <button
              onClick={handleScope}
              className="w-full mt-4 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Continue
            </button>
          </div>
        )}

        {stage === "options" && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="text-sm font-medium mb-3">Auto-start GemiNitro on login?</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="autoStart"
                  checked={autoStart === "none"}
                  onChange={() => setAutoStart("none")}
                  className="w-4 h-4"
                />
                <span className="text-sm">No — I will run manually</span>
              </label>
              {isMac && (
                <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                  <input
                    type="radio"
                    name="autoStart"
                    checked={autoStart === "launchd"}
                    onChange={() => setAutoStart("launchd")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">macOS — launchd service</span>
                </label>
              )}
              {!isMac && (
                <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                  <input
                    type="radio"
                    name="autoStart"
                    checked={autoStart === "systemd"}
                    onChange={() => setAutoStart("systemd")}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Linux — systemd user service</span>
                </label>
              )}
            </div>

            <h3 className="text-sm font-medium mb-3">Enable auto-update?</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="autoUpdate"
                  checked={autoUpdate === true}
                  onChange={() => setAutoUpdate(true)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Yes — update automatically on startup</span>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="autoUpdate"
                  checked={autoUpdate === false}
                  onChange={() => setAutoUpdate(false)}
                  className="w-4 h-4"
                />
                <span className="text-sm">No — I will run manually</span>
              </label>
            </div>

            <h3 className="text-sm font-medium mb-3">Interface preference</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Choose your preferred interface for{" "}
              <code className="bg-muted px-1 rounded">geminitro start</code>
            </p>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="setupPref"
                  checked={setupPref === "browser"}
                  onChange={() => setSetupPref("browser")}
                  className="w-4 h-4"
                />
                <div className="text-sm">
                  <div className="font-medium">Always use browser</div>
                  <div className="text-muted-foreground text-xs">
                    Open dashboard automatically when running geminitro
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="setupPref"
                  checked={setupPref === "terminal"}
                  onChange={() => setSetupPref("terminal")}
                  className="w-4 h-4"
                />
                <div className="text-sm">
                  <div className="font-medium">Always use terminal</div>
                  <div className="text-muted-foreground text-xs">
                    Use interactive CLI when running geminitro
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-input bg-background cursor-pointer hover:border-primary">
                <input
                  type="radio"
                  name="setupPref"
                  checked={setupPref === null}
                  onChange={() => setSetupPref(null)}
                  className="w-4 h-4"
                />
                <div className="text-sm">
                  <div className="font-medium">Ask me each time</div>
                  <div className="text-muted-foreground text-xs">
                    Choose browser or terminal each time (default)
                  </div>
                </div>
              </label>
            </div>
            <button
              onClick={handleOptions}
              className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              Install & Finish
            </button>
          </div>
        )}

        {stage === "installing" && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Installing...</span>
            </div>
          </div>
        )}

        {stage === "success" && (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Setup complete!</h2>
            <p className="text-sm text-muted-foreground">
              GemiNitro registered to {selectedAgents.length} agent
              {selectedAgents.length > 1 ? "s" : ""}.
              {autoStart !== "none" && " Auto-start enabled."}
              {autoUpdate && " Auto-update enabled."}
            </p>
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
