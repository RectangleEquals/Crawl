import { defineConfig } from "vite";

export default defineConfig({
  // Client/assets (fonts, later baked art) is served/copied verbatim: /fonts/...
  publicDir: "assets",
  server: { port: 5173 },
  build: { target: "es2022" },
});
