import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useDarkMode } from "@/hooks/useDarkMode";
import { CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

type Stage =
  | "idle"
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
  const [autoUpdate, setAutoUpdate] = useState<boolean>(true);

  useEffect(() => {
    api.get("/api/agents").then((data: Agent[]) => {
      setAgents(data);
      setSelectedAgents(data.map((a) => a.id));
    });
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
      const res = await api.post("/api/agents/install", {
        agents: selectedAgents,
        scope,
        autoStart,
        autoUpdate,
      });
      if (res.success) {
        setStage("success");
      } else {
        setStage("error");
        setMessage("Failed to install to agents");
      }
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
