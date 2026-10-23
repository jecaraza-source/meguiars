#include "display.h"

#include <Arduino.h>
#include <Arduino_GFX_Library.h>

#include "board_pins.h"
#include "config.h"

namespace {

// Misma construcción que examples/arduino/01_HelloWorld (Waveshare).
Arduino_DataBus *bus = new Arduino_ESP32QSPI(PIN_LCD_CS, PIN_LCD_SCLK, PIN_LCD_SDIO0, PIN_LCD_SDIO1,
                                             PIN_LCD_SDIO2, PIN_LCD_SDIO3);

Arduino_CO5300 *gfx = new Arduino_CO5300(bus, PIN_LCD_RESET, 0 /* rotación */, LCD_WIDTH, LCD_HEIGHT,
                                         LCD_COL_OFFSET, 0, 0, 0);

}  // namespace

bool display_begin() {
  if (!gfx->begin(QSPI_FREQUENCY_HZ)) {
    Serial.println("[display] ERROR: gfx->begin() falló (revisa pines QSPI y reset)");
    return false;
  }
  gfx->fillScreen(RGB565_BLACK);
  gfx->setBrightness(BRIGHTNESS_NORMAL);
  Serial.printf("[display] CO5300 listo %dx%d, QSPI %ld Hz\n", gfx->width(), gfx->height(),
                static_cast<long>(QSPI_FREQUENCY_HZ));
  return true;
}

Arduino_GFX *display_gfx() { return gfx; }

void display_set_brightness(uint8_t level) { gfx->setBrightness(level); }

void display_power(bool on) {
  if (on) {
    gfx->displayOn();
  } else {
    gfx->displayOff();
  }
}

void display_round_area(DisplayArea &area) {
  if (area.x1 < 0) area.x1 = 0;
  if (area.y1 < 0) area.y1 = 0;
  if (area.x2 > LCD_WIDTH - 1) area.x2 = LCD_WIDTH - 1;
  if (area.y2 > LCD_HEIGHT - 1) area.y2 = LCD_HEIGHT - 1;
  // Inicio par.
  area.x1 &= ~1;
  area.y1 &= ~1;
  // Fin impar ⇒ ancho y alto pares. 466 es par, así que el último píxel (465) ya es impar.
  area.x2 |= 1;
  area.y2 |= 1;
}

void display_push(const DisplayArea &area, const uint16_t *pixels) {
  const int16_t w = area.x2 - area.x1 + 1;
  const int16_t h = area.y2 - area.y1 + 1;
  if ((area.x1 | area.y1 | w | h) & 1) {
    Serial.printf("[display] AVISO: área no par x=%d y=%d w=%d h=%d\n", area.x1, area.y1, w, h);
  }
  gfx->draw16bitRGBBitmap(area.x1, area.y1, const_cast<uint16_t *>(pixels), w, h);
}
