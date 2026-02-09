import React from "react";
import type { ConnectionState } from "../hooks/useWebSocket";
import { cn } from "../lib/utils";
import { RefreshCw } from "lucide-react";

interface ConnectionStatusProps {
  state: ConnectionState;
  onReconnect?: () => void;
}

const STATE_CONFIG: Record<
  ConnectionState,
  { dotColor: string; label: string }
> = {
  connecting: {
    dotColor: "bg-yellow-500",
    label: "Connecting...",
  },
  open: {
    dotColor: "bg-green-500",
    label: "Connected",
  },
  closed: {
    dotColor: "bg-red-500",
    label: "Disconnected",
  },
  error: {
    dotColor: "bg-red-500",
    label: "Error",
  },
};

export function ConnectionStatus({ state, onReconnect }: ConnectionStatusProps): React.JSX.Element {
  const { dotColor, label } = STATE_CONFIG[state];

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 border border-border/50 px-3 py-1.5 text-xs">
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", dotColor)} />
      <span className="text-muted-foreground">{label}</span>
      {(state === "closed" || state === "error") && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Reconnect"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
