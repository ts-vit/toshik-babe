import type { ServerWebSocket } from "bun";
import type { ClientMessage, ServerMessage } from "@toshik-babe/shared";

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
