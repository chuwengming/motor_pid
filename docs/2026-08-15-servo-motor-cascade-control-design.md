# 伺服馬達位置+速度級聯控制系統 — 設計文件

- **日期**：2026-08-15（v1.1：硬體改為 NUCLEO-F446RE，專案名 F446_Motor_PID）
- **狀態**：已定稿（設計）+ 專案已生成並編譯通過
- **專案**：F446_Motor_PID（由 HiPointF100_PLC_Vt1 溫度控制器轉型）
- **目標平台**：STM32F446RE（ST NUCLEO-F446RE，板載 ST-LINK）

---

## 1. 背景與目標

### 1.1 原專案（溫度版）

`HiPointF100_PLC_Vt1` 是一套以 **STM32F100C8T6B**（24MHz Cortex-M3、64KB Flash、8KB RAM）為核心的**極慢速溫度 PID 控制系統**：

- 控制迴圈 1 Hz（主迴圈順序執行）
- 回授：PT100 白金電阻溫度計（MAX31865 ADC 晶片、SPI2）
- 輸出：SSR 固態繼電器開/關（秒級 PWM 週期）
- 通訊：Modbus RTU Slave（USART1，與 HMI 面板交換 SV/參數/狀態）
- 自整定：繼電器法極限循環（Ziegler-Nichols / Cohen-Coon / Tyreus-Luyben，分鐘級）

### 1.2 新目標（馬達版）

以原專案為**參考架構**，改為**高速伺服馬達位置+速度控制系統**：

- **控制目標**：位置 + 速度級聯控制（學習實務導向，非商用精密，但技術須完整）
- **馬達**：有刷直流伺服馬達（帶編碼器）＋ H-bridge 驅動
- **通訊**：CAN bus（以機械手臂多關節擴展為情境）
- **硬體**：STM32F446RE（NUCLEO-F446RE，180MHz M4F + 2x CAN + 內建 ST-LINK）

### 1.3 已確認決策（與使用者）

| 決策點 | 結論 |
|---|---|
| 馬達類型 | 有刷直流伺服 + H-bridge |
| 控制目標 | 位置 + 速度（級聯） |
| 控制頻率 | 速度環 1 kHz、位置環 100 Hz |
| 通訊 | CAN bus（保留 debug UART） |
| 硬體 | STM32F446RE（NUCLEO-F446RE） |
| 編碼器規格 | 待定 → 以可配置常數設計（PPR、減速比） |

> **硬體演進紀錄**：最初規劃 F411 Black Pill，經 CubeMX 資料庫實測確認 **F411/F401 皆無 CAN 控制器**（與 F103 對照驗證），故改選 F446RE（180MHz、2x CAN、內建 ST-LINK）。

---

## 2. 硬體選型（BOM）

| 項目 | 型號 | 約略價格 | 說明 |
|---|---|---|---|
| 主控板 | **ST NUCLEO-F446RE** | NT$550 | 180MHz Cortex-M4F（FPU+DSP）、512KB Flash、128KB RAM、**2x CAN**、**內建 ST-LINK**（免另購燒錄器） |
| 馬達 | **輪趣 MG370 直流減速馬達 + 500 線 GMR 編碼器（1:30）** | NT$300 | 12V、**500 PPR AB 相 GMR 磁性編碼器**（4x = 2000 counts/rev 馬達軸）、減速 1:30 → 輸出 **100 RPM**、輸出軸 **60,000 counts/rev**。註：與 MG310 同系列（差異在編碼器外殼），程式設計參數相同 |
| 驅動器 | **BTN7971 高電流 H-bridge 模組** | NT$120 | 連續 ~10A（MG370 堵轉 2-4A 綽綽有餘）、PWM+方向控制、過流/過溫保護 |
| CAN 收發器 | **TJA1050 模組**（SN65HVD230 亦可） | NT$60 | CAN 控制器 → 差動匯流排 |
| 電源 | **12V/5A 適配器** + 5V 降壓（AMS1117 模組） | NT$150 | 馬達 12V/5A；Nucleo 由 USB 供電 |
| 除錯 | **ST-LINK 虛擬 COM（板載）** | NT$0 | USART2 經板載 ST-LINK 輸出 debug，免外接 USB-TTL |

> **總計約 NT$1,180**。馬達選型理由見下方。

### 2.1 選型理由

