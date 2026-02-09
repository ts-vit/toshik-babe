import index from "./index.html";

// Build Tailwind CSS before starting the server.
const cssResult = Bun.spawnSync([
  "bunx",
  "tailwindcss",
  "--input",
  "src/styles.css",
  "--output",
  "src/compiled.css",
  "--content",
  "src/**/*.{tsx,ts,jsx,js}",
]);

if (cssResult.exitCode !== 0) {
  console.error("Failed to build Tailwind CSS:", cssResult.stderr.toString());
  process.exit(1);
}
console.log("Tailwind CSS compiled successfully.");

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
