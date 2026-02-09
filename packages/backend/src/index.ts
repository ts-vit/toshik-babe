import type { ServerWebSocket } from "bun";
import type {
  ClientMessage,
  ServerMessage,
  Attachment,
  AttachmentMeta,
  ChatSendPayload,
  ChatDeltaPayload,
  ChatDonePayload,
  ChatErrorPayload,
  ChatHistoryRequestPayload,
  ChatHistoryPayload,
  ChatHistoryMessage,
  ChatCreatePayload,
  ChatListPayload,
  ChatCreateResponsePayload,
  ProviderConfigPayload,
  ProviderConfigAckPayload,
} from "@toshik-babe/shared";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ModelProviderFactory, type ProviderId } from "./models/factory";
import type { ModelProvider, ChatMessage as ProviderChatMessage, ChatMessageAttachment } from "./models/types";
import { GigaChatProvider } from "./models/gigachat.provider";
import { openDatabase } from "./db/database";
import { ConversationsDao } from "./db/dao/conversations.dao";
import { MessagesDao } from "./db/dao/messages.dao";
import { AttachmentsDao } from "./db/dao/attachments.dao";

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
const attachmentsDao = new AttachmentsDao(db);

// ── Attachments storage directory ──────────────────────────────────
const ATTACHMENTS_DIR = resolve(import.meta.dir, "../../data/attachments");
mkdirSync(ATTACHMENTS_DIR, { recursive: true });

// ── Model provider (configurable at runtime via provider.config) ─────
let activeProvider: ModelProvider | null = null;

/** Get the currently active provider, falling back to GigaChat from env. */
function getActiveProvider(): ModelProvider {
  if (!activeProvider) {
    // Fallback: try to init GigaChat from environment variable.
    const envKey = process.env["GIGACHAT_API_KEY"];
    if (envKey) {
      activeProvider = new GigaChatProvider(envKey);
    } else {
      throw new Error(
        "No provider configured. Send a provider.config message with an API key, " +
        "or set the GIGACHAT_API_KEY environment variable.",
      );
    }
  }
  return activeProvider;
}

