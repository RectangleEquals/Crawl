/** WebSocket gateway: adapts `ws` sockets to the Shared transport interface. */

import { WebSocketServer, WebSocket } from "ws";
import type { ClientConnection, ConnectionListener } from "@crawlstar/shared";

class WsConnection implements ClientConnection {
  private messageHandler: ((data: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(
    readonly id: number,
    private readonly socket: WebSocket,
  ) {
    socket.binaryType = "arraybuffer";
    socket.on("message", (data) => {
      if (data instanceof ArrayBuffer) this.messageHandler?.(new Uint8Array(data));
      else if (Buffer.isBuffer(data)) this.messageHandler?.(new Uint8Array(data));
    });
    socket.on("close", () => this.closeHandler?.());
    socket.on("error", () => this.closeHandler?.());
  }

  send(data: Uint8Array): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.socket.close();
  }
}

export class WsListener implements ConnectionListener {
  private handler: ((conn: ClientConnection) => void) | null = null;
  private nextId = 1;
  readonly wss: WebSocketServer;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (socket) => {
      this.handler?.(new WsConnection(this.nextId++, socket));
    });
  }

  onConnection(handler: (conn: ClientConnection) => void): void {
    this.handler = handler;
  }
}
