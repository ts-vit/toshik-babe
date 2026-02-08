import index from "./index.html";

Bun.serve({
  port: Number(process.env["PORT"]) || 1420,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Frontend dev server running on http://localhost:1420");