- **F446 vs F100/F411**：F100（24MHz 無 FPU）效能勉強；**F411 經 CubeMX 資料庫實測無 CAN 控制器**（F401 亦無）不符 CAN 需求；**F446RE = 180MHz M4F + FPU + 2x CAN + 內建 ST-LINK**，效能、通訊、除錯一次到位。
- **有刷直流伺服**：控制最簡單（單一 PWM + 方向），編碼器回授閉環與工業伺服同源，最適合學習「閉環控制」本質。
- **輪趣 MG370（500 線 GMR 編碼器，選定）**：較 JGA25-370（11–13 PPR）解析度提升 **~40 倍**（2000 vs 44 counts/rev 馬達軸），M 法速度量測在實用轉速域直接可用（±1% @ 3000 RPM 馬達軸）；**GMR 磁性編碼器**抗碳刷粉塵/油污，適合有刷馬達環境；1:30 減速 → 輸出 100 RPM、輸出軸 60,000 counts/rev（位置解析度 0.006°），扭力足以做負載擾動實驗。

---

## 3. 針腳規劃（Nucleo-F446RE）

> ⚠️ **Nucleo-F446RE 重點**：① PA2/PA3（USART2）已連**板載 ST-LINK 虛擬 COM**，直接當 debug UART；② CAN1 走 **PB8(RX)/PB9(TX)**，F446 有 **2 組 CAN**（CAN1/CAN2）資源充足；③ 板載用戶 LED **LD2 = PA5**、按鈕 **B1 = PC13**（可作測試急停）。

| 功能 | 針腳 | 外設/模式 | 說明 |
|---|---|---|---|
| 馬達 PWM | **PA8** | TIM1_CH1 | 20 kHz PWM（高級定時器，可加死區） |
| 方向 A | **PB0** | GPIO 輸出 | TB6612 AIN1 |
| 方向 B | **PB1** | GPIO 輸出 | TB6612 AIN2 |
| 驅動使能 | **PB10** | GPIO 輸出 | TB6612 STBY（低電位關閉輸出） |
| 編碼器 A | **PA0** | TIM2_CH1 | TIM2 為 **32-bit**，編碼器模式 3（4x） |
| 編碼器 B | **PA1** | TIM2_CH2 | ↑ |
| CAN TX | **PB9** | CAN1_TX | → TJA1050 TXD |
| CAN RX | **PB8** | CAN1_RX | ← TJA1050 RXD |
| Debug UART | **PA2/PA3** | USART2 | 115200 8N1，經板載 ST-LINK 虛擬 COM |
| 狀態 LED | **PA5** | GPIO 輸出 | 板載 LD2（心跳/錯誤） |
| 測試按鈕 | **PC13** | GPIO 輸入 | 板載 B1（可作測試急停） |
| 急停 | **PB12** | GPIO 輸入（EXTI） | 外部急停按鈕（低電位觸發） |
| 限位（可選） | **PB13** | GPIO 輸入 | 行程限位開關 |
| 電流感測（未來） | **PA4** | ADC1_IN4 | 預留電流迴路擴充 |
| SWD 除錯 | PA13/PA14 | 板載 ST-LINK 連接 | 不需外接燒錄器 |

### 3.1 對照：與原 F100 版本的差異

- TIM1 PWM 通道保留（PA8）；H-bridge 方向由 GPIO 控制，**不需要互補 PWM**（PB13 改作限位輸入）。
- TIM2 由 16-bit 編碼器（F100）升級為 **32-bit 編碼器（F446）**，大幅簡化溢出處理。
- **新增 CAN**（F100/F411 皆無）：CAN1 @ PB8/PB9。
- SPI2（MAX31865 溫度）、Modbus/USART1、SSR 控制**移除**。
- 除錯改用板載 ST-LINK 虛擬 COM（原外接 USB-TTL 移除）。

---

## 4. 系統架構（分層）

```
┌─────────────────────────────────────────────────┐
│  ⑥ 應用層   指令狀態機 / 參數管理 / Flash 持久化   │
├─────────────────────────────────────────────────┤
│  ⑤ 通訊層   CAN 非阻塞收發 + 協定解析（指令/回報）  │
├─────────────────────────────────────────────────┤
│  ④ 控制層   Motor_PID：位置(100Hz)+速度(1kHz)級聯  │ ← TIM3 中斷（硬實時）
├─────────────────────────────────────────────────┤
│  ③ 感測層   Encoder：32-bit 計數/速度計算；ADC 電流 │
├─────────────────────────────────────────────────┤
│  ② 驅動層   Motor_Driver：PWM/方向/使能/剎車/保護   │
├─────────────────────────────────────────────────┤
│  ① HAL 層   外設初始化（TIM/ADC/CAN/USART/DMA）    │
└─────────────────────────────────────────────────┘
```

**執行模型**：
- **硬實時（中斷）**：TIM3 1 kHz 更新事件 → 速度環 PID + 編碼器讀取 + PWM 輸出（µs 級完成）
- **半即時（中斷分頻）**：速度環每 10 次（10 ms）執行一次位置環 → 100 Hz
- **背景（主迴圈）**：CAN 收發、指令狀態機、參數管理、debug 輸出、自整定（非即時部分）

