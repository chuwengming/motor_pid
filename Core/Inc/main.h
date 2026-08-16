/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include "Encoder.h"
#include "Motor_PID.h"
/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

// ----- 馬達參數（MG310 + 500線 GMR 編碼器，1:30） -----
#define MOTOR_PPR             500      // 編碼器線數（AB 相）
#define MOTOR_GEAR_RATIO      30       // 減速比（1:30 → 輸出 100 RPM）
#define MOTOR_COUNTS_PER_REV  (MOTOR_PPR * 4 * MOTOR_GEAR_RATIO)   // 60,000 counts/rev（輸出軸）
#define MOTOR_MAX_RPM         100      // 輸出軸最大轉速（RPM）
#define MOTOR_MAX_DEG_PER_SEC (MOTOR_MAX_RPM * 6)                  // 600 deg/s
#define MOTOR_MAX_ACCEL       200      // 加減速限制（RPM/s）：速度斜坡 / 位置減速

// ----- 錯誤旗標（急停/安全） -----
extern volatile uint8_t err_flags;   /* 0x01=過流 0x02=過溫 0x04=編碼器 0x08=急停 0x10=過速 0x20=通訊逾時 */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define B1_Pin GPIO_PIN_13
#define B1_GPIO_Port GPIOC
#define LD2_Pin GPIO_PIN_5
#define LD2_GPIO_Port GPIOA
#define DIR_A_Pin GPIO_PIN_0
#define DIR_A_GPIO_Port GPIOB
#define DIR_B_Pin GPIO_PIN_1
#define DIR_B_GPIO_Port GPIOB
#define MOTOR_STBY_Pin GPIO_PIN_10
#define MOTOR_STBY_GPIO_Port GPIOB
#define ESTOP_Pin GPIO_PIN_12
#define ESTOP_GPIO_Port GPIOB
#define ESTOP_EXTI_IRQn EXTI15_10_IRQn
#define LIMIT_Pin GPIO_PIN_13
#define LIMIT_GPIO_Port GPIOB

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
