/**
 * Motor_PID.c — 級聯 PID 實作
 *
 * 架構：
 *   位置環（100Hz，每 10 tick）→ 速度命令（限幅為最大速度）
 *   速度環（1kHz）→ PWM（-100~100%，方向由 GPIO 控制）
 *
 * 設計要點（沿用溫度版經驗）：
 *   - 抗飽和：輸出已達 ±100% 且誤差同向 → 暫停積分（積分夾緊）
 *   - D 項：對「速度量測」微分 + 一階低通（非誤差微分，避免目標突變爆炸）
 *   - 級聯 1:10 頻率比，避免兩環共振
 */
#include "main.h"
#include "Motor_PID.h"
#include "Encoder.h"
#include <math.h>

extern TIM_HandleTypeDef htim1;   /* TIM1 PWM（main.c 定義） */

/* ---- 預設增益（對齊模擬器驗證值；UI / AutoTune 可覆寫） ---- */
static PID_Gains_t s_spd_g = { 0.8f, 5.0f, 0.005f };  /* 速度環：kp 響應、ki 無差、kd 抑振 */
static PID_Gains_t s_pos_g = { 10.0f, 0.0f, 0.5f };   /* 位置環：kp 速度命令、kd 速度阻尼 */
static float s_integral_max = 20.0f;                  /* = 100/ki（ki=5 → 積分 ±20 → ±100%） */

static float s_spd_sv = 0.0f;       /* 速度目標（輸出軸 RPM） */
static float s_spd_cmd = 0.0f;      /* 速度命令（斜坡後，餵速度環） */
static float s_pos_sv = 0.0f;       /* 位置目標（deg） */
static uint8_t s_pos_active = 0;    /* 位置模式啟用 */
static float s_integral = 0.0f;
static float s_last_meas = 0.0f;
static float s_smooth_deriv = 0.0f;
static uint32_t s_tick = 0;

volatile float motor_pwm = 0.0f;
volatile MotorMode_t motor_mode = MOTOR_MODE_STOP;

/* TIM1 ARR=8999（20kHz @ 180MHz），PWM 全範圍對應 */
#define TIM1_ARR 8999

/* 內部：套用 PWM 到硬體（方向 + 佔空比） */
static void ApplyOutput(float pwm)
{
  uint32_t ccr;
  if (pwm > 0.0f) {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_SET);     /* DIR 正轉 */
    ccr = (uint32_t)(pwm / 100.0f * TIM1_ARR);
  } else {
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);   /* DIR 反轉 */
    ccr = (uint32_t)(-pwm / 100.0f * TIM1_ARR);
  }
  if (ccr > TIM1_ARR) ccr = TIM1_ARR;
  __HAL_TIM_SET_COMPARE(&htim1, TIM_CHANNEL_1, ccr);
}

void MotorPID_Init(void)
{
  motor_mode = MOTOR_MODE_STOP;
  s_spd_sv = 0.0f; s_pos_sv = 0.0f; s_pos_active = 0;
  s_integral = 0.0f; s_tick = 0;
  s_last_meas = Encoder_GetSpeedRPM();
  motor_pwm = 0.0f;
  ApplyOutput(0.0f);
}

