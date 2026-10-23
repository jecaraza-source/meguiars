// deskpet — Fase 1: bring-up de pantalla y touch.
//
// Dibuja una rueda de color circular de prueba y un punto que sigue al dedo.
// Las coordenadas del touch se imprimen por serial.
#include <Arduino.h>
#include <esp_heap_caps.h>
#include <math.h>

#include "board_pins.h"
#include "config.h"
#include "display.h"
#include "touch.h"

namespace {

constexpr int16_t DOT_RADIUS = 14;
constexpr uint32_t COORD_LOG_INTERVAL_MS = 50;

uint16_t *background = nullptr;  // rueda de color completa (PSRAM), para restaurar bajo el punto
uint16_t *scratch = nullptr;     // bloque de composición (PSRAM)

uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return static_cast<uint16_t>(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}

// HSV → RGB565 con h en [0, 360), s y v en [0, 1].
uint16_t hsv565(float h, float s, float v) {
  const float c = v * s;
  const float hp = h / 60.0f;
  const float x = c * (1.0f - fabsf(fmodf(hp, 2.0f) - 1.0f));
  float r = 0, g = 0, b = 0;
  switch (static_cast<int>(hp)) {
    case 0: r = c; g = x; break;
    case 1: r = x; g = c; break;
    case 2: g = c; b = x; break;
    case 3: g = x; b = c; break;
    case 4: r = x; b = c; break;
    default: r = c; b = x; break;
  }
  const float m = v - c;
  return rgb565(static_cast<uint8_t>((r + m) * 255), static_cast<uint8_t>((g + m) * 255),
                static_cast<uint8_t>((b + m) * 255));
}

// Rueda de color: tono por ángulo, saturación por distancia al centro, negro puro fuera del círculo.
// Un anillo blanco delgado en el borde permite verificar que el círculo no está recortado ni
// desplazado (offset de columna del CO5300).
void build_color_wheel() {
  const float cx = (LCD_WIDTH - 1) / 2.0f;
  const float cy = (LCD_HEIGHT - 1) / 2.0f;
  const float radius = LCD_WIDTH / 2.0f;
  for (int16_t y = 0; y < LCD_HEIGHT; ++y) {
    for (int16_t x = 0; x < LCD_WIDTH; ++x) {
      const float dx = x - cx;
      const float dy = y - cy;
      const float d = sqrtf(dx * dx + dy * dy);
      uint16_t color = 0x0000;
      if (d <= radius - 4) {
        float hue = atan2f(dy, dx) * 180.0f / static_cast<float>(M_PI);
        if (hue < 0) hue += 360.0f;
        color = hsv565(hue, fminf(d / (radius - 4), 1.0f), 1.0f);
      } else if (d <= radius - 1) {
        color = 0xFFFF;
      }
      background[y * LCD_WIDTH + x] = color;
    }
  }
}

DisplayArea dot_area(int16_t cx, int16_t cy) {
  DisplayArea a = {static_cast<int16_t>(cx - DOT_RADIUS), static_cast<int16_t>(cy - DOT_RADIUS),
                   static_cast<int16_t>(cx + DOT_RADIUS), static_cast<int16_t>(cy + DOT_RADIUS)};
  display_round_area(a);
  return a;
}

bool overlaps(const DisplayArea &a, const DisplayArea &b) {
  return a.x1 <= b.x2 && b.x1 <= a.x2 && a.y1 <= b.y2 && b.y1 <= a.y2;
}

// Compone el fondo de `area` y, si `draw_dot`, el punto (negro con borde blanco) y lo envía.
void render_area(const DisplayArea &area, bool draw_dot, int16_t dot_x, int16_t dot_y) {
  const int16_t w = area.x2 - area.x1 + 1;
  const int32_t r_outer2 = DOT_RADIUS * DOT_RADIUS;
  const int32_t r_inner2 = (DOT_RADIUS - 3) * (DOT_RADIUS - 3);
  for (int16_t y = area.y1; y <= area.y2; ++y) {
    uint16_t *row = scratch + (y - area.y1) * w;
    memcpy(row, background + y * LCD_WIDTH + area.x1, w * sizeof(uint16_t));
    if (!draw_dot) continue;
    const int32_t dy = y - dot_y;
    for (int16_t x = area.x1; x <= area.x2; ++x) {
      const int32_t dx = x - dot_x;
      const int32_t d2 = dx * dx + dy * dy;
      if (d2 <= r_inner2) {
        row[x - area.x1] = 0x0000;
      } else if (d2 <= r_outer2) {
        row[x - area.x1] = 0xFFFF;
      }
    }
  }
  display_push(area, scratch);
}

TouchPoint shown = {false, 0, 0};  // punto dibujado actualmente
uint32_t last_coord_log_ms = 0;
uint32_t frames = 0;
uint32_t fps_window_ms = 0;

void halt(const char *why) {
  for (;;) {
    Serial.printf("[fase1] DETENIDO: %s\n", why);
    delay(2000);
  }
}

}  // namespace

