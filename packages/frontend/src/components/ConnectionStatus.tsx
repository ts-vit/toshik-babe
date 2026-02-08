import React from "react";
import type { ConnectionState } from "../hooks/useWebSocket";

interface ConnectionStatusProps {
  state: ConnectionState;
  onReconnect?: () => void;
}

const STATE_CONFIG: Record<
  ConnectionState,
  { color: string; label: string }
> = {
  connecting: { color: "#f59e0b", label: "Connecting..." },
  open: { color: "#22c55e", label: "Connected" },
  closed: { color: "#ef4444", label: "Disconnected" },
  error: { color: "#ef4444", label: "Error" },
};

export function ConnectionStatus({
  state,
  onReconnect,
}: ConnectionStatusProps): React.JSX.Element {
  const { color, label } = STATE_CONFIG[state];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.75rem",
        borderRadius: "9999px",
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        fontSize: "0.85rem",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: color,
          display: "inline-block",
          boxShadow: `0 0 6px ${color}`,
        }}
      />
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {(state === "closed" || state === "error") && onReconnect && (
        <button
          type="button"
          onClick={onReconnect}
          style={{
            marginLeft: "0.25rem",
            padding: "0.15rem 0.5rem",
            fontSize: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          Reconnect
        </button>
      )}
    </div>
  );
}
