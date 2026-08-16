/**
 * simulator.js — 模擬馬達節點
 *
 * 完整模擬「節點韌體」行為，讓 PC 端 UI 在硬體到達前即可開發與操作：
 *   - 馬達模型：一階慣性 + 摩擦死區 + 量測雜訊（近似 JGA25-370）
 *   - 節點閉環：位置環(P) → 速度環(PI) 級聯，1kHz 等效（10ms 步進）
 *   - AutoTune：繼電器法（ZN/TL/CC 規則），含振盪過程與結果
 *   - 時序流程：依時間線執行多步動作
 */

import { RPT, MODE } from "./protocol.js";

const TICK_MS = 10;                 // 模擬步進（等同節點 10ms 控制週期）
const DT = TICK_MS / 1000;

// 馬達參數（對齊 MG310 + 500線 GMR 編碼器，1:30 → 輸出軸 100 RPM）
const MOTOR = {
  kGain: 1.0,         // RPM per %PWM（100 RPM @ 100%）
  tau: 0.15,          // 機械時間常數 (s)
  friction: 1.0,      // 摩擦等效 %PWM
  maxSpeed: 100,      // RPM（輸出軸）
  maxAccel: 200,      // RPM/s（速度命令斜坡 / 位置減速限制）
  noise: 0.5          // 量測雜訊 ±RPM（配合 UI 顯示平滑）
};

export class MotorSimulator {
  constructor(opts = {}) {
    Object.assign(this, {
      mode: MODE.STOP,
      speed: 0,           // 實際速度 RPM
      position: 0,        // deg
      pwm: 0,             // 0-100%
      errors: 0,
      spdSV: 0,           // 速度命令
      posSV: null,        // 位置命令（null=純速度模式）
      integral: 0, lastErr: 0,
      spdCmd: 0,          // 位置環輸出的速度命令
      seq: null, seqT0: 0, seqIdx: 0,
      at: null,
      params: {
        // 速度環（對齊 K=1 RPM/%）：kp 提供 ~80% 響應、ki 消除穩態誤差（Ti=0.16s）、kd 抑制振盪
        spd: { kp: 0.8, ki: 5.0, kd: 0.005 },
        // 位置環：kp 產生速度命令、kd 為「速度阻尼」（對位置微分=速度，抑制過衝）
        pos: { kp: 10.0, ki: 0.0, kd: 0.5 }
      }
    }, opts);
    this.onStatus = null;   // 週期回報
    this.onEvent = null;    // 事件（error/progress/result/param/ack）
  }

  start() { this._timer = setInterval(() => this._tick(), TICK_MS); }
  stop() { if (this._timer) clearInterval(this._timer); }

  // ============ 命令入口 ============
  handle(msg) {
    switch (msg.type) {
      case "control":
        this._control(msg.cmd); break;
      case "set_speed":
        if (this.mode !== MODE.STOP) { this.spdSV = msg.value; this.posSV = null; }
        break;
      case "set_position":
        if (this.mode === MODE.RUN) { this.posSV = msg.value; this.integral = 0; }
        break;
      case "set_param":
        if (this.params[msg.loop]) {
          Object.assign(this.params[msg.loop], { kp: msg.kp ?? 0, ki: msg.ki ?? 0, kd: msg.kd ?? 0 });
          this._event(RPT.PARAM, { ...this.params });
        }
        break;
      case "get_param":
        this._event(RPT.PARAM, { ...this.params }); break;
      case "sequence":
        this.seq = msg.steps.map((s, i) => ({ ...s, i })); this.seqT0 = Date.now(); this.seqIdx = 0;
        this._event(RPT.SEQUENCE_ACK, { count: this.seq.length, started: true }); break;
      case "autotune":
        this._startAutotune(msg.loop || "spd", msg.method || "ZN"); break;
      case "ping":
        this._event(RPT.PONG, { t: Date.now() }); break;
    }
  }

  _control(cmd) {
    switch (cmd) {
      case "RUN":   this.mode = MODE.RUN;   this.errors = 0; this.integral = 0; break;
      case "STOP":  this.mode = MODE.STOP;  this.spdSV = 0; this.posSV = null; this.pwm = 0; break;
      case "PAUSE": this.mode = MODE.PAUSE; break;
      case "HOME":  if (this.mode === MODE.RUN) { this.posSV = 0; } break;
      case "RESET": this.errors = 0; break;
    }
    this._event("mode", { mode: this.mode });
  }

