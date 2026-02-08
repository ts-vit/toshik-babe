import type { ServerWebSocket } from "bun";
import type {
  ClientMessage,
  ServerMessage,
  ChatSendPayload,
  ChatDeltaPayload,
  ChatDonePayload,
  ChatErrorPayload,
  ChatHistoryRequestPayload,
  ChatHistoryPayload,
  ChatHistoryMessage,
} from "@toshik-babe/shared";
import { GigaChatProvider } from "./models/gigachat.provider";
import type { ChatMessage as ProviderChatMessage } from "./models/types";
import { openDatabase } from "./db/database";
import { ConversationsDao } from "./db/dao/conversations.dao";
import { MessagesDao } from "./db/dao/messages.dao";

/** Resolve port: CLI --port flag > PORT env var > default 3001 */
function resolvePort(): number {
  const args = process.argv;
  const portFlagIdx = args.indexOf("--port");
  if (portFlagIdx !== -1 && portFlagIdx + 1 < args.length) {
    const parsed = Number(args[portFlagIdx + 1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
      return parsed;
    }
  }
  const envPort = Number(process.env["PORT"]);
  if (Number.isFinite(envPort) && envPort > 0 && envPort < 65536) {
    return envPort;
  }
  return 3001;
}

const PORT = resolvePort();

// ── SQLite database & DAOs ─────────────────────────────────────────
const db = openDatabase();
const conversationsDao = new ConversationsDao(db);
const messagesDao = new MessagesDao(db);

// ── GigaChat provider (lazy init: crashes early if key missing) ─────
let gigachatProvider: GigaChatProvider | null = null;

function getGigaChatProvider(): GigaChatProvider {
  if (!gigachatProvider) {
    gigachatProvider = new GigaChatProvider(process.env["GIGACHAT_API_KEY"]);
  }
  return gigachatProvider;
}

// ── Per-connection conversation tracking ────────────────────────────
// Maps ws → conversationId (created lazily on first chat.send).
const wsConversationId = new WeakMap<ServerWebSocket<unknown>, string>();

/** Get or create a conversation for this WebSocket connection. */
function getOrCreateConversation(ws: ServerWebSocket<unknown>): string {
  let convId = wsConversationId.get(ws);
  if (!convId) {
    const conv = conversationsDao.create({ title: "Chat" });
    convId = conv.id;
    wsConversationId.set(ws, convId);
  }
  return convId;
}

/** Load full conversation history from DB as provider messages. */
function loadHistoryFromDb(conversationId: string): ProviderChatMessage[] {
  const rows = messagesDao.listByConversation(conversationId, 500);
  return rows.map((r) => ({
    role: r.role as ProviderChatMessage["role"],
    content: r.content,
  }));
}

function makeServerMessage(type: ServerMessage["type"], payload: unknown): string {
  const msg: ServerMessage = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(msg);
}

/**
 * Handle "chat.send": stream GigaChat response back as chat.delta / chat.done / chat.error.
 * Saves user and assistant messages to SQLite and loads full history for context.
 */
async function handleChatSend(
  ws: ServerWebSocket<unknown>,
  payload: ChatSendPayload,
): Promise<void> {
  const { text, requestId } = payload;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    ws.send(
      makeServerMessage("chat.error", {
        error: "Empty message text",
        requestId,
      } satisfies ChatErrorPayload),
    );
    return;
  }

  let provider: GigaChatProvider;
  try {
    provider = getGigaChatProvider();
  } catch (err) {
    ws.send(
      makeServerMessage("chat.error", {
        error: `Provider init failed: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
      } satisfies ChatErrorPayload),
    );
    return;
  }

  // Get (or create) the conversation for this connection.
  const conversationId = getOrCreateConversation(ws);

  // Save user message to the database.
  const userContent = text.trim();
  messagesDao.create({
    conversation_id: conversationId,
    role: "user",
    content: userContent,
  });

  // Load full conversation history from DB for multi-turn context.
  const history = loadHistoryFromDb(conversationId);

  try {
    let fullResponse = "";

    for await (const chunk of provider.stream(history)) {
      if (chunk.done) break;

      fullResponse += chunk.text;

      // Send delta to client.
      ws.send(
        makeServerMessage("chat.delta", {
          text: chunk.text,
          requestId,
        } satisfies ChatDeltaPayload),
      );
    }

    // Save assistant response to the database.
    if (fullResponse.length > 0) {
      messagesDao.create({
        conversation_id: conversationId,
        role: "assistant",
        content: fullResponse,
      });
    }

    // Signal completion.
    ws.send(
      makeServerMessage("chat.done", {
        requestId,
      } satisfies ChatDonePayload),
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[chat] stream error:", errorMsg);

    ws.send(
      makeServerMessage("chat.error", {
        error: errorMsg,
        requestId,
      } satisfies ChatErrorPayload),
    );
  }
}

/**
 * Handle "chat.history": fetch stored messages for a conversation and send them to the client.
 * If the conversation doesn't exist yet, creates it so subsequent chat.send works.
 */
function handleChatHistory(
  ws: ServerWebSocket<unknown>,
  payload: ChatHistoryRequestPayload,
): void {
  const { conversationId } = payload;

  if (!conversationId || typeof conversationId !== "string") {
    ws.send(
      makeServerMessage("chat.error", {
        error: "Missing or invalid conversationId",
      } satisfies ChatErrorPayload),
    );
    return;
  }

  // Ensure the conversation exists in the database.
  const existing = conversationsDao.getById(conversationId);
  if (!existing) {
    conversationsDao.create({ id: conversationId, title: "Chat" });
  }

  // Bind this ws to the requested conversation so subsequent chat.send uses the same one.
  wsConversationId.set(ws, conversationId);

  const rows = messagesDao.listByConversation(conversationId, 500);
  const messages: ChatHistoryMessage[] = rows.map((r) => ({
    id: r.id,
    role: r.role as ChatHistoryMessage["role"],
    content: r.content,
    timestamp: r.timestamp,
  }));

  ws.send(
    makeServerMessage("chat.history", {
      conversationId,
      messages,
    } satisfies ChatHistoryPayload),
  );
}

function handleMessage(ws: ServerWebSocket<unknown>, raw: string | Buffer) {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);

  let parsed: ClientMessage;
  try {
    parsed = JSON.parse(text) as ClientMessage;
  } catch {
    ws.send(makeServerMessage("error", { error: "Invalid JSON" }));
    return;
  }

  if (!parsed.type || !parsed.timestamp) {
    ws.send(
      makeServerMessage("error", {
        error: "Missing required fields: type, timestamp",
      }),
    );
    return;
  }

  switch (parsed.type) {
    case "ping":
      ws.send(makeServerMessage("pong", parsed.payload));
      break;
    case "echo":
      ws.send(makeServerMessage("echo", parsed.payload));
      break;
    case "chat.send":
      // Fire-and-forget: errors are sent via chat.error WS message.
      void handleChatSend(ws, parsed.payload as ChatSendPayload);
      break;
    case "chat.history":
      handleChatHistory(ws, parsed.payload as ChatHistoryRequestPayload);
      break;
    default:
      ws.send(
        makeServerMessage("error", {
          error: `Unknown message type: ${String(parsed.type)}`,
        }),
      );
  }
}

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }

    return new Response("Toshik Babe Engine — WebSocket backend", {
      status: 200,
    });
  },
  websocket: {
    open(_ws) {
      console.log("[ws] connection opened");
    },
    message(ws, message) {
      handleMessage(ws, message);
    },
    close(_ws, code, reason) {
      console.log(`[ws] connection closed (code=${code}, reason=${reason})`);
    },
  },
});

console.log(`Toshik Babe Engine backend running on http://localhost:${server.port}`);