---

## 5. 控制架構：位置 + 速度級聯

```
位置SV ──►[位置環 PID 100Hz]──► 速度SV ──►[速度環 PID 1kHz]──► PWM ──► H-bridge ──► 馬達
(deg)       P 控制 + 限幅            (deg/s)    PI + D濾波      0-100%  方向+使能        ▲
  ▲                                     ▲                                             │
  └────────── 位置回授(deg) ─────────────┴─────────── 速度回授(deg/s) ← 編碼器 4x ─────┘
```

### 5.1 迴路設計

| 迴路 | 頻率 | 演算法 | 輸出限幅 | 說明 |
|---|---|---|---|---|
| 位置環 | 100 Hz | P（可加 D） | 限幅為**最大速度** | 防止位置誤差過大時速度命令超限；級聯結構下由速度環積分提供無差調節（靜止時位置誤差趨近 0） |
| 速度環 | 1 kHz | PI + D 濾波 | 限幅為 PWM 0–100% | 抑制負載擾動/摩擦，抗飽和 |
| （未來）電流環 | 10 kHz | PI | PWM 限幅 | F446 可擴充，此階段不做 |

- **加減速 Profile（已實作）**：速度命令斜坡（`MOTOR_MAX_ACCEL` = 200 RPM/s，避免階躍衝擊）；位置模式依剩餘距離減速 `v = √(2·a·d)`（梯形 profile，精確停靠不過衝）。
- **抗飽和**：兩環皆採積分夾緊（conditional integration）＋ 輸出限幅（積分上限 = 100/ki，可達全輸出）。
- **微分濾波**：速度環 D 項對編碼器雜訊敏感，採低通濾波（一階），且**對量測輸入微分、不對誤差微分**（沿用溫度版的既有經驗）。
- **速度量測**：M 法（單位時間計數）。低速時（計數 < 門檻）自動切換 T 法（脈衝週期量測）以維持低速解析度（可配置）。
- **單位**：位置 = 編碼器計數（deg 為顯示單位）；速度 = counts/s → deg/s（由 PPR×4×減速比換算，全部為可配置常數）。

### 5.2 時序預算（1 kHz，F446 @180MHz = 180,000 cycles/ms）

| 工作 | 預估週期 | 佔比 |
|---|---|---|
| 編碼器讀取 + 速度計算 | ~300 | 0.17% |
| 速度環 PID（浮點） | ~1,500 | 0.83% |
| 位置環（每 10 次一次） | ~500/10 | 0.03% |
| PWM 更新 | ~100 | 0.06% |
| **合計** | **< 3,000 cycles** | **< 1.7%** |

餘裕極大，可安心在背景做 CAN/除錯/自整定。

---

## 6. 通訊架構（CAN）

### 6.1 為什麼 CAN（機械手臂情境）

- 一條雙絞線串聯多節點（每關節一個 MCU），支援 110 節點
- 硬體仲裁：緊急訊框優先（錯誤/急停一定先到）
- 差動訊號抗 PWM EMI
- 工業機器人標準（CANopen/EtherCAT 家族）——學習價值高

### 6.2 節點架構（未來擴展）

```
PC 主控 ─USB-CAN 適配器─ CAN bus ── 節點1(關節1) ── 節點2(關節2) ── ... ── 節點N
                                  (本專案 = 節點1)
```

- 本專案階段：單節點 + PC 端 USB-CAN 適配器（或先用板載 ST-LINK 虛擬 COM debug 驗證控制，CAN 協定層同步開發）
- 節點 ID 編碼：**命令 ID = 0x100 | node_id**，**回報 ID = 0x180 | node_id**（node_id 0–7）。例如 §6.3 表中的 0x101/0x181 即為「節點 1 的速度命令/狀態回報」，未來多節點僅需換 node_id，協定不變

### 6.3 CAN 參數與 ID 規劃

- **波特率**：500 kbps（標準車載/工業速率）
- **識別碼格式**：標準 11-bit

| ID | 方向 | 內容 | 資料（8 bytes） |
|---|---|---|---|
| 0x101 | 主控→節點 | 速度命令 | `[SV_L, SV_H, 模式, 保留×5]`（0.1 deg/s 單位） |
| 0x102 | 主控→節點 | 位置命令 | `[SV_L×4（int32）, 模式]`（1 count 單位） |
| 0x103 | 主控→節點 | 參數讀寫 | `[位址, 子功能(讀/寫), 資料×4]`（PID 參數/PPR/減速比等） |
| 0x104 | 主控→節點 | 控制命令 | `[0x55=啟動, 0x11=停止, 0x33=暫停, 0x44=急停, 0x66=自整定]` |
| 0x181 | 節點→主控 | 狀態回報（週期 10ms） | `[模式, 實際速度×2, 實際位置×4]` |
| 0x182 | 節點→主控 | 錯誤/警報 | `[錯誤碼, 保留×7]` |
| 0x183 | 節點→主控 | 自整定結果 | `[Kp, Ki, Kd 各×2]` |