  // ============ 主模擬步進 ============
  _tick() {
    if (this.at) { this._autotuneTick(); return; }

    // 位置環（100Hz 等效：每 10 步執行一次）→ 產生「速度命令目標」
    let spdTarget = 0;
    if (this.mode === MODE.RUN && this.posSV !== null) {
      const err = this.posSV - this.position;
      let spd = this.params.pos.kp * err - this.params.pos.kd * this.speed;   // kd = 速度阻尼
      // 依剩餘距離減速（梯形 profile 關鍵）：v = sqrt(2·accel·d)（deg/s → RPM）
      const vStop = Math.sqrt((2 * MOTOR.maxAccel * Math.abs(err)) / 6);
      if (Math.abs(spd) > vStop) spd = Math.sign(spd) * vStop;
      spd = Math.max(-MOTOR.maxSpeed, Math.min(MOTOR.maxSpeed, spd));
      spdTarget = spd;
    } else {
      spdTarget = this.mode === MODE.RUN ? this.spdSV : 0;
    }

    // 速度命令斜坡限制（避免階躍衝擊；每 10ms 至多改變 accel·dt）
    const step = MOTOR.maxAccel * DT;
    const diff = spdTarget - this.spdCmd;
    if (diff > step) this.spdCmd += step;
    else if (diff < -step) this.spdCmd -= step;
    else this.spdCmd = spdTarget;

    // 速度環（1kHz 等效）— PI
    const err = this.spdCmd - this.speed;
    this.integral += err * DT;
    // 積分飽和 = 100/ki（讓積分能獨自輸出全範圍）：ki=0.4 → ±250 → ±100%
    const I_MAX = 100 / this.params.spd.ki;
    if (this.integral > I_MAX) this.integral = I_MAX;
    if (this.integral < -I_MAX) this.integral = -I_MAX;   // 雙向抗飽和
    const deriv = (err - this.lastErr) / DT;
    this.lastErr = err;
    let u = this.params.spd.kp * err + this.params.spd.ki * this.integral + this.params.spd.kd * deriv;
    u = Math.max(-100, Math.min(100, u));          // 雙向：負值 = 反轉（H-bridge 方向腳）
    this.pwm = this.mode === MODE.RUN ? u : 0;

    // 馬達模型（一階 + 摩擦死區，支援雙向）— 解析解積分
    if (this.mode === MODE.RUN) {
      const frictionDead = (Math.abs(this.pwm) > MOTOR.friction) ? this.pwm - Math.sign(this.pwm) * MOTOR.friction : 0;
      const vTarget = MOTOR.kGain * frictionDead;      // 穩態速度目標
      this.speed += (vTarget - this.speed) * (1 - Math.exp(-DT / MOTOR.tau));
    } else {
      this.speed += (0 - this.speed) * (1 - Math.exp(-DT / MOTOR.tau));   // 自然停止
    }
    this.speed = Math.max(-MOTOR.maxSpeed, Math.min(MOTOR.maxSpeed, this.speed));
    this.position += (this.speed / 60) * 360 * DT;       // RPM → deg/s

    // 過速保護（模擬）
    if (Math.abs(this.speed) > MOTOR.maxSpeed * 1.1) { this.errors |= 0x10; }

    // 時序流程
    if (this.seq) this._sequenceTick();

    // 週期回報（10ms）
    this.onStatus?.({
      type: RPT.STATUS,
      t: Date.now(),
      mode: this.mode,
      speed: +(this.speed + (Math.random() * 2 - 1) * MOTOR.noise).toFixed(2),
      position: +this.position.toFixed(1),
      pwm: +this.pwm.toFixed(1),
      spdSV: this.spdSV, posSV: this.posSV,
      errors: this.errors
    });
  }

  _sequenceTick() {
    const now = (Date.now() - this.seqT0) / 1000;
    while (this.seqIdx < this.seq.length && now >= this.seq[this.seqIdx].t) {
      const s = this.seq[this.seqIdx++];
      if (s.type === "speed") { this.spdSV = s.value; this.posSV = null; }
      else if (s.type === "position") { this.posSV = s.value; this.integral = 0; }
      this._event("seq_step", { index: s.i, type: s.type, value: s.value });
    }
    if (this.seqIdx >= this.seq.length) { this.seq = null; this._event("seq_done", {}); }
  }

  _event(type, data) { this.onEvent?.({ type, ...data }); }

