/**
 * The integrated singleplayer server (Docs/02 §5): the SAME GameHost the
 * headless Node server runs, hosted in a Web Worker and wired to the main
 * thread over postMessage. Singleplayer is online co-op with zero latency.
 *
 * Main posts a `{ __cfg }` config message first (bots/enemies/cooldown for
 * testing), then binary game frames; we boot on the config, buffering any
 * frames that race ahead of WASM init.
 */

import { GameHost, type ClientConnection, type ConnectionListener } from "@crawlstar/shared";

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

interface WorkerConfig {
  bots?: number;
  enemies?: number;
  cdscale?: number;
  seed?: string;
}

const scope = self as unknown as WorkerScope;

let messageHandler: ((data: Uint8Array) => void) | null = null;
let booted = false;
const inbox: Uint8Array[] = [];

scope.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (data && typeof data === "object" && "__cfg" in data) {
    if (!booted) {
      booted = true;
      void boot((data as { __cfg: WorkerConfig }).__cfg);
    }
    return;
  }
  if (data instanceof ArrayBuffer) {
    const bytes = new Uint8Array(data);
    if (messageHandler) messageHandler(bytes);
    else inbox.push(bytes);
    return;
  }
};

const connection: ClientConnection = {
  id: 1,
  send: (data) => {
    const buffer = data.slice().buffer;
    scope.postMessage(buffer, [buffer]);
  },
  onMessage: (handler) => {
    messageHandler = handler;
    for (const d of inbox) handler(d);
    inbox.length = 0;
  },
  onClose: () => undefined,
  close: () => undefined,
};

let connectionHandler: ((conn: ClientConnection) => void) | null = null;
const listener: ConnectionListener = {
  onConnection: (handler) => {
    connectionHandler = handler;
  },
};

async function boot(cfg: WorkerConfig): Promise<void> {
  await GameHost.ready();
  const host = new GameHost(listener, {
    seed: cfg.seed ?? "solo",
    botCount: cfg.bots ?? 1,
    enemyCount: cfg.enemies ?? 4,
    cooldownScale: cfg.cdscale ?? 1,
    log: (line) => console.log(`[integrated-server] ${line}`),
  });
  host.start();
  connectionHandler?.(connection);
}

// fallback: if no config arrives shortly, boot with defaults
setTimeout(() => {
  if (!booted) {
    booted = true;
    void boot({});
  }
}, 250);