- 錯誤碼草案：`0x01=過流、0x02=過溫、0x04=編碼器故障、0x08=急停觸發、0x10=過速、0x20=通訊逾時`

### 6.4 收發模型

- **CAN RX**：FIFO 中斷 → 協定解析（中斷內僅搬資料進佇列，解析放主迴圈，避免阻塞 1kHz 控制中斷）
- **CAN TX**：主迴圈排程（狀態回報 10ms 週期、錯誤即時發送）
- 保留 **USART2 debug**：printf 詳細診斷（與 CAN 並存）

---

## 7. 軟體模組設計（檔案層級）

### 7.1 沿用/修改/新增/刪除總表

| 檔案 | 動作 | 內容 |
|---|---|---|
| `F446_Motor_PID.ioc` | 🔄 重配 | 移除 SPI2/USART2/SSR；TIM1=PWM、TIM2=Encoder(32bit)、TIM3=1kHz 時基（手動）、CAN、USART2=debug、ADC1 預留 |
| `Core/Src/main.c` | ♻️ 重寫 | F446 外設初始化 + 主迴圈（CAN/狀態機/自整定背景執行） |
| `Core/Inc/main.h` | ♻️ 重寫 | 馬達系統全域變數（SV/實際速度/位置/參數/狀態/錯誤碼）＋ 可配置常數 |
| `Core/Src/Motor_PID.c` | ➕ 已實作 | 級聯 PID（位置環 100Hz + 速度環 1kHz）、抗飽和（積分=100/ki）、D 濾波、加減速 profile、雙向 PWM |
| `Core/Src/Motor_Driver.c` | ➕ 新增 | PWM/方向/使能/剎車、過流/急停保護、開/閉迴路切換 |
| `Core/Src/Encoder.c` | ➕ 已實作 | TIM2 32-bit 編碼器、M 法速度計算 + EMA 平滑、單位換算（60,000 counts/rev）、歸零 |
| `Core/Src/Comm_CAN.c` | ➕ 新增 | bxCAN 初始化、收發佇列、協定解析（§6 之 ID 表） |
| `Core/Src/AutoTune_PID.c` | 🔄 改寫 | 保留繼電器法架構（ZN/CC），時間尺度/輸出域改為馬達（速度整定，秒級） |
| `Core/Src/Flash_Storage.c` | 🔄 改寫 | 馬達參數結構持久化（F446 最後一頁） |
| `Core/Src/PID_Control.c` | ❌ 移除 | 溫度專用（LUT/Bang-Bang/SSR）不再需要，由 Motor_PID 取代 |
| `Core/Src/MAX31865.c/.h` | ❌ 移除 | 溫度感測移除 |
| `Core/Src/Modbus_Process.c` | ❌ 移除 | Modbus 移除，由 Comm_CAN 取代 |
| `Core/Src/stm32f4xx_it.c`（F4 命名） | 🔄 改寫 | TIM3 控制中斷、CAN RX 中斷、USART2 中斷、急停 EXTI |
| `Core/Src/stm32f4xx_hal_msp.c` | 🔄 改寫 | F446 對應之 MSP（TIM/CAN/USART/ADC） |
| `Drivers/*` | 🔄 替換 | F1 HAL → **F4 HAL**（F446，FW V1.28.3） |
| `startup_*.s`、`*.ld` | 🔄 替換 | F446 啟動檔與連結檔（512KB/128KB） |
| `cmake/*`、`CMakeLists.txt` | 🔄 更新 | 源碼清單、晶片定義 `STM32F446xx`、工具鏈、post-build hex/bin |
| `FLASH_GUIDE.md`、`.vscode/*` | 🔄 更新 | 專案名統一 `F446_Motor_PID`、燒錄流程 |
| `docs/BLDC 原理.pdf` | 保留 | 學習參考（於 PID_ZN 參考專案內） |

### 7.2 關鍵資料結構（草案）

```c
// main.h（節錄）
typedef struct {
    float kp_pos;       // 位置環 P
    float kd_pos;       // 位置環 D
    float kp_spd;       // 速度環 P
    float ki_spd;       // 速度環 I
    float kd_spd;       // 速度環 D
    float spd_limit;    // 最大速度 (deg/s)
    float accel_limit;  // 加減速限制 (deg/s²)（可選 S-curve）
} Motor_PID_Params_t;

typedef struct {
    uint16_t ppr;           // 編碼器 PPR（馬達軸）
    uint16_t gear_ratio;    // 減速比
    float    ctrl_period;   // 速度環週期 (s)
} Motor_Config_t;

// 全域（草案）
extern volatile int32_t  enc_position;     // 32-bit 位置 (counts)
extern volatile float    spd_actual;       // 實際速度 (deg/s)
extern volatile float    pos_sv, spd_sv;   // 設定值
extern volatile float    pwm_out;          // 0~100%
extern volatile uint8_t  run_mode;         // STOP/RUN/PAUSE/EMERGENCY
extern volatile uint8_t  err_flags;        // 錯誤旗標
```

