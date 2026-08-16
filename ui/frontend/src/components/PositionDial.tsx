/**
 * PositionDial — 位置刻度盤
 * 顯示：目前位置（青色弧 + 中央大數字）、目標位置（琥珀標記）
 * 支援多圈（position 可 >360 或 <0）：圓環顯示 mod 360，中央顯示完整數值
 */
interface Props { position: number; target: number | null }

const CX = 100, CY = 100, R = 78;

function pt(angDeg: number, r: number) {
  const rad = ((angDeg - 90) * Math.PI) / 180;   // 0° = 頂部，順時針
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function arcPath(a0: number, a1: number, r = R) {
  const p0 = pt(a0, r), p1 = pt(a1, r);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function PositionDial({ position, target }: Props) {
  const posMod = ((position % 360) + 360) % 360;   // 處理負值
  const tgtMod = target !== null && target !== undefined ? ((target % 360) + 360) % 360 : null;

  return (
    <svg viewBox="0 0 200 200" width="100%" style={{ display: "block" }}>
      {/* 底環 */}
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1d2533" strokeWidth="14" />
      {/* 目前位置弧（青色，順時針） */}
      {posMod > 0.5 && (
        <path d={arcPath(0, posMod)} stroke="#35d6ff" strokeWidth="14" fill="none"
          strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px rgba(53,214,255,.5))" }} />
      )}
      {/* 刻度（每 10° 小 / 每 90° 大 + 標籤） */}
      {Array.from({ length: 36 }).map((_, i) => {
        const a = i * 10;
        const major = i % 9 === 0;
        const p1 = pt(a, R - 8), p2 = pt(a, R - (major ? 16 : 12));
        return (
          <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke={major ? "#8b98ad" : "#3a4356"} strokeWidth={major ? 2 : 1} />
        );
      })}
      {[0, 90, 180, 270].map((a) => {
        const p = pt(a, R - 22);
        return (
          <text key={a} x={p.x} y={p.y + 3} textAnchor="middle" fill="#8b98ad"
            fontFamily="Rajdhani, sans-serif" fontSize="10">
            {a}°
          </text>
        );
      })}
      {/* 目標標記（琥珀） */}
      {tgtMod !== null && (
        <g>
          <line x1={pt(tgtMod, R - 20).x} y1={pt(tgtMod, R - 20).y}
                x2={pt(tgtMod, R + 2).x} y2={pt(tgtMod, R + 2).y}
                stroke="#ffb020" strokeWidth="4" strokeLinecap="round"
                style={{ filter: "drop-shadow(0 0 5px rgba(255,176,32,.7))" }} />
        </g>
      )}
      {/* 中央：目前位置 */}
      <text x={CX} y={CY - 22} textAnchor="middle" fill="#8b98ad"
        fontFamily="Rajdhani, sans-serif" fontSize="10" letterSpacing="2">目前位置</text>
      <text x={CX} y={CY - 2} textAnchor="middle" fill="#35d6ff"
        fontFamily="JetBrains Mono, monospace" fontSize="24" fontWeight="700"
        style={{ textShadow: "0 0 12px rgba(53,214,255,.5)" }}>
        {position.toFixed(1)}
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" fill="#8b98ad"
        fontFamily="Rajdhani, sans-serif" fontSize="10" letterSpacing="2">DEG</text>
      <text x={CX} y={CY + 30} textAnchor="middle" fill={tgtMod !== null ? "#ffb020" : "#3a4356"}
        fontFamily="JetBrains Mono, monospace" fontSize="10">
        {tgtMod !== null ? `目標位置 ${target!.toFixed(1)}°` : "未設定位置目標"}
      </text>
    </svg>
  );
}
