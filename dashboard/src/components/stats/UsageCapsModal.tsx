import { useState, useEffect } from "react";
import { X, Plus, Trash2, Save, AlertCircle } from "lucide-react";
import { useUsageCaps, type UsageCap } from "@/hooks/useUsageCaps";

interface UsageCapsModalProps {
  open: boolean;
  onClose: () => void;
  initialModel?: string;
}

export function UsageCapsModal({ open, onClose, initialModel }: UsageCapsModalProps) {
  const { caps, loading, addCap, updateCap, removeCap } = useUsageCaps();
  const [editingCap, setEditingCap] = useState<Partial<UsageCap> | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (open && initialModel && !editingCap) {
      // Pre-populate form with model if provided
      const existingCap = caps.find((c) => c.model === initialModel);
      if (existingCap) {
        setEditingCap(existingCap);
      } else {
        setEditingCap({
          model: initialModel,
          limit: 1000,
          period: "daily",
          alertThreshold: 80,
          action: "try_next",
          enabled: true,
        });
      }
    }
  }, [open, initialModel, caps, editingCap]);

  const handleSave = async () => {
    if (!editingCap?.model || !editingCap.limit) {
      setError("Model name and limit are required");
      return;
    }

    setError("");
    setSuccess("");

    try {
      if (caps.find((c) => c.model === editingCap.model)) {
        // Update existing cap
        await updateCap({
          model: editingCap.model,
          limit: editingCap.limit,
          period: editingCap.period || "daily",
          alertThreshold: editingCap.alertThreshold || 80,
          action: editingCap.action || "try_next",
          enabled: editingCap.enabled ?? true,
          lastReset: caps.find((c) => c.model === editingCap.model)?.lastReset,
        });
      } else {
        // Add new cap
        await addCap({
          model: editingCap.model,
          limit: editingCap.limit,
          period: editingCap.period || "daily",
          alertThreshold: editingCap.alertThreshold || 80,
          action: editingCap.action || "try_next",
          enabled: editingCap.enabled ?? true,
        });
      }
      setSuccess("Cap saved successfully");
      setEditingCap(null);
      setTimeout(() => setSuccess(""), 2000);
    } catch {
      setError("Failed to save cap");
    }
  };

  const handleRemove = async (model: string) => {
    setError("");
    setSuccess("");

    try {
      await removeCap(model);
      setSuccess("Cap removed successfully");
      if (editingCap?.model === model) {
        setEditingCap(null);
      }
      setTimeout(() => setSuccess(""), 2000);
    } catch {
      setError("Failed to remove cap");
    }
  };

  const handleEditCap = (cap: UsageCap) => {
    setEditingCap(cap);
    setError("");
    setSuccess("");
  };

  const handleNewCap = () => {
    setEditingCap({
      model: "",
      limit: 1000,
      period: "daily",
      alertThreshold: 80,
      action: "try_next",
      enabled: true,
    });
    setError("");
    setSuccess("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="font-semibold text-base">Manage Usage Caps</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left: Existing Caps */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground">Existing Caps</h3>
                <button
                  onClick={handleNewCap}
                  className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Cap
                </button>
              </div>

              {loading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : caps.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No caps configured. Click "New Cap" to add one.
                </div>
              ) : (
                <div className="space-y-2">
                  {caps.map((cap) => (
                    <div
                      key={cap.model}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        editingCap?.model === cap.model
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-muted/50"
                      }`}
                      onClick={() => handleEditCap(cap)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{cap.model}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {cap.limit.toLocaleString()} / {cap.period}
                            {!cap.enabled && " (disabled)"}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(cap.model);
                          }}
                          className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Edit Form */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">
                {editingCap ? (editingCap.model ? "Edit Cap" : "New Cap") : "Select a cap to edit"}
              </h3>

              {editingCap ? (
                <div className="space-y-4">
                  {/* Model */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Model Name
                    </label>
                    <input
                      type="text"
                      value={editingCap.model || ""}
                      onChange={(e) => setEditingCap({ ...editingCap, model: e.target.value })}
                      placeholder="e.g., gemini-2.0-flash"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {/* Limit */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Limit
                    </label>
                    <input
                      type="number"
                      value={editingCap.limit || ""}
                      onChange={(e) =>
                        setEditingCap({ ...editingCap, limit: parseInt(e.target.value) || 0 })
                      }
                      min="1"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {/* Period */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Period
                    </label>
                    <select
                      value={editingCap.period || "daily"}
                      onChange={(e) =>
                        setEditingCap({
                          ...editingCap,
                          period: e.target.value as "daily" | "hourly" | "weekly",
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="hourly">Hourly</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  {/* Alert Threshold */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Alert Threshold (%)
                    </label>
                    <input
                      type="number"
                      value={editingCap.alertThreshold || 80}
                      onChange={(e) =>
                        setEditingCap({
                          ...editingCap,
                          alertThreshold: parseInt(e.target.value) || 80,
                        })
                      }
                      min="1"
                      max="100"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {/* Action */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Action when cap reached
                    </label>
                    <select
                      value={editingCap.action || "try_next"}
                      onChange={(e) =>
                        setEditingCap({
                          ...editingCap,
                          action: e.target.value as "try_next" | "warn_only",
                        })
                      }
                      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="try_next">Try next key</option>
                      <option value="warn_only">Warn only (don't block)</option>
                    </select>
                  </div>

                  {/* Enabled */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={editingCap.enabled ?? true}
                      onChange={(e) => setEditingCap({ ...editingCap, enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                    />
                    <label htmlFor="enabled" className="text-sm text-foreground">
                      Enable this cap
                    </label>
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={handleSave}
                    className="w-full px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save Cap
                  </button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Select an existing cap from the left, or click "New Cap" to create one.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
