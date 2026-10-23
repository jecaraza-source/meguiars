// Touch CST9217 por I2C (SensorLib).
#pragma once

#include <stdint.h>

struct TouchPoint {
  bool pressed;
  int16_t x;  // coordenadas de pantalla (0..465), ya con espejo aplicado
  int16_t y;
};

// Inicializa el bus I2C compartido y el CST9217. Devuelve false si no responde.
bool touch_begin();

// Lectura no bloqueante. Sólo consulta el I2C si hubo interrupción o si hay un dedo apoyado
// (cada TOUCH_POLL_MS). Devuelve true si el estado cambió o el punto se movió.
bool touch_update(TouchPoint &out);
