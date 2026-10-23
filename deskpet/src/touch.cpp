#include "touch.h"

#include <Arduino.h>
#include <TouchDrvCSTXXX.hpp>
#include <Wire.h>

#include "board_pins.h"
#include "config.h"

namespace {

TouchDrvCST92xx touch;
volatile bool irq_pending = false;
TouchPoint last = {false, 0, 0};
uint32_t last_poll_ms = 0;

void IRAM_ATTR on_touch_irq() { irq_pending = true; }

bool take_irq() {
  noInterrupts();
  const bool pending = irq_pending;
  irq_pending = false;
  interrupts();
  return pending;
}

int16_t clamp_coord(int16_t v, int16_t max_exclusive) {
  if (v < 0) return 0;
  if (v >= max_exclusive) return max_exclusive - 1;
  return v;
}

}  // namespace

bool touch_begin() {
  // Secuencia de examples/arduino/10_Touch_CST9217 y 06_LVGL_Widgets (Waveshare).
  touch.setPins(PIN_TP_RESET, PIN_TP_INT);
  if (!touch.begin(Wire, I2C_ADDR_TOUCH, PIN_I2C_SDA, PIN_I2C_SCL)) {
    Serial.println("[touch] ERROR: CST9217 no responde en I2C (0x5A)");
    return false;
  }
  touch.setMaxCoordinates(LCD_WIDTH, LCD_HEIGHT);
  touch.setMirrorXY(TOUCH_MIRROR_X, TOUCH_MIRROR_Y);

  pinMode(PIN_TP_INT, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_TP_INT), on_touch_irq, FALLING);

  Serial.printf("[touch] %s listo, %u puntos\n", touch.getModelName(),
                static_cast<unsigned>(touch.getSupportTouchPoint()));
  return true;
}

bool touch_update(TouchPoint &out) {
  const uint32_t now = millis();
  const bool irq = take_irq();
  // Con el dedo apoyado y quieto el CST9217 puede dejar de generar interrupciones:
  // en ese caso seguimos leyendo por sondeo hasta detectar que se levantó.
  if (!irq && !(last.pressed && now - last_poll_ms >= TOUCH_POLL_MS)) {
    out = last;
    return false;
  }
  last_poll_ms = now;

  int16_t xs[1];
  int16_t ys[1];
  const uint8_t n = touch.getPoint(xs, ys, 1);

  TouchPoint cur;
  cur.pressed = n > 0;
  cur.x = cur.pressed ? clamp_coord(xs[0], LCD_WIDTH) : last.x;
  cur.y = cur.pressed ? clamp_coord(ys[0], LCD_HEIGHT) : last.y;

  const bool changed = cur.pressed != last.pressed || cur.x != last.x || cur.y != last.y;
  last = cur;
  out = cur;
  return changed;
}
