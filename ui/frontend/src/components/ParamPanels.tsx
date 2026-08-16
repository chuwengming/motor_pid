/**
 * ParamPanels — 右欄：⑤ PID 參數 ⑥ AutoTune ⑦ 狀態/錯誤
 */
import { useEffect, useState } from "react";
import type { useBridge } from "../hooks/useBridge";

type Bridge = ReturnType<typeof useBridge>;

/* ============ ⑤ PID 參數 ============ */
export function PIDPanel({ bridge }: { bridge: Bridge }) {
  const [loop, setLoop] = useState<"spd" | "pos">("spd");
  const [form, setForm] = useState({ kp: 0, ki: 0, kd: 0 });

  useEffect(() => {
    const p = bridge.params?.[loop];
    if (p) setForm(p);
  }, [bridge.params, loop]);

  const set = (k: keyof typeof form, v: number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="panel">
      <h3><span className="dot cyan" /> PID 參數</h3>
      <div className="btn-group" style={{ marginBottom: 8 }}>
        <button className={`btn mini ${loop === "spd" ? "run" : ""}`} onClick={() => setLoop("spd")}>速度環</button>
        <button className={`btn mini ${loop === "pos" ? "run" : ""}`} onClick={() => setLoop("pos")}>位置環</button>
      </div>
      {(["kp", "ki", "kd"] as const).map((k) => (
        <div className="row" key={k}>
          <label style={{ textTransform: "uppercase" }}>{k}</label>
          <input type="number" step={0.001} value={form[k]}
            onChange={(e) => set(k, Number(e.target.value))} />
        </div>
      ))}
      <div className="btn-group">
        <button className="btn mini run" onClick={() => bridge.setParam(loop, form)}>寫入</button>
        <button className="btn mini" onClick={bridge.getParam}>讀取</button>
      </div>
    </div>
  );
}

/* ============ ⑥ AutoTune ============ */
export function AutoTunePanel({ bridge }: { bridge: Bridge }) {
  const [loop, setLoop] = useState<"spd" | "pos">("spd");
  const [method, setMethod] = useState<"ZN" | "TL" | "CC">("ZN");
  const at = bridge.atProgress;

  return (
    <div className="panel">
      <h3><span className="dot" /> 自整定 AutoTune</h3>
      <div className="row">
        <label>目標環</label>
        <select value={loop} onChange={(e) => setLoop(e.target.value as any)}>
          <option value="spd">速度環</option>
          <option value="pos">位置環</option>
        </select>
      </div>
      <div className="row">
        <label>方法</label>
        <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
          <option value="ZN">Ziegler-Nichols</option>
          <option value="TL">Tyreus-Luyben</option>
          <option value="CC">Cohen-Coon</option>
        </select>
      </div>
      <button className="btn warn" onClick={() => bridge.startAutoTune(loop, method)}
        disabled={!!at && at.phase !== "done"}>啟動自整定</button>

      {at && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8b98ad", marginBottom: 4 }}>
            <span>[${at.loop}] ${at.phase}</span><span>${at.percent.toFixed(0)}%</span>
          </div>
          <div style={{ height: 6, background: "#0b0e14", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${at.percent}%`, height: "100%", background: "linear-gradient(90deg,#35d6ff,#ffb020)", transition: "width .3s" }} />
          </div>
        </div>
      )}

      {bridge.atResult && (
        <div style={{ marginTop: 10, background: "#0b0e14", border: "1px solid #2a3446", borderRadius: 6, padding: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
          <div style={{ color: "#37e29a", marginBottom: 4 }}>✓ 整定結果 [${bridge.atResult.loop}] ${bridge.atResult.method}</div>
          <div>Ku=${bridge.atResult.Ku}  Tu=${bridge.atResult.Tu}s</div>
          <div>Kp=${bridge.atResult.kp}  Ki=${bridge.atResult.ki}  Kd=${bridge.atResult.kd}</div>
          <div style={{ color: "#8b98ad", marginTop: 4 }}>超調 ${bridge.atResult.metrics?.overshoot} 安定 ${bridge.atResult.metrics?.settle}</div>
        </div>
      )}
    </div>
  );
}

/* ============ ⑦ 事件/錯誤 ============ */
export function EventPanel({ bridge }: { bridge: Bridge }) {
  return (
    <div className="panel">
      <h3><span className={`dot ${bridge.events.some(e => e.kind === "err") ? "red" : "cyan"}`} /> 事件紀錄</h3>
      <div className="event-list">
        {bridge.events.length === 0 && <div>尚無事件…</div>}
        {bridge.events.map((e, i) => (
          <div key={i} className={e.kind === "err" ? "err" : "ok"}>
            {new Date(e.t).toLocaleTimeString()} · {e.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
