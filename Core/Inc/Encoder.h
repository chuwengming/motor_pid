/**
 * Encoder.h — 馬達位置/速度量測（TIM2 編碼器介面）
 *
 * 角色：馬達的「眼睛」——提供位置（deg）與速度（輸出軸 RPM）
 * 硬體：TIM2 Encoder Mode（PA0/PA1，4x 解碼，32-bit 計數器）
 * 馬達：MG310 + 500線 GMR 編碼器，1:30 → 60,000 counts/rev（輸出軸）
 */
#ifndef __ENCODER_H
#define __ENCODER_H

#include <stdint.h>

void   Encoder_Init(void);           /* 初始化（記錄基準計數） */
void   Encoder_Update(void);         /* 1kHz 中斷呼叫：M 法速度量測 */
int32_t Encoder_GetCounts(void);     /* 原始計數（診斷） */
float  Encoder_GetPositionDeg(void); /* 位置（deg，多圈可正負） */
float  Encoder_GetSpeedRPM(void);    /* 速度（輸出軸 RPM，速度環用） */
float  Encoder_GetSpeedDegPerSec(void); /* 速度（deg/s，位置環/顯示用） */
void   Encoder_Reset(void);          /* 歸零（HOME/上電） */

#endif
