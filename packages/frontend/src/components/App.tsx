import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClientMessage } from "@toshik-babe/shared";
import { useWebSocket } from "../hooks/useWebSocket";
import { ConnectionStatus } from "./ConnectionStatus";

/** Detect if we're running inside Tauri (desktop) or plain browser. */
const IS_TAURI = typeof (window as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined";

export function App(): React.JSX.Element {
  const [backendPort, setBackendPort] = useState<number | null>(
    IS_TAURI ? null : 3001,
  );
  const [startError, setStartError] = useState<string | null>(null);

  // In Tauri mode, call the Rust start_backend command on mount.
  useEffect(() => {
    if (!IS_TAURI) return;
    let cancelled = false;

    invoke<number>("start_backend")
      .then((port) => {
        if (!cancelled) setBackendPort(port);
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = typeof err === "string" ? err : String(err);
          // If backend is already running, the error contains the message.
          // We could try to recover, but for now surface it.
          setStartError(msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const wsUrl = backendPort ? `ws://localhost:${backendPort}/ws` : undefined;
  const { state, lastMessage, send, reconnect } = useWebSocket({ url: wsUrl });
  const [input, setInput] = useState("");

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    const msg: ClientMessage = {
      type: "echo",
      payload: { text },
      timestamp: new Date().toISOString(),
    };
    send(msg);
    setInput("");
  };

  const handlePing = () => {
    const msg: ClientMessage = {
      type: "ping",
      payload: null,
      timestamp: new Date().toISOString(),
    };
    send(msg);
  };

  // While waiting for the backend to start in Tauri mode, show a loading state.
  if (IS_TAURI && !backendPort && !startError) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1>Toshik Babe Engine</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "1rem" }}>
          Starting backend...
        </p>
      </div>
    );
  }

  if (startError) {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h1>Toshik Babe Engine</h1>
        <p style={{ color: "#ef4444", marginTop: "1rem" }}>
          Failed to start backend: {startError}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        textAlign: "center",
        padding: "2rem",
        maxWidth: 480,
        width: "100%",
      }}
    >
      <h1>Toshik Babe Engine</h1>
      <p style={{ color: "var(--text-secondary)", margin: "0.5rem 0 1.5rem" }}>
        Local-first AI assistant
      </p>

      <ConnectionStatus state={state} onReconnect={reconnect} />

      <form
        onSubmit={handleSend}
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "1.5rem",
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={state !== "open"}
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontSize: "0.9rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={state !== "open" || !input.trim()}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            border: "none",
            backgroundColor: "var(--accent)",
            color: "#fff",
            fontSize: "0.9rem",
            cursor: state === "open" && input.trim() ? "pointer" : "not-allowed",
            opacity: state === "open" && input.trim() ? 1 : 0.5,
          }}
        >
          Send
        </button>
        <button
          type="button"
          onClick={handlePing}
          disabled={state !== "open"}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            fontSize: "0.9rem",
            cursor: state === "open" ? "pointer" : "not-allowed",
            opacity: state === "open" ? 1 : 0.5,
          }}
        >
          Ping
        </button>
      </form>

      {lastMessage && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            border: "1px solid var(--border)",
            backgroundColor: "var(--bg-secondary)",
            textAlign: "left",
            fontSize: "0.85rem",
            wordBreak: "break-all",
          }}
        >
          <div style={{ color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
            Last response ({lastMessage.type}):
          </div>
          <code style={{ color: "var(--text-primary)" }}>
            {JSON.stringify(lastMessage.payload)}
          </code>
        </div>
      )}
    </div>
  );
}
