/** Client transport implementations (Docs/03 §1) + the dev latency shim. */

import type { Transport } from "@crawlstar/shared";

export class WsTransport implements Transport {
  private socket: WebSocket | null = null;
  private messageHandler: ((data: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  connect(url: string, timeoutMs = 2500): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("connect timeout"));
      }, timeoutMs);
      socket.onopen = () => {
        clearTimeout(timer);
        this.socket = socket;
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("connect failed"));
      };
      socket.onmessage = (e) => {
        if (e.data instanceof ArrayBuffer) this.messageHandler?.(new Uint8Array(e.data));
      };
      socket.onclose = () => this.closeHandler?.();
    });
  }

  send(data: Uint8Array): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.socket?.close();
  }
}

/** Main-thread side of the integrated Web Worker server (Docs/02 §5). */
export class WorkerTransport implements Transport {
  private messageHandler: ((data: Uint8Array) => void) | null = null;
  private closeHandler: (() => void) | null = null;

  constructor(private readonly worker: Worker) {
    worker.onmessage = (e: MessageEvent) => {
      if (e.data instanceof ArrayBuffer) this.messageHandler?.(new Uint8Array(e.data));
    };
    worker.onerror = () => this.closeHandler?.();
  }

  send(data: Uint8Array): void {
    const copy = data.slice().buffer;
    this.worker.postMessage(copy, [copy]);
  }

  onMessage(handler: (data: Uint8Array) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  close(): void {
    this.worker.terminate();
    this.closeHandler?.();
  }
}

/**
 * Dev shim: symmetric artificial latency (+ jitter) for netcode testing.
 * ORDER-PRESERVING: jitter must never reorder packets — TCP/WebSocket never
 * does, and the host's sequence dedup would treat overtaken packets as
 * replays and drop them.
 */
export function withLatency(inner: Transport, rttMs: number, jitterMs = 15): Transport {
  if (rttMs <= 0) return inner;
  const half = rttMs / 2;
  const delay = (): number => half + (Math.random() * 2 - 1) * jitterMs;
  const lane = (): ((fn: () => void) => void) => {
    let lastAt = 0;
    return (fn) => {
      const at = Math.max(performance.now() + delay(), lastAt + 0.01);
      lastAt = at;
      setTimeout(fn, Math.max(0, at - performance.now()));
    };
  };
  const sendLane = lane();
  const recvLane = lane();
  let handler: ((data: Uint8Array) => void) | null = null;
  inner.onMessage((data) => {
    const copy = data.slice();
    recvLane(() => handler?.(copy));
  });
  return {
    send: (data) => {
      const copy = data.slice();
      sendLane(() => inner.send(copy));
    },
    onMessage: (h) => {
      handler = h;
    },
    onClose: (h) => inner.onClose(h),
    close: () => inner.close(),
  };
}