---

## 8. 里程碑計畫

| 里程碑 | 內容 | 驗證方式 | 依賴 |
|---|---|---|---|
| **M1 開發環境** | F446 建置：CubeMX 生成 + CMake 工具鏈、板載 ST-LINK 燒錄、blink 驗證 | LED(LD2) 閃爍、ST-LINK 虛擬 COM 輸出 | — |
| **M2 硬體層** | TIM1 PWM、TIM2 Encoder、TIM3 1kHz、CAN、USART2 初始化 | 示波器 PWM、編碼器讀值、CAN 回環測試 | M1 |
| **M3 驅動+感測層** | Motor_Driver（PWM/方向/使能）+ Encoder 速度計算 | 開環：手轉馬達看速度讀值正確 | M2 |
| **M4 速度環** | 1kHz 速度 PID、抗飽和、D 濾波 | 階躍響應：速度追蹤無震盪、穩態誤差 < 2% | M3 |
| **M5 位置環** | 100Hz 位置 PID + 限幅（速度上限） | 位置階躍：到達目標、無超調/最小超調 | M4 |
| **M6 CAN 通訊** | bxCAN(CAN1) 收發 + 協定解析 + 10ms 回報 | PC 端 USB-CAN 工具可命令與監看 | M2 |
| **M7 自整定** | AutoTune 高速化（繼電器法，速度環） | 自動算出 Kp/Ki/Kd 且閉環穩定 | M4 |
| **M8 持久化+安全** | Flash 參數儲存、過流/急停/限位保護 | 斷電重開參數保留、急停即時剎車 | M6 |
| **M9 整合調校** | 全系統整合、加減速限制、文件更新 | 機械手臂式動作演示（多點位置追蹤） | M5-M8 |

> 里程碑刻意**由下而上、每步可驗證**，避免一次大改無法除錯。

---

## 9. 測試與驗證策略

1. **開環測試**：固定 PWM 掃描（10%→100%），量測速度曲線，驗證編碼器/驅動層正確
2. **速度階躍**：SV 突變，檢查超調量、安定時間、穩態誤差（記錄於 debug 輸出）
3. **位置階躍**：SV 突變 90°/180°，檢查到達精度（±1 count）與超調
4. **抗飽和測試**：長時間大誤差，確認恢復後無積分 windup 突跳
5. **CAN 回環**：無收發器時用內部 loopback 模式驗證；有收發器後用 PC 工具驗證
6. **安全測試**：手動觸發急停/限位，確認 PWM 立即歸零、錯誤碼發出
7. **持久化測試**：斷電重開，參數恢復

---

## 10. 風險與限制

| 風險 | 影響 | 對策 |
|---|---|---|
| MG370 低速時 M 法計數少 | 低速速度量測量化誤差 | 500 PPR 已大幅改善；低速切 T 法（Encoder.c 設計） |
| 有刷馬達碳刷火花 → EMI | 編碼器/CAN 訊號干擾 | 馬達端加 RC 吸收、編碼器線雙絞、CAN 用屏蔽雙絞（GMR 磁性編碼器本身抗干擾） |
| BTN7971 高電流驅動 | 12V 大電流（堵轉 2-4A） | 電源 12V/5A、馬達與邏輯電源分離、過流保護 |
| 電源共地雜訊 | 電流/位置抖動 | 馬達電源與邏輯電源分離、加大電容 |
| 減速箱齒隙（backlash）| 位置震盪/精度 | 位置環加 D 或死區處理；教學階段先接受 |
| Nucleo 針腳有限（LQFP64） | 擴充受限 | 針腳表明訂（§3）；未來可換 LQFP100 板（如 F446VE） |
| CubeMX 重新生成覆蓋手動修改 | 程式碼遺失 | 手動修改一律寫在 USER CODE 區（本專案已遵循） |
| 一次移植太多模組 | 除錯困難 | 里程碑每步可驗證；舊版（F100）程式保留可回溯 |

---

## 11. 成功標準

