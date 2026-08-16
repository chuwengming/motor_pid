/**
 * protocol.js — PC ⇄ 節點 命令/回報協定
 *
 * 幀 ID 沿用 CAN 規劃（未來遷移 CAN 只換傳輸層）：
 *   命令（主控→節點）：0x101 速度、0x102 位置、0x103 參數、0x104 控制、0x105 時序、0x106 自整定
 *   回報（節點→主控）：0x181 狀態、0x182 錯誤、0x183 自整定結果、0x184 參數回應、0x185 時序確認
 */

export const CMD = {
  SET_SPEED:    "set_speed",     // { value: RPM }
  SET_POSITION: "set_position",  // { value: deg }
  CONTROL:      "control",       // { cmd: 'RUN'|'STOP'|'PAUSE'|'HOME'|'RESET' }
  SET_PARAM:    "set_param",     // { loop: 'spd'|'pos', kp, ki, kd }
  GET_PARAM:    "get_param",     // {}
  SEQUENCE:     "sequence",      // { steps: [{t, type, value, action}] }
  AUTOTUNE:     "autotune",      // { loop: 'spd'|'pos', method: 'ZN'|'TL'|'CC' }
  PING:         "ping"           // {}
};

export const RPT = {
  STATUS:         "status",           // 週期回報
  ERROR:          "error",
  PARAM:          "param",
  AT_PROGRESS:    "autotune_progress",
  AT_RESULT:      "autotune_result",
  SEQUENCE_ACK:   "sequence_ack",
  PONG:           "pong"
};

export const MODE = { STOP: 0, RUN: 1, PAUSE: 2, EMERGENCY: 3 };

export const ERR = {
  0x01: "過流", 0x02: "過溫", 0x04: "編碼器故障", 0x08: "急停觸發",
  0x10: "過速", 0x20: "通訊逾時"
};

/** 解析錯誤旗標為可讀清單 */
export function decodeErrors(flags) {
  const out = [];
  for (const [bit, label] of Object.entries(ERR)) {
    if (flags & parseInt(bit)) out.push(label);
  }
  return out;
}
