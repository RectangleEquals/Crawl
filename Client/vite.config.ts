import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Private remote-play hostname lives in Client/.env.local (gitignored):
  //   CRAWLSTAR_ALLOWED_HOST=your.ddns.hostname
  const env = loadEnv(mode, process.cwd(), "CRAWLSTAR_");
  const remoteHost = env["CRAWLSTAR_ALLOWED_HOST"];

  return {
    // Client/assets (fonts, later baked art) is served/copied verbatim: /fonts/...
    publicDir: "assets",
    server: {
      port: 5173,
      host: true, // listen on all interfaces for LAN/remote playtesting
      ...(remoteHost ? { allowedHosts: [remoteHost, "localhost"] } : {}),
    },
    build: { target: "es2022" },
  };
});
