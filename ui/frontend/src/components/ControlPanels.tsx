/**
 * ControlPanels — 左欄控制面板
 * ① 連線 ② 速度控制 ③ 位置控制 ④ 時序流程
 */
import { useState } from "react";
import type { useBridge } from "../hooks/useBridge";

type Bridge = ReturnType<typeof useBridge>;

/* ============ ① 連線面板 ============ */
export function ConnectionPanel({ bridge }: { bridge: Bridge }) {
  const [url, setUrl] = useState("ws://localhost:8080");
  return (
    <div className="panel">
      <h3><span className={bridge.connected ? "dot" : "dot grey"} /> 連線</h3>
      <div className="row">
        <label>Bridge</label>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} disabled={bridge.connected} />
      </div>
      <div className="btn-group">
        {!bridge.connected ? (
          <button className="btn run" onClick={() => bridge.connect()}>連線</button>
        ) : (
          <button className="btn stop" onClick={bridge.disconnect}>斷線</button>
        )}
        <span style={{ alignSelf: "center", fontSize: 12, color: bridge.connected ? "#37e29a" : "#8b98ad" }}>
          <span className={`led ${bridge.connected ? "green" : "grey"}`} /> {bridge.connected ? "已連線" : "未連線"}
        </span>
      </div>
    </div>
  );
}

/* ============ ② 速度控制 ============ */
export function SpeedControl({ bridge }: { bridge: Bridge }) {
  const [sv, setSv] = useState(60);   // 輸出軸 RPM（MG310 上限 100）
  const running = bridge.status?.mode === 1;
  return (
    <div className="panel">
      <h3><span className="dot" /> 速度控制</h3>
      <div className="row">
        <label>目標轉速</label>
        <input type="number" min={-100} max={100} value={sv} onChange={(e) => setSv(Number(e.target.value))} />
        <span className="slider-val">{sv} RPM</span>
      </div>
      <input type="range" min={-100} max={100} step={5} value={sv}
        onChange={(e) => setSv(Number(e.target.value))} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b98ad", marginBottom: 8 }}>
        <span>-100</span><span>0</span><span>100 RPM</span>
      </div>
      <div className="btn-group">
        <button className="btn run" onClick={() => { bridge.control("RUN"); bridge.setSpeed(sv); }}>
          {running ? "更新目標" : "啟動"}
        </button>
        <button className="btn stop" onClick={() => bridge.control("STOP")}>停止</button>
        <button className="btn warn" onClick={() => bridge.control("PAUSE")}>暫停</button>
      </div>
      {running && <div style={{ fontSize: 10, color: "#8b98ad", marginTop: 4 }}>運行中：改目標轉速後按「更新目標」即時生效</div>}
    </div>
  );
}

/* ============ ③ 位置控制 ============ */
export function PositionControl({ bridge }: { bridge: Bridge }) {
  const [pos, setPos] = useState(90);
  const running = bridge.status?.mode === 1;
  return (
    <div className="panel">
      <h3><span className="dot cyan" /> 位置控制</h3>
      <div className="row">
        <label>目標位置</label>
        <input type="number" min={-3600} max={3600} value={pos} onChange={(e) => setPos(Number(e.target.value))} />
        <span className="slider-val">{pos}°</span>
      </div>
      <input type="range" min={-360} max={360} step={5} value={Math.max(-360, Math.min(360, pos))}
        onChange={(e) => setPos(Number(e.target.value))} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b98ad", marginBottom: 8 }}>
        <span>-360°</span><span>0°</span><span>360°</span>
      </div>
      <div className="btn-group">
        <button className="btn run" onClick={() => { bridge.control("RUN"); bridge.setPosition(pos); }} disabled={running}>到達位置</button>
        <button className="btn warn" onClick={() => bridge.control("HOME")}>歸零</button>
      </div>
    </div>
  );
}

/* ============ ④ 時序流程 ============ */
interface Step { t: number; type: "speed" | "position"; value: number }

export function SequencePanel({ bridge }: { bridge: Bridge }) {
  const [steps, setSteps] = useState<Step[]>([
    { t: 0, type: "speed", value: 600 },
    { t: 2, type: "position", value: 180 },
    { t: 4, type: "speed", value: 0 },
  ]);
  const [msg, setMsg] = useState("");

  const update = (i: number, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const execute = () => {
    const sorted = [...steps].sort((a, b) => a.t - b.t);
    bridge.runSequence(sorted);
    setMsg(`已下載 ${sorted.length} 步時序`);
  };

  return (
    <div className="panel">
      <h3><span className="dot" /> 時序流程規劃</h3>
      <table className="seq-table">
        <thead>
          <tr><th>時間(s)</th><th>類型</th><th>目標值</th><th></th></tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i}>
              <td><input type="number" step={0.5} min={0} value={s.t} style={{ width: 60 }}
                onChange={(e) => update(i, { t: Number(e.target.value) })} /></td>
              <td>
                <select value={s.type} style={{ width: 84 }}
                  onChange={(e) => update(i, { type: e.target.value as Step["type"] })}>
                  <option value="speed">轉速</option>
                  <option value="position">位置</option>
                </select>
              </td>
              <td><input type="number" value={s.value} style={{ width: 76 }}
                onChange={(e) => update(i, { value: Number(e.target.value) })} /></td>
              <td><button className="btn mini stop" onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="btn-group" style={{ marginTop: 8 }}>
        <button className="btn mini" onClick={() => setSteps((p) => [...p, { t: 1, type: "speed", value: 0 }])}>＋ 步驟</button>
        <button className="btn mini run" onClick={execute}>執行時序</button>
        <button className="btn mini stop" onClick={() => bridge.control("STOP")}>中止</button>
      </div>
      {msg && <div style={{ fontSize: 11, color: "#37e29a", marginTop: 6 }}>✓ {msg}</div>}
    </div>
  );
}
