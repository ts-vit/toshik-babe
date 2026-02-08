const server = Bun.serve({
  port: Number(process.env["PORT"]) || 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined;
      }
    }
    if (url.pathname === "/health") {
      return Response.json({ status: "ok", uptime: process.uptime() });
    }
    return new Response("Welcome to Toshik Babe Engine!");
  },
  websocket: {
    message(ws, message) {
      ws.send(`Echo: ${message}`);
    },
    open(ws) {
      console.log("WebSocket connection opened");
    },
    close(ws) {
      console.log("WebSocket connection closed");
    },
  },
});

console.log(`Toshik Babe Engine backend running on http://localhost:${server.port}`);