void MotorPID_Tick(void)
{
  Encoder_Update();   /* 1kHz 更新速度量測 */

  /* ---- 位置環（100Hz）→ 速度命令目標 ---- */
  float spd_target = 0.0f;
  s_tick++;
  if (s_pos_active && (s_tick % 10 == 0)) {
    float err_pos = s_pos_sv - Encoder_GetPositionDeg();
    spd_target = s_pos_g.kp * err_pos - s_pos_g.kd * Encoder_GetSpeedRPM();   /* kd = 速度阻尼 */
    /* 依剩餘距離減速（梯形 profile）：v = sqrt(2·accel·d)，單位轉換 /6（deg/s→RPM） */
    float v_stop = sqrtf((2.0f * MOTOR_MAX_ACCEL * fabsf(err_pos)) / 6.0f);
    if (fabsf(spd_target) > v_stop) spd_target = (spd_target > 0) ? v_stop : -v_stop;
    if (spd_target > (float)MOTOR_MAX_RPM) spd_target = (float)MOTOR_MAX_RPM;
    if (spd_target < -(float)MOTOR_MAX_RPM) spd_target = -(float)MOTOR_MAX_RPM;
  } else {
    spd_target = (motor_mode == MOTOR_MODE_RUN) ? s_spd_sv : 0.0f;
  }

  /* ---- 速度命令斜坡（避免階躍衝擊） ---- */
  {
    float step = (float)MOTOR_MAX_ACCEL * 0.001f;
    float diff = spd_target - s_spd_cmd;
    if (diff > step) s_spd_cmd += step;
    else if (diff < -step) s_spd_cmd -= step;
    else s_spd_cmd = spd_target;
  }

  /* ---- 速度環（1kHz） ---- */
  float pwm = 0.0f;
  if (motor_mode == MOTOR_MODE_RUN) {
    float meas = Encoder_GetSpeedRPM();
    float err = s_spd_cmd - meas;

    /* 積分 + 抗飽和（積分夾緊） */
    s_integral += err * 0.001f;
    if ((motor_pwm >= 100.0f && err > 0.0f) || (motor_pwm <= -100.0f && err < 0.0f)) {
      s_integral -= err * 0.001f;   /* 回退本次累積 */
    }
    if (s_integral > s_integral_max) s_integral = s_integral_max;
    if (s_integral < -s_integral_max) s_integral = -s_integral_max;

    /* D：對量測微分 + 一階低通 */
    float deriv = (meas - s_last_meas) / 0.001f;
    s_last_meas = meas;
    const float df = 0.5f;
    s_smooth_deriv = s_smooth_deriv + df * (deriv - s_smooth_deriv);

    pwm = s_spd_g.kp * err + s_spd_g.ki * s_integral + s_spd_g.kd * s_smooth_deriv;
    if (pwm > 100.0f) pwm = 100.0f;
    if (pwm < -100.0f) pwm = -100.0f;
  } else {
    /* STOP/PAUSE/EMERGENCY：輸出歸零（PAUSE 保留目標，馬達自然停止） */
    s_last_meas = Encoder_GetSpeedRPM();
  }
  motor_pwm = pwm;
  ApplyOutput(pwm);
}

void MotorPID_Control(uint8_t cmd)
{
  switch (cmd) {
    case MOTOR_CMD_RUN:
      motor_mode = MOTOR_MODE_RUN;
      s_integral = 0.0f;
      s_last_meas = Encoder_GetSpeedRPM();
      break;
    case MOTOR_CMD_STOP:
      motor_mode = MOTOR_MODE_STOP;
      s_spd_sv = 0.0f; s_pos_active = 0; s_integral = 0.0f;
      motor_pwm = 0.0f; ApplyOutput(0.0f);
      break;
    case MOTOR_CMD_PAUSE:
      motor_mode = MOTOR_MODE_PAUSE;
      s_integral = 0.0f;
      break;
    case MOTOR_CMD_EMERGENCY:
      MotorPID_EmergencyStop();
      break;
    case MOTOR_CMD_HOME:
      if (motor_mode == MOTOR_MODE_RUN) { s_pos_sv = 0.0f; s_pos_active = 1; s_integral = 0.0f; }
      break;
    default: break;
  }
}

void MotorPID_EmergencyStop(void)
{
  motor_mode = MOTOR_MODE_EMERGENCY;
  motor_pwm = 0.0f;
  ApplyOutput(0.0f);
  /* DRV8871：無 STBY 腳，急停 = PWM 歸零 + IN2(PB0) 拉低（IN1=IN2=0 → 輸出關閉） */
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, GPIO_PIN_RESET);
  /* 錯誤旗標：急停觸發 */
  extern volatile uint8_t err_flags;
  err_flags |= 0x08;
}

void MotorPID_SetSpeedSV(float rpm)
{
  if (motor_mode == MOTOR_MODE_RUN) { s_spd_sv = rpm; s_pos_active = 0; }
}

void MotorPID_SetPositionSV(float deg)
{
  if (motor_mode == MOTOR_MODE_RUN) { s_pos_sv = deg; s_pos_active = 1; s_integral = 0.0f; }
}

void MotorPID_SetGains(uint8_t loop, float kp, float ki, float kd)
{
  if (loop == 0) {
    s_spd_g.kp = kp; s_spd_g.ki = ki; s_spd_g.kd = kd;
    if (ki > 0.001f) s_integral_max = 100.0f / ki;   /* 抗飽和上限隨 ki 調整 */
  } else {
    s_pos_g.kp = kp; s_pos_g.ki = ki; s_pos_g.kd = kd;
  }
}

float MotorPID_GetSpeedSV(void)    { return s_spd_sv; }
float MotorPID_GetPositionSV(void) { return s_pos_sv; }
