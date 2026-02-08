/** Supported message types for WebSocket communication. */
export type MessageType = "ping" | "pong" | "echo" | "error";

/** Base message envelope sent over the WebSocket tunnel. */
export interface Message {
  /** Discriminator for message routing. */
  type: MessageType;
  /** Arbitrary JSON-serialisable payload. */
  payload: unknown;
  /** ISO-8601 timestamp set by the sender. */
  timestamp: string;
}

/** Message sent from the client to the backend. */
export interface ClientMessage extends Message {
  type: "ping" | "echo";
}

/** Message sent from the backend to the client. */
export interface ServerMessage extends Message {
  type: "pong" | "echo" | "error";
}
