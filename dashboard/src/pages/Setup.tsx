import { useState } from "react";
import { api } from "@/lib/api";
import { useDarkMode } from "@/hooks/useDarkMode";
import { CheckCircle2, RefreshCw } from "lucide-react";

type Stage = "idle" | "validating" | "success" | "error";

export function Setup() {
  useDarkMode();
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