1. 位置命令（CAN 0x102）→ 馬達精確到達目標位置（±1–2 count，受編碼器量化與齒隙影響），無持續震盪
2. 速度命令（CAN 0x101）→ 穩態誤差 < 2%、階躍無超調
3. 自整定（0x104）→ 自動產生可用 PID 參數並持久化
4. 急停/限位 → < 1ms 內 PWM 歸零 + CAN 錯誤碼
5. 斷電重開 → 參數自動恢復
6. 全系統於 F446 穩定運行 ≥ 1 小時無 watchdog/錯誤

---

## 12. 附錄：與溫度版架構對照

| 項目 | 溫度版（舊） | 馬達版（新） | 保留的架構概念 |
|---|---|---|---|
| 控制器 | STM32F100C8 | STM32F446RE | — |
| 控制迴圈 | 1 Hz 主迴圈 | 1 kHz 中斷 | **閉環 PID 核心** |
| 回授 | PT100/MAX31865 | 編碼器 | **感測器回授 → 誤差 → 修正** |
| 輸出 | SSR 開關 | PWM 佔空比 | 輸出致動 |
| 通訊 | Modbus RTU | CAN | **主控-設備命令/回報模式** |
| 自整定 | 繼電器法（分鐘級） | 繼電器法（秒級） | **Ku/Tu 量測原理** |
| 持久化 | Flash 最後一頁 | Flash 最後一頁 | **參數斷電保存** |
| 多目標 | Tank1/Tank2 | 單節點（可多節點） | 多通道管理概念 → CAN 多節點 |

---

## 13. CubeMX 專案生成與實作紀錄

### 13.1 最終目錄結構（2026-08-15）

```
C:\Users\chuwe\Documents\
└── F446_Motor_PID\                  ← 專案根（git 倉庫初始化於此）
    ├── docs\                        ← 設計文件（本文件）
    ├── PID_ZN\                      ← 舊 F100 參考專案（原樣保留，git 排除）
    │   ├── Core\  Drivers\  docs\  ...
    ├── Core\  Drivers\  cmake\  build\   ← F446 韌體（CubeMX 生成 + 手動修正）
    ├── ui\                            ← PC 端系統（React UI + Node bridge + 模擬器）
    │   ├── bridge\                   ← WebSocket 橋接 + 模擬馬達 + 串列驅動
    │   ├── frontend\                 ← React + Vite UI（工業控制台）
    │   ├── start_dev.bat / stop_dev.bat   ← 啟動/停止腳本
    │   └── README_啟動說明.txt
    ├── F446_Motor_PID.ioc            ← CubeMX 專案檔
    └── CMakeLists.txt / CMakePresets.json / startup_stm32f446xx.s / STM32F446XX_FLASH.ld
```

- 專案根由 `F411_Motor_PID` 改名為 `F446_Motor_PID`（配合硬體 NUCLEO-F446RE）
- 舊 F100 參考專案整體置於 `F446_Motor_PID/PID_ZN/`
- **git 倉庫不納入舊專案 F100**：於 `F446_Motor_PID/` 初始化，`.gitignore` 排除 `PID_ZN/`
- 設計文件置於 `F446_Motor_PID/docs/`（本文件）

### 13.2 生成方式（CubeMX CLI）

- 以**手寫 .ioc + CubeMX 命令列（CLI）**生成：`STM32CubeMX -q script`
- Firmware Package：**STM32Cube FW_F4 V1.28.3**（CubeMX 自動下載至 `C:\Users\chuwe\STM32Cube\Repository\`）
- Toolchain：**CMake + Ninja + arm-none-eabi-gcc 14.3.1**（STM32CubeCLT 1.21.0）
- 生成結果：TIM1/TIM2/CAN1/USART2/GPIO/時鐘（APB1=DIV4、APB2=DIV2）全部正確

> **經驗教訓**：手寫 .ioc 對 TIM 內部時鐘（TIM3）與 HSE 晶振模式的表示不完整（TIM3 未生成、HSE 誤設 BYPASS）。已透過下方 §13.4 手動修正解決。

### 13.3 專案設定（CubeMX）

| 設定 | 值 |
|---|---|
| 零件編號 | **STM32F446RE**（LQFP64） |
| Project Name | `F446_Motor_PID` |
| Toolchain | **CMake** |
| HSE | 8 MHz（Nucleo-F446RE 板載晶振） |
| SYSCLK | **180 MHz**（PLL M=8, N=360, P=2） |
| AHB / APB1 / APB2 | 180 / **45** / 90 MHz（DIV1/DIV4/DIV2） |
| 時鐘樹 | TIM1=180MHz、TIM2/TIM3=90MHz、CAN1=45MHz |

### 13.4 手動修正紀錄（2026-08-15）

| # | 問題 | 修正 | 位置 |
|---|---|---|---|
| 1 | HSE 誤設 `RCC_HSE_BYPASS`（應為晶振模式） | 改為 **`RCC_HSE_ON`** | `Core/Src/main.c` SystemClock_Config（生成區，重新生成需留意） |
| 2 | TIM3 1kHz 控制中斷未生成 | **手動加入 USER CODE 區**：`htim3` handle、`MX_TIM3_Init()`（PSC=89/ARR=999 @90MHz）、`HAL_TIM_Base_Start_IT`、`TIM3_IRQHandler`（優先權 0） | `main.c` + `stm32f4xx_it.c`（USER CODE，round-trip 安全） |
| 3 | CMakeLists 無 hex/bin 產出 | 加入 **post-build**（objcopy 生成 .hex/.bin） | `CMakeLists.txt` |
| 4 | 專案名 F411_Motor_PID | 改名 **F446_Motor_PID**（資料夾/.ioc/CMakeLists） | 全域 |

### 13.5 NVIC 中斷優先權（4 bits preemption）

| 中斷 | Preemption 優先權 | 理由 |
|---|---|---|
| **TIM3** | **0（最高）** | 1kHz 控制迴圈，不可被搶佔 |
| **CAN1 RX0** | 1 | 收訊框即時搬入佇列 |
| **EXTI15_10（PB12 急停）** | 1 | 緊急剎車要快 |
| **USART2** | 2 | debug 輸出 |
| SysTick | HAL 預設 | — |

> ADC/DMA 第一版**不啟用**（保持簡單）。

### 13.6 建置驗證（2026-08-15）

```
[3/3] Linking C executable F446_Motor_PID.elf
  RAM:   2424 B / 128 KB  (1.85%)
  FLASH: 25144 B / 512 KB (4.80%)
