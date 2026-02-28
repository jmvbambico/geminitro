interface UsageProgressBarProps {
  current: number;
  limit?: number;
  alertThreshold?: number;
  className?: string;
}

export function UsageProgressBar({
  current,
  limit,
  alertThreshold = 80,
  className = "",
}: UsageProgressBarProps) {
  if (!limit) {
    // No cap set - show minimal bar
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex-1 h-2 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
        </div>
        <span className="text-sm text-muted-foreground">{current} req</span>
      </div>
    );
  }

  const percentage = (current / limit) * 100;
  const atWarning = percentage >= alertThreshold;
  const atCap = current >= limit;

  // Color based on status
  let barColor = "bg-primary";
  let textColor = "text-muted-foreground";

  if (atCap) {
    barColor = "bg-destructive";
    textColor = "text-destructive";
  } else if (atWarning) {
    barColor = "bg-yellow-500";
    textColor = "text-yellow-600";
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 rounded-full bg-muted relative overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {/* Warning threshold indicator */}
        {!atWarning && alertThreshold < 100 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-yellow-500/30"
            style={{ left: `${alertThreshold}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-medium ${textColor}`}>
        {current} / {limit}
      </span>
      <span className={`text-xs ${textColor}`}>({percentage.toFixed(0)}%)</span>
      {atCap && <span className="text-xs text-destructive font-semibold">⚠️ AT CAP</span>}
      {atWarning && !atCap && (
        <span className="text-xs text-yellow-600 font-semibold">⚡ {alertThreshold}% WARNING</span>
      )}
    </div>
  );
}
