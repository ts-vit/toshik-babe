import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  ClientMessage,
  ServerMessage,
  ChatSendPayload,
  ChatDeltaPayload,
  ChatErrorPayload,
  ChatHistoryRequestPayload,
  ChatHistoryPayload,
  ChatListItem,
  ChatListPayload,
  ChatCreateResponsePayload,
  ProviderConfigPayload,
  ProviderConfigAckPayload,
  ProviderConfigId,
} from "@toshik-babe/shared";
import { useWebSocket } from "../hooks/useWebSocket";
import { ConnectionStatus } from "./ConnectionStatus";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Sidebar } from "./Sidebar";
import type { ChatMessageData } from "./ChatMessage";
import { getSecret } from "../lib/stronghold";

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

  // Sidebar state
  const [conversations, setConversations] = useState<ChatListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  // Track the assistant message ID currently being streamed into.
  const streamingMsgIdRef = useRef<string | null>(null);

  // Track whether initial data has been requested for this connection.
  const initialRequestedRef = useRef(false);

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

  // Send provider config and request conversation list when WebSocket connects.
  useEffect(() => {
    if (state === "open" && !initialRequestedRef.current) {
      initialRequestedRef.current = true;

      // Send stored API key from Stronghold to the backend (fire-and-forget).
      const DEFAULT_PROVIDER: ProviderConfigId = "gigachat";
      void (async () => {
        try {
          const apiKey = await getSecret(DEFAULT_PROVIDER);
          if (apiKey) {
            const configMsg: ClientMessage = {
              type: "provider.config",
              payload: {
                provider: DEFAULT_PROVIDER,
                apiKey,
              } satisfies ProviderConfigPayload,
              timestamp: new Date().toISOString(),
            };
            send(configMsg);
          }
        } catch (err) {
          console.error("[App] Failed to send provider config from Stronghold:", err);
        }
      })();

      setSidebarLoading(true);
      const listReq: ClientMessage = {
        type: "chat.list",
        payload: {},
        timestamp: new Date().toISOString(),
      };
      send(listReq);
    }
    if (state === "closed" || state === "error") {
      initialRequestedRef.current = false;
    }
  }, [state, send]);

  /** Request history for a specific conversation. */
  const requestHistory = useCallback(
    (conversationId: string) => {
      const historyReq: ClientMessage = {
        type: "chat.history",
        payload: {
          conversationId,
        } satisfies ChatHistoryRequestPayload,
        timestamp: new Date().toISOString(),
      };
      send(historyReq);
    },
    [send],
  );

  /** Switch to a different conversation. */
  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId) return;
      // Clear current messages and streaming state.
      setMessages([]);
      streamingMsgIdRef.current = null;
      setIsStreaming(false);
      setActiveConversationId(conversationId);
      requestHistory(conversationId);
    },
    [activeConversationId, requestHistory],
  );

  /** Create a new conversation via the backend. */
  const handleNewChat = useCallback(() => {
    const createReq: ClientMessage = {
      type: "chat.create",
      payload: { title: "New Chat" },
      timestamp: new Date().toISOString(),
    };
    send(createReq);
  }, [send]);

  // Handle incoming server messages.
  useEffect(() => {
    if (!lastMessage) return;
    const serverMsg = lastMessage as ServerMessage;

    switch (serverMsg.type) {
      case "chat.list": {
        const listPayload = serverMsg.payload as ChatListPayload;
        setConversations(listPayload.conversations);
        setSidebarLoading(false);

        // Auto-select the first conversation if none is active.
        if (!activeConversationId && listPayload.conversations.length > 0) {
          const first = listPayload.conversations[0]!;
          setActiveConversationId(first.id);
          requestHistory(first.id);
        }
        break;
      }

      case "chat.create": {
        const createPayload = serverMsg.payload as ChatCreateResponsePayload;
        const newItem: ChatListItem = {
          id: createPayload.id,
          title: createPayload.title,
          createdAt: serverMsg.timestamp,
          updatedAt: serverMsg.timestamp,
        };
        // Prepend the new conversation to the list and switch to it.
        setConversations((prev) => [newItem, ...prev]);
        setMessages([]);
        streamingMsgIdRef.current = null;
        setIsStreaming(false);
        setActiveConversationId(createPayload.id);
        break;
      }

      case "chat.history": {
        const historyPayload = serverMsg.payload as ChatHistoryPayload;
        // Only apply if this is for the currently active conversation.
        if (historyPayload.conversationId === activeConversationId) {
          const loaded: ChatMessageData[] = historyPayload.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }));
          setMessages(loaded);
        }
        break;
      }

      case "chat.delta": {
        const delta = serverMsg.payload as ChatDeltaPayload;
        const currentStreamId = streamingMsgIdRef.current;

        if (currentStreamId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentStreamId ? { ...m, content: m.content + delta.text } : m,
            ),
          );
        }
        break;
      }

      case "chat.done": {
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
            content: `Error: ${errPayload.error}`,
            timestamp: serverMsg.timestamp ?? new Date().toISOString(),
          },
        ]);
        break;
      }

      case "provider.config.ack": {
        const ack = serverMsg.payload as ProviderConfigAckPayload;
        if (ack.success) {
          console.log(`[App] Provider "${ack.provider}" configured successfully`);
        } else {
          console.error(`[App] Provider "${ack.provider}" config failed: ${ack.error}`);
        }
        break;
      }

      default: {
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
      const assistantId = nextId();
      streamingMsgIdRef.current = assistantId;
      setIsStreaming(true);

      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "user" as const,
          content: text,
          timestamp: new Date().toISOString(),
        },
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
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        loading={sidebarLoading}
      />

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
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
