import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ClientMessage,
  ServerMessage,
  ChatSendPayload,
  ChatDeltaPayload,
  ChatErrorPayload,
} from "@toshik-babe/shared";
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

let requestIdCounter = 0;
function nextRequestId(): string {
  requestIdCounter += 1;
  return `req-${requestIdCounter}-${Date.now()}`;
}

export function App(): React.JSX.Element {
  const [backendPort, setBackendPort] = useState<number | null>(IS_TAURI ? null : 3001);
  const [startError, setStartError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Track the assistant message ID currently being streamed into.
  const streamingMsgIdRef = useRef<string | null>(null);

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

  // Handle incoming server messages (chat.delta, chat.done, chat.error, legacy).
  useEffect(() => {
    if (!lastMessage) return;
    const serverMsg = lastMessage as ServerMessage;

    switch (serverMsg.type) {
      case "chat.delta": {
        const delta = serverMsg.payload as ChatDeltaPayload;
        const currentStreamId = streamingMsgIdRef.current;

        if (currentStreamId) {
          // Append delta text to the existing streaming/placeholder message.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentStreamId ? { ...m, content: m.content + delta.text } : m,
            ),
          );
        }
        // If no streamingMsgIdRef (edge case), ignore stale deltas.
        break;
      }

      case "chat.done": {
        // Mark the streaming message as complete.
        const doneId = streamingMsgIdRef.current;
        if (doneId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === doneId ? { ...m, isStreaming: false } : m)),
          );
        }
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        break;
      }

      case "chat.error": {
        const errPayload = serverMsg.payload as ChatErrorPayload;
        // If we were streaming, mark it done and append error.
        const errStreamId = streamingMsgIdRef.current;
        if (errStreamId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === errStreamId ? { ...m, isStreaming: false } : m)),
          );
        }
        streamingMsgIdRef.current = null;
        setIsStreaming(false);

        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            content: `⚠️ Error: ${errPayload.error}`,
            timestamp: serverMsg.timestamp ?? new Date().toISOString(),
          },
        ]);
        break;
      }

      default: {
        // Legacy: pong, echo, error
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
      }
    }
  }, [lastMessage]);

  const handleSend = useCallback(
    (text: string) => {
      // Create a placeholder assistant message to show "Thinking…" immediately.
      const assistantId = nextId();
      streamingMsgIdRef.current = assistantId;
      setIsStreaming(true);

      setMessages((prev) => [
        ...prev,
        // User message
        {
          id: nextId(),
          role: "user" as const,
          content: text,
          timestamp: new Date().toISOString(),
        },
        // Placeholder assistant message (empty content, isStreaming=true shows "Thinking…")
        {
          id: assistantId,
          role: "assistant" as const,
          content: "",
          timestamp: new Date().toISOString(),
          isStreaming: true,
        },
      ]);

      const requestId = nextRequestId();
      const msg: ClientMessage = {
        type: "chat.send",
        payload: { text, requestId } satisfies ChatSendPayload,
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
        <p className="text-destructive mt-2">Failed to start backend: {startError}</p>
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

      {/* Input — disabled while streaming or disconnected */}
      <ChatInput onSend={handleSend} disabled={state !== "open" || isStreaming} />
    </div>
  );
}

/** Format server message payload into readable text for the chat bubble (legacy types). */
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
