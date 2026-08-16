/**
 * TrendChart — 即時趨勢曲線（速度-時間 / 位置-時間）
 * 10ms 狀態回報 → 100ms 降頻取樣 → 保留最後 200 點 → recharts 繪製
 */
import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { MotorStatus } from "../hooks/useBridge";

interface Props {
  status: MotorStatus | null;
  series: "speed" | "position";
  smooth?: { speed: number; position: number; pwm: number };   // EMA 平滑值（顯示用）
}

interface Pt { t: number; speed: number; position: number; spdSV?: number }

export function TrendChart({ status, series, smooth }: Props) {
  const [data, setData] = useState<Pt[]>([]);
  const bufRef = useRef<Pt[]>([]);
  const lastFlush = useRef(0);

  useEffect(() => {
    if (!status) return;
    bufRef.current.push({
      t: Date.now(),
      speed: smooth?.speed ?? status.speed,
      position: smooth?.position ?? status.position,
      spdSV: status.spdSV,
    });
    // 100ms 降頻
    if (Date.now() - lastFlush.current > 100) {
      lastFlush.current = Date.now();
      setData((prev) => [...prev, ...bufRef.current].slice(-200));
      bufRef.current = [];
    }
  }, [status]);

  const isSpeed = series === "speed";
  return (
    <div style={{ width: "100%", height: 240 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="#1d2533" strokeDasharray="3 3" />
          <XAxis dataKey="t" hide />
          <YAxis stroke="#8b98ad" fontSize={10} tickFormatter={(v) => v.toFixed(0)}
            domain={isSpeed ? [0, "auto"] : ["auto", "auto"]} />
          <Tooltip
            contentStyle={{ background: "#11161f", border: "1px solid #2a3446", borderRadius: 6, fontSize: 12 }}
            labelFormatter={() => ""}
            formatter={(v, name) => [Number(v ?? 0).toFixed(1), name === "speed" ? "速度 RPM" : name === "spdSV" ? "SV" : "位置 deg"]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#8b98ad" }} />
          {isSpeed ? (
            <>
              <Line type="monotone" dataKey="spdSV" stroke="#ffb020" strokeWidth={1.5} strokeDasharray="6 3" dot={false} name="SV" />
              <Line type="monotone" dataKey="speed" stroke="#35d6ff" strokeWidth={2} dot={false} name="speed" isAnimationActive={false} />
            </>
          ) : (
            <Line type="monotone" dataKey="position" stroke="#37e29a" strokeWidth={2} dot={false} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
