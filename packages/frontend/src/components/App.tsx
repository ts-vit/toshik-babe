import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ClientMessage, ServerMessage } from "@toshik-babe/shared";
import { useWebSocket } from "../hooks/useWebSocket";
import { ConnectionStatus } from "./ConnectionStatus";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import type { ChatMessageData } from "./ChatMessage";

/** Detect if we're running inside Tauri (desktop) or plain browser. */
const IS_TAURI =
  typeof (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !== "undefined";

let messageIdCounter = 0;
function nextId(): string {
  messageIdCounter += 1;
  return `msg-${messageIdCounter}-${Date.now()}`;
}

export function App(): React.JSX.Element {
  const [backendPort, setBackendPort] = useState<number | null>(
    IS_TAURI ? null : 3001,
  );
  const [startError, setStartError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);

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
          setStartError(msg);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const wsUrl = backendPort ? `ws://localhost:${backendPort}/ws` : undefined;
  const { state, lastMessage, send, reconnect } = useWebSocket({ url: wsUrl });

  // Append server responses to the message list.
  useEffect(() => {
    if (!lastMessage) return;
    const serverMsg = lastMessage as ServerMessage;
    const content = formatServerPayload(serverMsg);
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: "assistant",
        content,
        timestamp: serverMsg.timestamp ?? new Date().toISOString(),
      },
    ]);
  }, [lastMessage]);

  const handleSend = useCallback(
    (text: string) => {
      // Add user message to chat.
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "user",
          content: text,
          timestamp: new Date().toISOString(),
        },
      ]);

      const msg: ClientMessage = {
        type: "echo",
        payload: { text },
        timestamp: new Date().toISOString(),
      };
      send(msg);
    },
    [send],
  );

  // Loading state while waiting for backend in Tauri mode.
  if (IS_TAURI && !backendPort && !startError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full">
        <h1 className="text-2xl font-bold">Toshik Babe Engine</h1>
        <p className="text-muted-foreground mt-2">Starting backend…</p>
      </div>
    );
  }

  if (startError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full">
        <h1 className="text-2xl font-bold">Toshik Babe Engine</h1>
        <p className="text-destructive mt-2">
          Failed to start backend: {startError}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Toshik Babe Engine</h1>
          <p className="text-xs text-muted-foreground">Local-first AI assistant</p>
        </div>
        <ConnectionStatus state={state} onReconnect={reconnect} />
      </header>

      {/* Messages */}
      <MessageList messages={messages} />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={state !== "open"} />
    </div>
  );
}

/** Format server message payload into readable text for the chat bubble. */
function formatServerPayload(msg: ServerMessage): string {
  if (msg.type === "pong") return "🏓 Pong!";
  if (msg.type === "error") {
    const payload = msg.payload as Record<string, unknown> | null;
    return `⚠️ Error: ${payload?.["message"] ?? JSON.stringify(payload)}`;
  }
  // echo or unknown
  const payload = msg.payload as Record<string, unknown> | null;
  if (payload && typeof payload === "object" && "text" in payload) {
    return String(payload["text"]);
  }
  return JSON.stringify(msg.payload, null, 2);
}