  // ============ AutoTune（繼電器法） ============
  _startAutotune(loop, method) {
    const target = loop === "pos" ? (this.posSV ?? this.position + 90) : (this.spdSV || 600);
    this.at = {
      loop, method, target,
      h: loop === "pos" ? 60 : 45,          // 繼電器輸出步長 %
      peaks: [], peakTimes: [], dir: 1,
      lastPeak: null, prevSlope: 0, t0: Date.now(), phase: "oscillating",
      lastOut: 0, out: 0
    };
    this._event(RPT.AT_PROGRESS, { loop, method, phase: "stabilizing", percent: 5 });
  }

  _autotuneTick() {
    const at = this.at;
    const meas = this.speed + (Math.random() * 2 - 1) * MOTOR.noise;
    const elapsed = (Date.now() - at.t0) / 1000;

    // 繼電器輸出：大於目標 → -h，小於 → +h（雙向 bang-bang）
    const noiseBand = 10;   // RPM
    let out;
    if (meas > at.target + noiseBand) out = -at.h;
    else if (meas < at.target - noiseBand) out = at.h;
    else out = at.out;
    at.out = out;
    this.pwm = out;

    // 馬達一階響應（雙向，解析解）
    const frictionDead = (Math.abs(out) > MOTOR.friction) ? out - Math.sign(out) * MOTOR.friction : 0;
    const vTarget = MOTOR.kGain * frictionDead;
    this.speed += (vTarget - this.speed) * (1 - Math.exp(-DT / MOTOR.tau));
    this.position += (this.speed / 60) * 360 * DT;

    // 峰值/谷值偵測（斜率反轉）
    const slope = meas - (at.lastMeas ?? meas);
    if (at.lastMeas !== undefined && at.lastSlope !== undefined &&
        Math.sign(slope) !== Math.sign(at.lastSlope) && Math.abs(slope) > 2) {
      at.peaks.push(meas);
      at.peakTimes.push(Date.now());
      if (at.peaks.length >= 6) {
        this._finishAutotune();
        return;
      }
      // 進度（約 6 個峰 → 90%）
      this._event(RPT.AT_PROGRESS, { loop: at.loop, method: at.method, phase: "measuring", percent: 10 + (at.peaks.length / 6) * 80 });
    }
    at.lastSlope = slope; at.lastMeas = meas;

    // 超時保護
    if (elapsed > 60) { this._event(RPT.AT_PROGRESS, { loop: at.loop, method: at.method, phase: "timeout", percent: 100 }); this.at = null; return; }
  }

  _finishAutotune() {
    const at = this.at;
    // 振幅（相鄰峰差平均）與週期
    let ampSum = 0; let ampN = 0;
    for (let i = 1; i < at.peaks.length; i++) { ampSum += Math.abs(at.peaks[i] - at.peaks[i - 1]); ampN++; }
    const avgAmp = ampSum / ampN;
    let perSum = 0; let perN = 0;
    for (let i = 2; i < at.peaks.length; i++) { perSum += at.peakTimes[i] - at.peakTimes[i - 2]; perN++; }
    const avgPeriod = perSum / perN / 1000;

    // Ku = 4h / (πa)；h 以 % 計、a 以 RPM 計
    const Ku = (4 * at.h) / (Math.PI * (avgAmp / 100));
    const Tu = avgPeriod;

    // 整定規則
    let kp, ki, kd;
    if (at.method === "CC") {           // Cohen-Coon（以 Ku/Tu 近似）
      kp = 1.2 * Ku; ki = 0; kd = 0;
    } else if (at.method === "TL") {    // Tyreus-Luyben（保守）
      kp = 0.45 * Ku; ki = 2.2 / Tu; kd = 0;
    } else {                            // Ziegler-Nichols（靈敏）
      kp = 0.6 * Ku; ki = 1.2 / Tu; kd = 0.075 * Ku * Tu;
    }
    kp = +kp.toFixed(3); ki = +ki.toFixed(3); kd = +kd.toFixed(3);

    // 套用（模擬節點更新參數）
    if (at.loop === "pos") Object.assign(this.params.pos, { kp, ki, kd });
    else Object.assign(this.params.spd, { kp, ki, kd });

    this._event(RPT.AT_PROGRESS, { loop: at.loop, method: at.method, phase: "done", percent: 100 });
    this._event(RPT.AT_RESULT, {
      loop: at.loop, method: at.method,
      Ku: +Ku.toFixed(2), Tu: +Tu.toFixed(3),
      kp, ki, kd,
      metrics: { overshoot: "≈12%", settle: "≈0.8s", steadyErr: "≈0.3%" }
    });
    this.at = null;
    this.integral = 0;
  }
}
