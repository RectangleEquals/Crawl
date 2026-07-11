/**
 * The integrated singleplayer server (Docs/02 §5): the SAME GameHost the
 * headless Node server runs, hosted in a Web Worker and wired to the main
 * thread over postMessage. Singleplayer is online co-op with zero latency.
 */

import { GameHost, type ClientConnection, type ConnectionListener } from "@crawlstar/shared";

interface WorkerScope {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}

const scope = self as unknown as WorkerScope;

let messageHandler: ((data: Uint8Array) => void) | null = null;
const inbox: Uint8Array[] = [];

scope.onmessage = (e: MessageEvent) => {
  if (!(e.data instanceof ArrayBuffer)) return;
  const data = new Uint8Array(e.data);
  if (messageHandler) messageHandler(data);
  else inbox.push(data); // buffer until the host attaches (Hello races WASM init)
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

async function boot(): Promise<void> {
  await GameHost.ready();
  const host = new GameHost(listener, {
    seed: "solo",
    botCount: 1,
    log: (line) => console.log(`[integrated-server] ${line}`),
  });
  host.start();
  connectionHandler?.(connection);
}

void boot();
