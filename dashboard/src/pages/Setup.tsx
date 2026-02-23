import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useDarkMode } from "@/hooks/useDarkMode";
import { CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

type Stage = "idle" | "validating" | "select" | "installing" | "success" | "error";

type Agent = { id: string; name: string };

export function Setup() {
  useDarkMode();
  const [key, setKey] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Fetch available agents on mount
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
      setStage("success");
      return;
    }
    setStage("installing");
    try {
      const res = await api.post("/api/agents/install", {
        agents: selectedAgents,
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

        {/* Key input stage */}
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

        {/* Agent selection stage */}
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
                  : `Install to ${selectedAgents.length} agent${selectedAgents.length > 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}

        {/* Installing stage */}
        {stage === "installing" && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Installing...</span>
            </div>
          </div>
        )}

        {/* Success stage */}
        {stage === "success" && (
          <div className="rounded-xl border border-border bg-card p-6 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">Setup complete!</h2>
            <p className="text-sm text-muted-foreground">
              GemiNitro has been registered to {selectedAgents.length} coding agent
              {selectedAgents.length > 1 ? "s" : ""}.
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