產出：F446_Motor_PID.elf / .hex / .bin（build/Debug/）
（已含 Encoder.c + Motor_PID.c 控制層）
```

- **BUILD EXIT 0**，無警告錯誤
- 外設初始化（TIM1/TIM2/TIM3/CAN/USART2/GPIO）全數就緒，待硬體到達後燒錄驗證（M1）

### 13.7 程式碼生成

- 手動修改一律寫在 USER CODE 區（CubeMX 重新生成不覆蓋）
- 未來若重新生成：留意 `RCC_HSE_ON`（#1）需重新套用；TIM3（#2）已於 USER CODE 區自動保留

---

## 15. 版本控制與後續工作

### 15.1 GitHub 倉庫

- **URL**：https://github.com/chuwengming/motor_pid
- **首次提交**：2026-08-16（141 檔案）
- **.gitignore 排除**：`PID_ZN/`（舊 F100 參考）、`build/`、`node_modules/`、`dist/`

### 15.2 韌體待完成工作（依序）

| # | 工作 | 內容摘要 |
|---|---|---|
| 1 | **AutoTune 韌體化** | 繼電器法狀態機 → Ku/Tu 量測 → ZN/TL/CC → 自動套用（對接 UI 0x106）|
| 2 | **CAN 通訊層** | bxCAN 500kbps、RX 過濾器 + 協定解析、TX 狀態回報（0x181/0x182/0x183）|
| 3 | **Flash 參數持久化** | 最後一頁 Sector、參數結構（版本+CRC）、保存/載入 |

### 15.3 硬體到達後的必辦事項（重要）

- **C. 位置保持**：位置環加小積分（ki）或到達後保持邏輯（重力載荷不漂移）
- **C. 位置保持**：位置環加小積分（ki）或到達後保持邏輯（重力載荷不漂移）
- **D. 安全保護**：過流（ADC，亦為 DOB 基礎）、軟體限位、急停完善、過溫
- **DOB 擾動觀測器**（§16.1，使用者指定優先）
- M1 燒錄驗證 → 全系統整合調校

---

## 16. 未來擴充（記錄與提醒）

### 16.1 ⭐ 擾動觀測器（DOB）— 瞬態擾動即時補償（使用者指定，優先）

**動機**（2026-08-16 使用者決策）：
- 主要關心的實務議題：**短暫外力擾動**（機器人被撞擊失去重心、無人機遇強風失去平衡）
- PI 積分是誤差驅動（被動補償，響應慢）；**DOB 是模型驅動（主動前饋）**，擾動出現即抵消
- 擾動消失 → d̂→0 → **自動回到原 PID 控制**（不需換參數/記憶庫）

**技術摘要**：
- 結構：`d̂ = Q(s)·[P⁻¹(s)·y - u]`，前饋加到輸入端
- 模型：標稱馬達一階 `P(s)=K/(τs+1)`（K=1、τ≈0.15）
- 關鍵設計：`Q(s)` 低通濾波器（補償頻寬 vs 雜訊容忍的權衡）
- 實現：1kHz 控制迴圈內，計算量小（一階模型 + 濾波器）

**狀態**：待實作（列為硬體到位後優先項之一）

### 16.2 增益調度（Gain Scheduling）— 評估結論：暫緩

**評估結論**（2026-08-16）：使用者判斷**增益調度不適合馬達 PID**（馬達工作點變化不像溫度系統需分段參數）；恆定負載由 PI 積分自動補償即可。**此方向暫緩**，僅保留概念紀錄。

### 16.3 提醒：硬體備妥後的必辦事項（更新）

- **C. 位置保持**：位置環加小積分（ki）或到達後保持邏輯
- **D. 安全保護**：過流（ADC 電流感測——同時是 DOB 與負載量測的基礎）、軟體限位、急停中斷（PB12 EXTI）、過溫
- **DOB 擾動觀測器**（§16.1，優先實作）
- M1 燒錄驗證 → 全系統整合調校



---

## 14. PC 端 UI 系統（React + Vite + Node Bridge）

### 14.1 系統架構

```
[React UI] ⇄ WebSocket ⇄ [Node Bridge] ⇄ 節點
  http://127.0.0.1:5173    ws://localhost:8080   ├─ sim（模擬馬達）✅ 已驗證
                                                  └─ serial（F446 節點，硬體到達後）
