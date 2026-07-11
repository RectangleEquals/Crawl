/** Compact binary writer/reader over DataView (Docs/03 §2). Little-endian. */

export class ByteWriter {
  private buf: ArrayBuffer;
  private view: DataView;
  private pos = 0;

  constructor(initial = 256) {
    this.buf = new ArrayBuffer(initial);
    this.view = new DataView(this.buf);
  }

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.byteLength) return;
    const next = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.pos + n));
    new Uint8Array(next).set(new Uint8Array(this.buf, 0, this.pos));
    this.buf = next;
    this.view = new DataView(this.buf);
  }

  u8(v: number): this { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; return this; }
  u16(v: number): this { this.ensure(2); this.view.setUint16(this.pos, v, true); this.pos += 2; return this; }
  u32(v: number): this { this.ensure(4); this.view.setUint32(this.pos, v >>> 0, true); this.pos += 4; return this; }
  i16(v: number): this { this.ensure(2); this.view.setInt16(this.pos, v, true); this.pos += 2; return this; }
  i32(v: number): this { this.ensure(4); this.view.setInt32(this.pos, v | 0, true); this.pos += 4; return this; }
  f32(v: number): this { this.ensure(4); this.view.setFloat32(this.pos, v, true); this.pos += 4; return this; }

  str(s: string): this {
    const bytes = new TextEncoder().encode(s);
    this.u16(bytes.length);
    this.ensure(bytes.length);
    new Uint8Array(this.buf, this.pos, bytes.length).set(bytes);
    this.pos += bytes.length;
    return this;
  }

  finish(): Uint8Array {
    return new Uint8Array(this.buf.slice(0, this.pos));
  }
}

export class ByteReader {
  private readonly view: DataView;
  private pos = 0;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  i16(): number { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  i32(): number { const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  f32(): number { const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }

  str(): string {
    const len = this.u16();
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, len);
    this.pos += len;
    return new TextDecoder().decode(bytes);
  }

  get remaining(): number {
    return this.view.byteLength - this.pos;
  }
}
