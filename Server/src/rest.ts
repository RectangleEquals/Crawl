/**
 * Game-service read-only REST API (Docs/Multiplayer/rest-api.md). Exposes
 * non-performance-critical structural data about THIS world server so other
 * services (the regional directory) and external tools (status pages) can pull
 * it asynchronously without touching the realtime ws path. GET-only — writes
 * only happen inside the running service, never over HTTP. No secrets.
 */

import { createServer, type Server, type ServerResponse } from "node:http";
import type { GameHost } from "@crawlstar/shared";

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=2",
  });
  res.end(JSON.stringify(body));
}

/** Start the read-only REST server on `port`. Returns the http.Server. */
export function startGameRest(host: GameHost, port: number, log: (line: string) => void): Server {
  const server = createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET" }).end();
      return;
    }
    if (req.method !== "GET") {
      json(res, 405, { error: "read-only API; writes happen inside the service, not over REST" });
      return;
    }
    const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/+$/, "") || "/";
    const info = host.publicInfo();
    switch (path) {
      case "/api/health":
        return json(res, 200, { status: "ok", tick: info.server.tick, uptimeSec: info.server.uptimeSec });
      case "/api/status":
        return json(res, 200, info.server);
      case "/api/world": // areas + occupancy
        return json(res, 200, info.areas);
      case "/api/players": // public roster (no secrets)
        return json(res, 200, info.players);
      default:
        return json(res, 404, { error: "not found", hint: "read-only endpoints: /api/health, /api/status, /api/world, /api/players" });
    }
  });
  server.listen(port, () => log(`REST http://localhost:${port}/api/health (read-only)`));
  return server;
}
