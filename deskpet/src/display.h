// Pantalla AMOLED CO5300 (QSPI) con Arduino_GFX.
#pragma once

#include <stdint.h>

class Arduino_GFX;

// Área de refresco inclusiva (x1..x2, y1..y2), igual que lv_area_t.
struct DisplayArea {
  int16_t x1;
  int16_t y1;
  int16_t x2;
  int16_t y2;
};

// Inicializa el bus QSPI y el CO5300, limpia a negro y aplica el brillo normal.
bool display_begin();

// Acceso directo a Arduino_GFX (sólo para pruebas de bring-up).
Arduino_GFX *display_gfx();

// Brillo 0–255 por comando al CO5300.
void display_set_brightness(uint8_t level);

// Enciende o apaga el panel por completo (sleep del CO5300).
void display_power(bool on);

// El CO5300 exige que cada ventana empiece en coordenada par y mida un número par de píxeles.
// Ajusta el área hacia afuera: x1/y1 a par (hacia abajo) y x2/y2 a impar (hacia arriba),
// recortado al panel. Es la misma regla que usará el rounder de LVGL.
void display_round_area(DisplayArea &area);

// Envía un bloque RGB565 (orden nativo, little endian) al panel. El área debe estar ya redondeada
// con display_round_area(); en compilaciones de depuración se avisa por serial si no lo está.
void display_push(const DisplayArea &area, const uint16_t *pixels);
