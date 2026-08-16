/**
 * Motor_PID.h — 級聯 PID 控制（位置環 100Hz + 速度環 1kHz）
 *
 * 角色：馬達的「大腦」——依目標（速度/位置）與回授計算 PWM 輸出
 * 執行：TIM3 1kHz 中斷呼叫 MotorPID_Tick()
 * 輸出：motor_pwm（-100~+100%）→ TIM1_CH1 + 方向 GPIO
 */
#ifndef __MOTOR_PID_H
#define __MOTOR_PID_H

#include <stdint.h>

/* 控制命令（與 CAN/UI 協定一致） */
#define MOTOR_CMD_RUN       0x55
#define MOTOR_CMD_STOP      0x11
#define MOTOR_CMD_PAUSE     0x33
#define MOTOR_CMD_EMERGENCY 0x44
#define MOTOR_CMD_HOME      0x77

typedef struct {
  float kp; float ki; float kd;
} PID_Gains_t;

typedef enum {
  MOTOR_MODE_STOP = 0,
  MOTOR_MODE_RUN,
  MOTOR_MODE_PAUSE,
  MOTOR_MODE_EMERGENCY
} MotorMode_t;

void   MotorPID_Init(void);
void   MotorPID_Tick(void);              /* TIM3 1kHz：速度環（+100Hz 位置環） */
void   MotorPID_Control(uint8_t cmd);    /* RUN/STOP/PAUSE/EMERGENCY/HOME */
void   MotorPID_SetSpeedSV(float rpm);   /* 速度模式目標（輸出軸 RPM） */
void   MotorPID_SetPositionSV(float deg);/* 位置模式目標（deg） */
void   MotorPID_EmergencyStop(void);
void   MotorPID_SetGains(uint8_t loop, float kp, float ki, float kd); /* 0=速度環 1=位置環 */
float  MotorPID_GetSpeedSV(void);
float  MotorPID_GetPositionSV(void);

/* 全域（UI/CAN 層讀取） */
extern volatile float      motor_pwm;    /* -100 ~ +100 % */
extern volatile MotorMode_t motor_mode;

#endif
