/** Supported message types for WebSocket communication. */
export type ClientMessageType = "ping" | "echo" | "chat.send";
export type ServerMessageType =
  | "pong"
  | "echo"
  | "error"
  | "chat.delta"
  | "chat.error"
  | "chat.done";

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
