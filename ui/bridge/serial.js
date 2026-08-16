/**
 * serial.js — USB 串列埠驅動（未來接真實 F446 節點）
 *
 * 介面與 MotorSimulator 相同（handle/onStatus/onEvent），
 * 讓 server.js 可無縫切換 sim/serial 模式。
 *
 * 注意：本模組使用選用相依 serialport；未安裝或硬體未到時不載入。
 */

export class SerialDriver {
  constructor({ path = "", baud = 115200 } = {}) {
    this.path = path; this.baud = baud;
    this.port = null; this.buffer = Buffer.alloc(0);
    this.onStatus = null; this.onEvent = null;
  }

  async open() {
    let SerialPort;
    try { ({ SerialPort } = await import("serialport")); }
    catch { throw new Error("serialport 未安裝（npm install serialport），或硬體尚未連接。請改用 --mode sim"); }
    this.port = new SerialPort({ path: this.path, baudRate: this.baud });
    this.port.on("data", (d) => this._onData(d));
    return new Promise((res, rej) => {
      this.port.on("open", res);
      this.port.on("error", rej);
    });
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // 依協議解幀（簡化：以換行分幀，未來對齊韌體二進位協定）
    let idx;
    while ((idx = this.buffer.indexOf(0x0A)) >= 0) {
      const line = this.buffer.subarray(0, idx).toString("utf8").trim();
      this.buffer = this.buffer.subarray(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "status") this.onStatus?.(msg);
        else this.onEvent?.(msg);
      } catch { /* 忽略非 JSON */ }
    }
  }

  handle(msg) {
    if (!this.port) return;
    this.port.write(JSON.stringify(msg) + "\n");
  }

  close() { this.port?.close(); }
}