```

- **通訊層抽象**：Bridge 的 sim/serial 介面相同 → 硬體到達後僅切換模式，UI 完全不用改
- **命令/回報協定**（JSON over WS）：ID 概念與未來 CAN 一致（0x101 速度、0x102 位置、0x103 參數、0x104 控制、0x105 時序、0x106 自整定；0x181 狀態、0x182 錯誤、0x183 自整定結果）

### 14.2 目錄結構（ui/）

```
ui/
├── bridge/                  ← Node.js 後端
│   ├── server.js            WebSocket 伺服器（--mode sim | serial）
│   ├── simulator.js         模擬馬達節點（級聯閉環 PID、AutoTune、時序）
│   ├── protocol.js          命令/回報協定定義
│   └── serial.js            串列埠驅動（硬體到達後用，選用相依）
├── frontend/                ← React + Vite + TS + recharts
│   └── src/
│       ├── hooks/useBridge.ts       WebSocket hook + EMA 顯示平滑
│       ├── components/SpeedGauge.tsx    SVG 速度儀表（SV/實際雙指針）
│       ├── components/PositionDial.tsx  位置刻度盤（0-360° 弧 + 目標標記）
│       ├── components/TrendChart.tsx    即時曲線（100ms 降頻）
│       ├── components/ControlPanels.tsx 連線/速度/位置/時序面板
│       └── components/ParamPanels.tsx   PID 參數/AutoTune/事件面板
├── start_dev.bat / stop_dev.bat   （純 ASCII，避免編碼問題）
└── README_啟動說明.txt
```

### 14.3 模擬馬達節點（simulator.js）

- **馬達模型**：一階慣性 + 摩擦死區 + 量測雜訊（對齊 MG370：輸出軸 100 RPM 上限，500 PPR GMR）
- **節點閉環**：位置環(P) → 速度環(PI) 級聯，10ms 步進；**雙向 PWM**（-100~100%，對應 H-bridge 方向控制）
- **AutoTune**：繼電器法（雙向 bang-bang），量測 Ku/Tu → ZN / TL / CC 規則 → 自動套用參數
- **時序流程**：依時間線執行多步動作（速度/位置目標）
- **顯示平滑**：UI 端 EMA（α=0.25）僅作用於顯示，呈現穩定控制感

### 14.4 UI 美學（frontend-design 指導）

「**工業控制台**」主題：深石墨藍圖格線背景、琥珀/青色強調色、Rajdhani + JetBrains Mono + Noto Sans TC 字體、LED 狀態燈、數據面板化、SVG 自繪儀表/刻度盤。

### 14.5 啟動 / 停止

```
雙擊 ui\start_dev.bat   → 開啟 [F446 Bridge] + [F446 Frontend] 兩視窗
停止：關閉視窗 或 雙擊 stop_dev.bat
手動：cd ui\bridge && npm run sim；cd ui\frontend && npm run dev
```

### 14.6 功能與狀態（2026-08-15）

**已實作功能**：
- ✅ 速度控制（RUN 中可「更新目標轉速」即時切換，如 30↔80）
- ✅ 位置控制（歸零 → 設定 → 到達，0→100 精確無過衝）
- ✅ 加減速 Profile（速度斜坡 + 位置距離減速）
- ✅ 時序流程、AutoTune（模擬，ZN/TL/CC）、PID 參數讀寫
- ✅ 顯示平滑（EMA）、模式狀態提示
- ⏳ 串列模式待硬體（Nucleo-F446RE + USB VCP）到達後啟用

**GitHub 倉庫**：https://github.com/chuwengming/motor_pid（首次提交 2026-08-16，141 檔案）

