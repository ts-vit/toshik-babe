import type { ServerWebSocket } from "bun";
import type {
  ClientMessage,
  ServerMessage,
  ChatSendPayload,
  ChatDeltaPayload,
  ChatDonePayload,
  ChatErrorPayload,
} from "@toshik-babe/shared";
import { GeminiProvider } from "./models/gemini.provider";
import type { ChatMessage as ProviderChatMessage } from "./models/types";

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

// ── Gemini provider (lazy init: crashes early if key missing) ───────
let geminiProvider: GeminiProvider | null = null;

function getGeminiProvider(): GeminiProvider {
  if (!geminiProvider) {
    geminiProvider = new GeminiProvider(process.env["GOOGLE_GENAI_API_KEY"]);
  }
  return geminiProvider;
}

// ── Per-connection conversation history ────────────────────────────
// Maps ws → accumulated messages for multi-turn context.
const conversationHistory = new WeakMap<ServerWebSocket<unknown>, ProviderChatMessage[]>();

function getHistory(ws: ServerWebSocket<unknown>): ProviderChatMessage[] {
  let history = conversationHistory.get(ws);
  if (!history) {
    history = [];
    conversationHistory.set(ws, history);
  }
  return history;
}

function makeServerMessage(
  type: ServerMessage["type"],
  payload: unknown,
): string {
  const msg: ServerMessage = {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
  return JSON.stringify(msg);
}

/**
 * Handle "chat.send": stream Gemini response back as chat.delta / chat.done / chat.error.
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

  let provider: GeminiProvider;
  try {
    provider = getGeminiProvider();
  } catch (err) {
    ws.send(
      makeServerMessage("chat.error", {
        error: `Provider init failed: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
      } satisfies ChatErrorPayload),
    );
    return;
  }

  // Append user message to conversation history.
  const history = getHistory(ws);
  history.push({ role: "user", content: text.trim() });

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

    // Append assistant response to history for multi-turn.
    if (fullResponse.length > 0) {
      history.push({ role: "assistant", content: fullResponse });
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

console.log(
  `Toshik Babe Engine backend running on http://localhost:${server.port}`,
);
