// Tiempos y constantes globales de deskpet.
#pragma once

#include <stdint.h>

// Pon DEBUG_FAST_TIMERS en 1 (o agrega -DDEBUG_FAST_TIMERS=1 en build_flags) para pruebas:
// ojos 10 s, regreso 5 s, sleep largo 30 s. En producción debe quedar en 0.
#ifndef DEBUG_FAST_TIMERS
#define DEBUG_FAST_TIMERS 0
#endif

constexpr const char *FW_VERSION = "0.1.0-fase1";

// ---------------------------------------------------------------------------
// Máquina de estados (se usa desde la Fase 2)
// ---------------------------------------------------------------------------
#if DEBUG_FAST_TIMERS
constexpr uint32_t EYES_IDLE_MIN_MS        = 10UL * 1000;  // ojos activos antes de dormir
constexpr uint32_t EYES_IDLE_MAX_MS        = 10UL * 1000;
constexpr uint32_t SCREEN_TIMEOUT_MS       = 5UL * 1000;   // regreso a los ojos
constexpr uint32_t SLEEP_DISPLAY_OFF_MS    = 30UL * 1000;  // sleep largo → pantalla apagada
#else
constexpr uint32_t EYES_IDLE_MIN_MS        = 120UL * 1000;
constexpr uint32_t EYES_IDLE_MAX_MS        = 180UL * 1000;
constexpr uint32_t SCREEN_TIMEOUT_MS       = 30UL * 1000;
constexpr uint32_t SLEEP_DISPLAY_OFF_MS    = 30UL * 60 * 1000;
#endif

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------
constexpr uint8_t BRIGHTNESS_NORMAL = 200;  // 0–255 (el ejemplo oficial usa 200)
constexpr uint8_t BRIGHTNESS_SLEEP  = 26;   // ~10 %
constexpr uint8_t BRIGHTNESS_MAX    = 255;
constexpr int32_t QSPI_FREQUENCY_HZ = 40000000;  // valor por defecto de Arduino_ESP32QSPI

// ---------------------------------------------------------------------------
// Touch
// ---------------------------------------------------------------------------
constexpr uint32_t TOUCH_POLL_MS = 10;  // lectura mientras hay un dedo apoyado

// ---------------------------------------------------------------------------
// Unidades
// ---------------------------------------------------------------------------
constexpr bool USE_FAHRENHEIT = false;  // °C por defecto; true para °F
