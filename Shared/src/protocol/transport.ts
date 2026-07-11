/**
 * Transport abstraction (Docs/03 §1): the game never touches ws or
 * MessageChannel directly. Implementations: WsTransport (Client),
 * ChannelTransport (Client worker ↔ main), ServerWsConnection (Server).
 */

export interface Transport {
  send(data: Uint8Array): void;
  onMessage(handler: (data: Uint8Array) => void): void;
  onClose(handler: () => void): void;
  close(): void;
}

/** Server-side view of one connected client. */
export interface ClientConnection extends Transport {
  readonly id: number;
}

/** Something that accepts client connections (ws server, worker channel hub). */
export interface ConnectionListener {
  onConnection(handler: (conn: ClientConnection) => void): void;
}
