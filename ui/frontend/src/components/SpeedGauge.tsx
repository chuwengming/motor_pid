/**
 * SpeedGauge — 圓形速度儀表（SVG 自繪）
 * 顯示：目標轉速（琥珀指針）、實際轉速（青色指針）、區段色帶
 */

interface Props { sv: number; actual: number; max: number }

const START_ANG = -210;  // 起始角（度）
const SWEEP = 240;       // 掃掠角

function polar(cx: number, cy: number, r: number, angDeg: number) {
  const rad = ((angDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

export function SpeedGauge({ sv, actual, max }: Props) {
  const cx = 110, cy = 98, r = 86, inner = 68;
  const norm = (v: number) => Math.max(0, Math.min(1, v / max));
  const segs = [
    { to: 0.5, color: "#37e29a" },
    { to: 0.8, color: "#ffd166" },
    { to: 1.0, color: "#ff5d5d" },
  ];
  let from = 0;
  const segPaths = segs.map((s) => {
    const p = arcPath(cx, cy, r, START_ANG + from * SWEEP, START_ANG + s.to * SWEEP);
    from = s.to;
    return { p, c: s.color };
  });
  const svAng = START_ANG + norm(sv) * SWEEP;
  const acAng = START_ANG + norm(actual) * SWEEP;
  const svTip = polar(cx, cy, inner, svAng);
  const acTip = polar(cx, cy, inner, acAng);

  return (
    <svg viewBox="0 0 220 205" width="100%" style={{ display: "block", overflow: "visible" }}>
      {/* 區段色帶 */}
      {segPaths.map((s, i) => (
        <path key={i} d={s.p} stroke={s.c} strokeWidth="10" fill="none" strokeLinecap="butt" opacity="0.85" />
      ))}
      {/* 刻度 */}
      {Array.from({ length: 11 }).map((_, i) => {
        const a = START_ANG + (i / 10) * SWEEP;
        const p1 = polar(cx, cy, r - 14, a);
        const p2 = polar(cx, cy, r - 20, a);
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#8b98ad" strokeWidth="1.5" />;
      })}
      {/* SV 指針（琥珀） */}
      <line x1={cx} y1={cy} x2={svTip.x} y2={svTip.y} stroke="#ffb020" strokeWidth="3" strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 6px rgba(255,176,32,.6))" }} />
      {/* 實際速度指針（青色） */}
      <line x1={cx} y1={cy} x2={acTip.x} y2={acTip.y} stroke="#35d6ff" strokeWidth="3.5" strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 6px rgba(53,214,255,.6))" }} />
      {/* 中心 */}
      <circle cx={cx} cy={cy} r="6" fill="#0b0e14" stroke="#2a3446" strokeWidth="2" />
      {/* 中心數字 */}
      <text x={cx} y={cy + 30} textAnchor="middle" fill="#35d6ff" fontFamily="JetBrains Mono, monospace"
        fontSize="26" fontWeight="700" style={{ textShadow: "0 0 12px rgba(53,214,255,.5)" }}>
        {actual.toFixed(0)}
      </text>
      <text x={cx} y={cy + 46} textAnchor="middle" fill="#8b98ad" fontFamily="Rajdhani, sans-serif" fontSize="11" letterSpacing="2">
        RPM
      </text>
    </svg>
  );
}