void setup() {
  Serial.begin(115200);
  // No esperamos al monitor serial: la placa debe arrancar aunque no haya una PC conectada.
  delay(300);
  Serial.printf("\n[deskpet] firmware %s — Fase 1 (bring-up)\n", FW_VERSION);
  Serial.printf("[deskpet] PSRAM %u bytes, libre %u\n", static_cast<unsigned>(ESP.getPsramSize()),
                static_cast<unsigned>(ESP.getFreePsram()));

  const size_t frame_bytes = static_cast<size_t>(LCD_WIDTH) * LCD_HEIGHT * sizeof(uint16_t);
  background = static_cast<uint16_t *>(heap_caps_malloc(frame_bytes, MALLOC_CAP_SPIRAM));
  scratch = static_cast<uint16_t *>(heap_caps_malloc(frame_bytes, MALLOC_CAP_SPIRAM));
  if (!background || !scratch) halt("sin PSRAM (revisa memory_type qio_opi en platformio.ini)");

  if (!display_begin()) halt("pantalla");

  const uint32_t t0 = millis();
  build_color_wheel();
  DisplayArea full = {0, 0, LCD_WIDTH - 1, LCD_HEIGHT - 1};
  display_push(full, background);
  Serial.printf("[fase1] rueda de color dibujada en %lu ms\n", static_cast<unsigned long>(millis() - t0));

  if (!touch_begin()) halt("touch");
  Serial.println("[fase1] toca la pantalla: el punto debe seguir al dedo");
}

void loop() {
  TouchPoint tp;
  if (touch_update(tp)) {
    const DisplayArea old_area = dot_area(shown.x, shown.y);
    const DisplayArea new_area = dot_area(tp.x, tp.y);

    if (shown.pressed && tp.pressed && overlaps(old_area, new_area)) {
      // Movimiento corto: un solo bloque que cubre la posición anterior y la nueva.
      DisplayArea u = {min(old_area.x1, new_area.x1), min(old_area.y1, new_area.y1),
                       max(old_area.x2, new_area.x2), max(old_area.y2, new_area.y2)};
      render_area(u, true, tp.x, tp.y);
    } else {
      if (shown.pressed) render_area(old_area, false, 0, 0);       // borrar el anterior
      if (tp.pressed) render_area(new_area, true, tp.x, tp.y);     // dibujar el nuevo
    }
    shown = tp;
    ++frames;

    const uint32_t now = millis();
    if (!tp.pressed) {
      Serial.printf("[touch] suelto en x=%d y=%d\n", tp.x, tp.y);
    } else if (now - last_coord_log_ms >= COORD_LOG_INTERVAL_MS) {
      last_coord_log_ms = now;
      Serial.printf("[touch] x=%d y=%d\n", tp.x, tp.y);
    }
  }

  // Actualizaciones del punto por segundo, como referencia de latencia.
  const uint32_t now = millis();
  if (now - fps_window_ms >= 1000) {
    if (frames > 0) Serial.printf("[fase1] %lu actualizaciones/s\n", static_cast<unsigned long>(frames));
    frames = 0;
    fps_window_ms = now;
  }
  delay(1);
}
