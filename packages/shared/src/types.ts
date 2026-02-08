/** Supported message types for WebSocket communication. */
export type ClientMessageType = "ping" | "echo" | "chat.send" | "chat.history" | "chat.list" | "chat.create";
export type ServerMessageType =
  | "pong"
  | "echo"
  | "error"
  | "chat.delta"
  | "chat.error"
  | "chat.done"
  | "chat.history"
  | "chat.list"
  | "chat.create";

/** @deprecated Use ClientMessageType | ServerMessageType instead. */
export type MessageType = ClientMessageType | ServerMessageType;

/** Base message envelope sent over the WebSocket tunnel. */
export interface Message {
  /** Discriminator for message routing. */
  type: string;
  /** Arbitrary JSON-serialisable payload. */
  payload: unknown;
  /** ISO-8601 timestamp set by the sender. */
  timestamp: string;
}

/** Message sent from the client to the backend. */
export interface ClientMessage extends Message {
  type: ClientMessageType;
}

/** Message sent from the backend to the client. */
export interface ServerMessage extends Message {
  type: ServerMessageType;
}

// ── Chat-specific payload types ────────────────────────────────────

/** Payload for client → server "chat.send". */
export interface ChatSendPayload {
  /** The user's message text. */
  text: string;
  /** Optional request ID for correlating responses. */
  requestId?: string;
}

/** Payload for server → client "chat.delta" (streaming token). */
export interface ChatDeltaPayload {
  /** Partial text chunk from the model. */
  text: string;
  /** Request ID echoed from chat.send. */
  requestId?: string;
}

/** Payload for server → client "chat.done" (stream finished). */
export interface ChatDonePayload {
  /** Request ID echoed from chat.send. */
  requestId?: string;
}

/** Payload for server → client "chat.error" (stream/model error). */
export interface ChatErrorPayload {
  /** Human-readable error description. */
  error: string;
  /** Request ID echoed from chat.send. */
  requestId?: string;
}

/** Payload for client → server "chat.history" (request conversation history). */
export interface ChatHistoryRequestPayload {
  /** Conversation ID to fetch history for. */
  conversationId: string;
}

/** A single message entry in the history payload. */
export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

/** Payload for server → client "chat.history" (conversation history). */
export interface ChatHistoryPayload {
  /** Conversation ID these messages belong to. */
  conversationId: string;
  /** Messages ordered by timestamp ASC. */
  messages: ChatHistoryMessage[];
}

// ── Chat list / create payload types ───────────────────────────────

/** Payload for client → server "chat.create" (create a new conversation). */
export interface ChatCreatePayload {
  /** Optional initial title for the conversation. */
  title?: string;
}

/** A single conversation entry in the list. */
export interface ChatListItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** Payload for server → client "chat.list" (all conversations). */
export interface ChatListPayload {
  conversations: ChatListItem[];
}

/** Payload for server → client "chat.create" (newly created conversation). */
export interface ChatCreateResponsePayload {
  id: string;
  title: string;
}
