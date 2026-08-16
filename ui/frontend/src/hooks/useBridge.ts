/**
 * useBridge — PC ⇄ Bridge(WS) ⇄ 馬達節點 的通訊 hook
 * 管理連線狀態、狀態回報（10ms）、參數、自整定進度/結果、錯誤事件
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface MotorStatus {
  type: string; t: number; mode: number;
  speed: number; position: number; pwm: number;
  spdSV: number; posSV: number | null; errors: number;
}
export interface PIDParams {
  spd: { kp: number; ki: number; kd: number };
  pos: { kp: number; ki: number; kd: number };
}
export interface ATProgress { loop: string; method: string; phase: string; percent: number }
export interface ATResult {
  loop: string; method: string;
  Ku: number; Tu: number; kp: number; ki: number; kd: number;
  metrics: { overshoot: string; settle: string; steadyErr: string };
}

export const MODE_NAMES = ["STOP", "RUN", "PAUSE", "EMERGENCY"] as const;
export const MODE_COLORS = ["grey", "green", "amber", "red"] as const;

export function useBridge(url = "ws://localhost:8080") {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<MotorStatus | null>(null);
  const [params, setParams] = useState<PIDParams | null>(null);
  const [atProgress, setAtProgress] = useState<ATProgress | null>(null);
  const [atResult, setAtResult] = useState<ATResult | null>(null);
  const [events, setEvents] = useState<{ t: number; kind: string; msg: string }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // ---- 顯示平滑（EMA）----
  // 目的：10ms 原始回報含量測雜訊，直接顯示會抖動；以 EMA 低通濾波呈現「穩定控制」感。
  // 注意：僅影響「顯示」，不影響任何控制邏輯。
  const smoothRef = useRef({ speed: 0, position: 0, pwm: 0, ready: false });
  const [smooth, setSmooth] = useState({ speed: 0, position: 0, pwm: 0 });
  const ALPHA = 0.25;   // EMA 係數（越大越快、越小越平滑）

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(url);
    ws.onopen = () => { setConnected(true); pushEvent("ok", "已連線至 Bridge"); };
    ws.onclose = () => { setConnected(false); pushEvent("err", "Bridge 連線中斷"); };
    ws.onerror = () => pushEvent("err", "Bridge 連線錯誤");
    ws.onmessage = (e) => {
      let m: any;
      try { m = JSON.parse(e.data); } catch { return; }
      switch (m.type) {
        case "status": {
          setStatus(m);
          // EMA 平滑更新（首次直接採用）
          const s = smoothRef.current;
          if (!s.ready) { smoothRef.current = { speed: m.speed, position: m.position, pwm: m.pwm, ready: true }; }
          else {
            smoothRef.current = {
              speed: s.speed + ALPHA * (m.speed - s.speed),
              position: s.position + ALPHA * (m.position - s.position),
              pwm: s.pwm + ALPHA * (m.pwm - s.pwm),
              ready: true
            };
          }
          setSmooth({ speed: smoothRef.current.speed, position: smoothRef.current.position, pwm: smoothRef.current.pwm });
          break;
        }
        case "param": setParams(m); break;
        case "hello": pushEvent("ok", `節點就緒: ${m.node} (fw ${m.fw})`); break;
        case "mode": pushEvent("ok", `模式切換 → ${MODE_NAMES[m.mode] ?? m.mode}`); break;
        case "autotune_progress": setAtProgress(m); break;
        case "autotune_result": setAtResult(m); pushEvent("ok", `自整定完成 [${m.loop}] ${m.method}: Kp=${m.kp}`); break;
        case "seq_step": pushEvent("ok", `時序步驟 ${m.index}: ${m.type}=${m.value}`); break;
        case "seq_done": pushEvent("ok", "時序流程執行完畢"); break;
        case "error": pushEvent("err", m.msg ?? `錯誤碼 ${m.code}`); break;
        default: break;
      }
    };
    wsRef.current = ws;
  }, [url]);

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null; }, []);
  useEffect(() => () => disconnect(), [disconnect]);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  // 高階命令（UI 用）
  const control = useCallback((cmd: "RUN" | "STOP" | "PAUSE" | "HOME" | "RESET") => send({ type: "control", cmd }), [send]);
  const setSpeed = useCallback((value: number) => send({ type: "set_speed", value }), [send]);
  const setPosition = useCallback((value: number) => send({ type: "set_position", value }), [send]);
  const setParam = useCallback((loop: "spd" | "pos", p: { kp?: number; ki?: number; kd?: number }) =>
    send({ type: "set_param", loop, ...p }), [send]);
  const getParam = useCallback(() => send({ type: "get_param" }), [send]);
  const runSequence = useCallback((steps: { t: number; type: "speed" | "position"; value: number }[]) =>
    send({ type: "sequence", steps }), [send]);
  const startAutoTune = useCallback((loop: "spd" | "pos", method: "ZN" | "TL" | "CC") =>
    send({ type: "autotune", loop, method }), [send]);

  function pushEvent(kind: string, msg: string) {
    setEvents((prev) => [{ t: Date.now(), kind, msg }, ...prev].slice(0, 40));
  }

  return {
    connected, status, params, atProgress, atResult, events, smooth,
    connect, disconnect, send,
    control, setSpeed, setPosition, setParam, getParam, runSequence, startAutoTune
  };
}
