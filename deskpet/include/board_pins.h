// Pines de la Waveshare ESP32-S3-Touch-AMOLED-1.75.
//
// Fuentes (repositorio oficial waveshareteam/ESP32-S3-Touch-AMOLED-1.75,
// commit e4344e70c2fa78a13e8a06566507f1ba8af6672a, 2026-08-21):
//   [PC]  examples/arduino/libraries/Mylibrary/pin_config.h
//   [BSP] firmware/brookesia/components/waveshare__esp32_s3_touch_amoled_1_75/
//         include/bsp/esp32_s3_touch_amoled_1_75.h
//   [EX6] examples/arduino/06_LVGL_Widgets/06_LVGL_Widgets.ino
//   [EX1] examples/arduino/01_HelloWorld/01_HelloWorld.ino
//
// No agregar pines sin citar su fuente.
#pragma once

#include <stdint.h>

// ---------------------------------------------------------------------------
// Pantalla AMOLED CO5300 por QSPI
// ---------------------------------------------------------------------------
constexpr int8_t PIN_LCD_CS    = 12;  // [PC] LCD_CS 12      · [BSP] BSP_LCD_CS GPIO_NUM_12
constexpr int8_t PIN_LCD_SCLK  = 38;  // [PC] LCD_SCLK 38    · [BSP] BSP_LCD_PCLK GPIO_NUM_38
constexpr int8_t PIN_LCD_SDIO0 = 4;   // [PC] LCD_SDIO0 4    · [BSP] BSP_LCD_DATA0 GPIO_NUM_4
constexpr int8_t PIN_LCD_SDIO1 = 5;   // [PC] LCD_SDIO1 5    · [BSP] BSP_LCD_DATA1 GPIO_NUM_5
constexpr int8_t PIN_LCD_SDIO2 = 6;   // [PC] LCD_SDIO2 6    · [BSP] BSP_LCD_DATA2 GPIO_NUM_6
constexpr int8_t PIN_LCD_SDIO3 = 7;   // [PC] LCD_SDIO3 7    · [BSP] BSP_LCD_DATA3 GPIO_NUM_7
constexpr int8_t PIN_LCD_RESET = 39;  // [PC] LCD_RESET 39   · [BSP] BSP_LCD_RST GPIO_NUM_39
// Sin pin de backlight: el brillo se controla por comando al CO5300. [BSP] BSP_LCD_BACKLIGHT NC

constexpr int16_t LCD_WIDTH  = 466;   // [PC] LCD_WIDTH 466
constexpr int16_t LCD_HEIGHT = 466;   // [PC] LCD_HEIGHT 466
// Desplazamiento de columna del panel dentro de la RAM del CO5300.
constexpr uint8_t LCD_COL_OFFSET = 6; // [EX1] Arduino_CO5300(bus, LCD_RESET, 0, 466, 466, 6, 0, 0, 0)

// ---------------------------------------------------------------------------
// Bus I2C compartido (touch, PMU AXP2101, RTC PCF85063, IMU QMI8658, codec ES8311)
// ---------------------------------------------------------------------------
constexpr int8_t PIN_I2C_SDA = 15;    // [PC] IIC_SDA 15     · [BSP] BSP_I2C_SDA GPIO_NUM_15
constexpr int8_t PIN_I2C_SCL = 14;    // [PC] IIC_SCL 14     · [BSP] BSP_I2C_SCL GPIO_NUM_14

// ---------------------------------------------------------------------------
// Touch CST9217
// ---------------------------------------------------------------------------
constexpr int8_t PIN_TP_INT   = 11;   // [PC] TP_INT 11      · [BSP] BSP_LCD_TOUCH_INT GPIO_NUM_11
constexpr int8_t PIN_TP_RESET = 40;   // [PC] TP_RESET 40    · [BSP] BSP_LCD_TOUCH_RST GPIO_NUM_40
constexpr uint8_t I2C_ADDR_TOUCH = 0x5A; // [EX6] touch.begin(Wire, 0x5A, ...) (CST92XX_SLAVE_ADDRESS)
// Orientación del touch respecto al panel: espejo en X y en Y.
// [EX6] touch.setMirrorXY(true, true) · [BSP] mirror_x = 1, mirror_y = 1, swap_xy = 0
constexpr bool TOUCH_MIRROR_X = true;
constexpr bool TOUCH_MIRROR_Y = true;

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------
// BOOT es el strapping pin GPIO0 del ESP32-S3 (hoja de datos de Espressif); se usará en la Fase 4.
// PWR está conectado al AXP2101 (no a un GPIO); se lee por la PMU en la Fase 8.

// Pines de audio (Fase 7), PMU/RTC/IMU (Fases 3, 4 y 8) se agregarán al llegar a esas fases,
// verificados contra examples/arduino/08_ES8311 y el BSP (ver CLAUDE.md).
