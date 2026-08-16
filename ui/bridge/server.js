/**
 * server.js — PC bridge 主程式
 *
 * 角色：WebSocket 伺服器（前端 UI ⇄ 馬達節點）
 * 模式：--mode sim（預設，模擬馬達） | --mode serial（真實節點）
 *
 * 啟動：npm run sim   （或 node server.js --mode sim）
 */
import { WebSocketServer } from "ws";
import { MotorSimulator } from "./simulator.js";
import { SerialDriver } from "./serial.js";

const PORT = Number(process.env.BRIDGE_PORT || 8080);
const mode = process.argv.includes("--mode") ? process.argv[process.argv.indexOf("--mode") + 1] : "sim";
const serialPath = process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : "";

console.log("╔════════════════════════════════════════════╗");
console.log("║   F446_Motor_PID — PC Bridge                ║");
console.log("╚════════════════════════════════════════════╝");
console.log(`  Mode: ${mode}   WS: ws://localhost:${PORT}`);

// 建立節點驅動
let driver;
if (mode === "serial") {
  driver = new SerialDriver({ path: serialPath || "COM3" });
  driver.open().catch(e => { console.error("  串列埠開啟失敗:", e.message); process.exit(1); });
  console.log(`  串列埠: ${serialPath || "COM3"} @115200`);
} else {
  driver = new MotorSimulator();
  driver.start();
  console.log("  模擬馬達: JGA25-370 等效模型（10ms 更新）");
}

// WebSocket 伺服器
const wss = new WebSocketServer({ port: PORT });

/** 廣播給所有已連線 UI */
function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(json);
  }
}

driver.onStatus = (s) => broadcast(s);
driver.onEvent = (e) => broadcast(e);

// 節點連線/錯誤事件（模擬節點的「自發」事件）
setInterval(() => {
  if (driver.errors) broadcast({ type: "error", code: driver.errors, msg: "模擬節點回報錯誤旗標" });
}, 2000);

wss.on("connection", (ws) => {
  console.log("  [UI] 已連線");
  // 新 UI 連線時立刻補發狀態與參數
  if (driver.onStatus) {
    broadcast({ type: "param", ...driver.params });
    ws.send(JSON.stringify({ type: "hello", node: "F446-Motor-Node-01", fw: "0.1.0-sim", ts: Date.now() }));
  }
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log("  [CMD]", msg.type, JSON.stringify(msg).slice(0, 80));
      driver.handle(msg);
    } catch (e) { ws.send(JSON.stringify({ type: "error", msg: "bad message: " + e.message })); }
  });
  ws.on("close", () => console.log("  [UI] 已離線"));
});

wss.on("listening", () => console.log("  Bridge 就緒，等待 UI 連線..."));
