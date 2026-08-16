/**
 * Encoder.c — 馬達位置/速度量測實作
 *
 * 速度量測：M 法（1ms 時間窗內計數）+ EMA 平滑
 *   counts/s → RPM（輸出軸）= delta_counts × 1000 / 60000 × 60
 * 低速時計數少（±1 count 量化），EMA 平滑抑制跳動；
 * 進階 T 法（量脈衝週期）預留，500 PPR 下 M 法已足夠實用。
 */
#include "main.h"
#include "Encoder.h"

/* ---- 馬達常數（MG310，見 main.h） ---- */
#define COUNTS_PER_REV  (MOTOR_PPR * 4 * MOTOR_GEAR_RATIO)  /* 60000 */
#define DEG_PER_COUNT   (360.0f / (float)COUNTS_PER_REV)
#define RPM_TO_DEGPS    (6.0f)                              /* 1 RPM = 6 deg/s */

static volatile int32_t s_last_counts = 0;
static float s_speed_rpm = 0.0f;
static float s_speed_degps = 0.0f;
static uint8_t s_init = 0;

void Encoder_Init(void)
{
  /* TIM2 已由 MX_TIM2_Init 配置為 Encoder Mode（main.c 呼叫） */
  s_last_counts = (int32_t)TIM2->CNT;
  s_speed_rpm = 0.0f;
  s_speed_degps = 0.0f;
  s_init = 1;
}

void Encoder_Update(void)
{
  if (!s_init) return;
  int32_t cnt = (int32_t)TIM2->CNT;
  int32_t delta = cnt - s_last_counts;   /* 1ms 增量（32-bit 無溢位疑慮） */
  s_last_counts = cnt;

  /* counts/ms → counts/s → RPM（輸出軸） */
  float rpm = (float)delta * 1000.0f / (float)COUNTS_PER_REV * 60.0f;

  /* EMA 平滑（α=0.2，時間常數 ~5ms）——抑制 ±1 count 量化跳動 */
  const float alpha = 0.2f;
  s_speed_rpm = s_speed_rpm + alpha * (rpm - s_speed_rpm);
  s_speed_degps = s_speed_rpm * RPM_TO_DEGPS;
}

int32_t Encoder_GetCounts(void)
{
  return (int32_t)TIM2->CNT;
}

float Encoder_GetPositionDeg(void)
{
  return (float)(int32_t)TIM2->CNT * DEG_PER_COUNT;
}

float Encoder_GetSpeedRPM(void)
{
  return s_speed_rpm;
}

float Encoder_GetSpeedDegPerSec(void)
{
  return s_speed_degps;
}

void Encoder_Reset(void)
{
  TIM2->CNT = 0;
  s_last_counts = 0;
  s_speed_rpm = 0.0f;
  s_speed_degps = 0.0f;
}
