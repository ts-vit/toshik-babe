import React from "react";
import type { ConnectionState } from "../hooks/useWebSocket";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

interface ConnectionStatusProps {
  state: ConnectionState;
  onReconnect?: () => void;
}

const STATE_CONFIG: Record<
  ConnectionState,
  { colorClass: string; glowClass: string; label: string }
> = {
  connecting: {
    colorClass: "bg-yellow-500",
    glowClass: "shadow-[0_0_6px_theme(colors.yellow.500)]",
    label: "Connecting…",
  },
  open: {
    colorClass: "bg-green-500",
    glowClass: "shadow-[0_0_6px_theme(colors.green.500)]",
    label: "Connected",
  },
  closed: {
    colorClass: "bg-red-500",
    glowClass: "shadow-[0_0_6px_theme(colors.red.500)]",
    label: "Disconnected",
  },
  error: {
    colorClass: "bg-red-500",
    glowClass: "shadow-[0_0_6px_theme(colors.red.500)]",
    label: "Error",
  },
};

export function ConnectionStatus({
  state,
  onReconnect,
}: ConnectionStatusProps): React.JSX.Element {
  const { colorClass, glowClass, label } = STATE_CONFIG[state];

  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-secondary border border-border px-3 py-1.5 text-sm">
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          colorClass,
          glowClass,
        )}
      />
      <span className="text-muted-foreground">{label}</span>
      {(state === "closed" || state === "error") && onReconnect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReconnect}
          className="ml-1 h-6 px-2 text-xs"
        >
          Reconnect
        </Button>
      )}
    </div>
  );
}
