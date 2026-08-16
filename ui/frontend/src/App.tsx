/**
 * App — F446 伺服馬達控制台主版面
 * 頂欄 + 三欄（左：控制 / 中：儀表 / 右：參數狀態）
 */
import { useEffect, useState } from "react";
import { useBridge, MODE_NAMES, MODE_COLORS } from "./hooks/useBridge";
import { SpeedGauge } from "./components/SpeedGauge";
import { PositionDial } from "./components/PositionDial";
import { TrendChart } from "./components/TrendChart";
import { ConnectionPanel, SpeedControl, PositionControl, SequencePanel } from "./components/ControlPanels";
import { PIDPanel, AutoTunePanel, EventPanel } from "./components/ParamPanels";

export default function App() {
  const bridge = useBridge();
  const [series, setSeries] = useState<"speed" | "position">("speed");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const st = bridge.status;
  const sm = bridge.smooth;   // EMA 平滑顯示值
  const mode = st ? MODE_NAMES[st.mode] ?? "?" : "—";
  const modeColor = st ? MODE_COLORS[st.mode] ?? "grey" : "grey";

  return (
    <div className="app">
      {/* ============ 頂欄 ============ */}
      <header className="topbar">
        <div className="brand">F446 <em>伺服馬達控制台</em></div>
        <div className="meta">
          <span><span className={`led ${bridge.connected ? "green" : "grey"}`} /> Bridge {bridge.connected ? "在線" : "離線"}</span>
          <span><span className={`led ${modeColor}`} /> 模式：{mode}</span>
          <span>錯誤旗標 0x{(st?.errors ?? 0).toString(16).toUpperCase().padStart(2, "0")}</span>
          <span>{now.toLocaleTimeString()}</span>
        </div>
      </header>

      {/* ============ 三欄 ============ */}
      <div className="main">
        {/* 左欄：控制 */}
        <div className="col col-left">
          <ConnectionPanel bridge={bridge} />
          <SpeedControl bridge={bridge} />
          <PositionControl bridge={bridge} />
          <SequencePanel bridge={bridge} />
        </div>

        {/* 中欄：儀表 */}
        <div className="col col-mid">
          <div className="panel">
            <h3><span className="dot cyan" /> 速度儀表</h3>
            <div style={{ maxWidth: 300, margin: "0 auto" }}>
              <SpeedGauge sv={st?.spdSV ?? 0} actual={sm.speed} max={100} />
            </div>
          </div>
          <div className="panel">
            <h3><span className="dot" /> 位置刻度盤 / 輸出狀態</h3>
            {/* 模式狀態提示：速度模式位置會持續累積 */}
            {st && st.mode === 1 && (st.posSV === null || st.posSV === undefined) && (
              <div style={{ fontSize: 11, color: "#ffd166", marginBottom: 6, fontFamily: "JetBrains Mono, monospace" }}>
                ⓘ 速度模式中：位置為累積值（馬達持續旋轉）。按「歸零」重置後，設目標位置即可觀察定位。
              </div>
            )}
            {st && st.mode === 1 && st.posSV !== null && st.posSV !== undefined && (
              <div style={{ fontSize: 11, color: "#37e29a", marginBottom: 6, fontFamily: "JetBrains Mono, monospace" }}>
                ✓ 位置控制中：目標 {st.posSV.toFixed(1)}°
              </div>
            )}
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 190 }}>
                <PositionDial position={sm.position} target={st?.posSV ?? null} />
              </div>
              <div className="stat-grid" style={{ flex: 1, minWidth: 180 }}>
                <div className="stat"><div className="k">PWM 輸出</div><div className="v">{sm.pwm.toFixed(1)}%</div></div>
                <div className="stat"><div className="k">實際速度</div><div className="v">{sm.speed.toFixed(0)} RPM</div></div>
                <div className="stat"><div className="k">目標轉速</div><div className="v">{st ? st.spdSV.toFixed(0) : "—"} RPM</div></div>
                <div className="stat"><div className="k">運轉模式</div><div className="v">{mode}</div></div>
              </div>
            </div>
          </div>
          <div className="panel">
            <h3><span className="dot cyan" /> 趨勢曲線</h3>
            <div className="btn-group" style={{ marginBottom: 8 }}>
              <button className={`btn mini ${series === "speed" ? "run" : ""}`} onClick={() => setSeries("speed")}>速度</button>
              <button className={`btn mini ${series === "position" ? "run" : ""}`} onClick={() => setSeries("position")}>位置</button>
            </div>
            <TrendChart status={st} series={series} smooth={sm} />
          </div>
        </div>

        {/* 右欄：參數/狀態 */}
        <div className="col col-right">
          <PIDPanel bridge={bridge} />
          <AutoTunePanel bridge={bridge} />
          <EventPanel bridge={bridge} />
        </div>
      </div>
    </div>
  );
}