/** Re-initialize the active provider with new credentials. */
function configureProvider(
  providerId: ProviderId,
  apiKey: string,
  defaultModel?: string,
  baseURL?: string,
): void {
  activeProvider = ModelProviderFactory.create(providerId, {
    apiKey,
    defaultModel,
    baseURL,
  });
  console.log(`[provider] Configured provider: ${providerId}`);
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

/** Load full conversation history from DB as provider messages (with attachment data). */
function loadHistoryFromDb(conversationId: string): ProviderChatMessage[] {
  const rows = messagesDao.listByConversation(conversationId, 500);
  const messageIds = rows.map((r) => r.id);
  const allAttachments = attachmentsDao.listByMessages(messageIds);

  // Group attachments by message_id.
  const attachmentsByMsg = new Map<string, typeof allAttachments>();
  for (const att of allAttachments) {
    const existing = attachmentsByMsg.get(att.message_id) ?? [];
    existing.push(att);
    attachmentsByMsg.set(att.message_id, existing);
  }

  return rows.map((r) => {
    const msgAttachments = attachmentsByMsg.get(r.id);
    const providerAttachments: ChatMessageAttachment[] | undefined = msgAttachments?.map((a) => {
      // Read file data from disk for provider context.
      try {
        const fileData = Bun.file(a.file_path);
        // We'll load data lazily when the provider needs it — store metadata for now.
        return {
          id: a.id,
          type: a.type,
          name: a.name,
          filePath: a.file_path,
        };
      } catch {
        return {
          id: a.id,
          type: a.type,
          name: a.name,
          filePath: a.file_path,
        };
      }
    });

    return {
      role: r.role as ProviderChatMessage["role"],
      content: r.content,
      ...(providerAttachments && providerAttachments.length > 0
        ? { attachments: providerAttachments }
        : {}),
    };
  });
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

  let provider: ModelProvider;
  try {
    provider = getActiveProvider();
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
  const userMsg = messagesDao.create({
    conversation_id: conversationId,
    role: "user",
    content: userContent,
  });

  // Save attachments to disk and DB.
  const incomingAttachments = payload.attachments;
  if (incomingAttachments && incomingAttachments.length > 0) {
    for (const att of incomingAttachments) {
      try {
        const ext = att.type.split("/")[1] ?? "bin";
        const fileName = `${att.id}.${ext}`;
        const filePath = resolve(ATTACHMENTS_DIR, fileName);
        const buffer = Buffer.from(att.data, "base64");
        writeFileSync(filePath, buffer);
        attachmentsDao.create({
          id: att.id,
          message_id: userMsg.id,
          type: att.type,
          name: att.name,
          file_path: filePath,
        });
      } catch (err) {
        console.error(`[chat] failed to save attachment ${att.id}:`, err);
      }
    }
  }

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
  const msgIds = rows.map((r) => r.id);
  const allAtt = attachmentsDao.listByMessages(msgIds);
  const attByMsg = new Map<string, AttachmentMeta[]>();
  for (const a of allAtt) {
    const list = attByMsg.get(a.message_id) ?? [];
    list.push({ id: a.id, type: a.type as AttachmentMeta["type"], name: a.name });
    attByMsg.set(a.message_id, list);
  }

  const messages: ChatHistoryMessage[] = rows.map((r) => ({
    id: r.id,
    role: r.role as ChatHistoryMessage["role"],
    content: r.content,
    timestamp: r.timestamp,
    ...(attByMsg.has(r.id) ? { attachments: attByMsg.get(r.id) } : {}),
  }));

  ws.send(
    makeServerMessage("chat.history", {
      conversationId,
      messages,
    } satisfies ChatHistoryPayload),
  );
}

/**
 * Handle "chat.list": return all conversations ordered by updated_at DESC.
 */
function handleChatList(ws: ServerWebSocket<unknown>): void {
  const rows = conversationsDao.list(100);
  const conversations = rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  ws.send(
    makeServerMessage("chat.list", {
      conversations,
    } satisfies ChatListPayload),
  );
}

/**
 * Handle "provider.config": re-initialize the model provider with the given API key.
 */
function handleProviderConfig(
  ws: ServerWebSocket<unknown>,
  payload: ProviderConfigPayload,
): void {
  const { provider, apiKey, defaultModel, baseURL } = payload;

  if (!provider || typeof provider !== "string") {
    ws.send(
      makeServerMessage("provider.config.ack", {
        provider: provider ?? "unknown",
        success: false,
        error: "Missing or invalid provider field",
      } satisfies ProviderConfigAckPayload),
    );
    return;
  }

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
    ws.send(
      makeServerMessage("provider.config.ack", {
        provider,
        success: false,
        error: "Missing or empty apiKey",
      } satisfies ProviderConfigAckPayload),
    );
    return;
  }

  const supportedIds = ModelProviderFactory.supportedIds();
  if (!supportedIds.includes(provider as ProviderId)) {
    ws.send(
      makeServerMessage("provider.config.ack", {
        provider,
        success: false,
        error: `Unknown provider "${provider}". Supported: ${supportedIds.join(", ")}`,
      } satisfies ProviderConfigAckPayload),
    );
    return;
  }

  try {
    configureProvider(provider as ProviderId, apiKey.trim(), defaultModel, baseURL);
    ws.send(
      makeServerMessage("provider.config.ack", {
        provider,
        success: true,
      } satisfies ProviderConfigAckPayload),
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ws.send(
      makeServerMessage("provider.config.ack", {
        provider,
        success: false,
        error: errorMsg,
      } satisfies ProviderConfigAckPayload),
    );
  }
}

/**
 * Handle "chat.create": create a new conversation and return its ID + title.
 * Also binds the WebSocket to the new conversation.
 */
function handleChatCreate(
  ws: ServerWebSocket<unknown>,
  payload: ChatCreatePayload | undefined,
): void {
  const title = payload?.title?.trim() || "New Chat";
  const conv = conversationsDao.create({ title });

  // Bind ws to the new conversation so subsequent chat.send uses it.
  wsConversationId.set(ws, conv.id);

  ws.send(
    makeServerMessage("chat.create", {
      id: conv.id,
      title: conv.title,
    } satisfies ChatCreateResponsePayload),
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
    case "chat.list":
      handleChatList(ws);
      break;
    case "chat.create":
      handleChatCreate(ws, parsed.payload as ChatCreatePayload | undefined);
      break;
    case "provider.config":
      handleProviderConfig(ws, parsed.payload as ProviderConfigPayload);
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
