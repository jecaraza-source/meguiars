# deskpet — ESP32-S3-Touch-AMOLED-1.75

> Este archivo aplica sólo a la carpeta `deskpet/`. Es un proyecto independiente del resto del
> repositorio (Meguiar's Detail Center); las reglas de `AGENTS.md` de la raíz no aplican aquí.
>
> Forma de trabajo: una fase a la vez. Al terminar cada fase: compilar sin errores ni warnings
> nuevos, dar comandos de flasheo y monitor, criterios de aceptación físicos, commit
> `fase N: <resumen>` y esperar confirmación. Nunca inventar pines: citar el ejemplo oficial de
> Waveshare. Ante un log con errores, revisar primero pines, inicialización del CO5300 y el redondeo
> a coordenadas pares.

ESPECIFICACIÓN
Hardware

* Placa: Waveshare ESP32-S3-Touch-AMOLED-1.75
* MCU: ESP32-S3R8, 8MB PSRAM (OPI), 16MB flash
* Pantalla: AMOLED redonda 466x466, interfaz QSPI, driver CO5300
* Touch: CST9217 (I2C)
* RTC: PCF85063 (alimentado por batería vía AXP2101)
* PMU: AXP2101
* IMU: QMI8658
* Audio: codec ES8311 por I2S, bocina conectada en SPK
* Batería: LiPo 1S 3.7V 1000 mAh, conector MX1.25 (llega después; todo debe funcionar solo con USB)
* Flasheo y comunicación: USB nativo (USB-Serial/JTAG) por el USB-C
* Botones físicos: PWR y BOOT

Stack

* PlatformIO + Arduino core ESP32
* LVGL para la interfaz (buffers en PSRAM)
* Arduino_GFX para el panel CO5300
* XPowersLib para el AXP2101
* Open-Meteo para el clima (sin API key)
* WiFiManager para configurar WiFi (opcional)
* Script host en Python + pyserial para macOS

Pantallas (carrusel horizontal con swipe izquierda/derecha)

1. Ojos (pantalla principal)
2. Reloj
3. Countdown
4. Clima
5. Alarma
6. Estado (batería, WiFi, sistema)

Máquina de estados
Estados: `EYES_ACTIVE`, `EYES_SLEEP`, `SCREEN`, `ALARM_RINGING`, `COUNTDOWN_DONE`.

* `EYES_ACTIVE`: los ojos se mueven y reaccionan durante un tiempo aleatorio de 120–180 s sin interacción; después pasa a `EYES_SLEEP`. Cualquier toque reinicia ese tiempo.
* `EYES_SLEEP`: ojos cerrados, animación de "zzz", brillo ~10%.
   * Toque → `EYES_ACTIVE`.
   * Swipe → va directo a la pantalla correspondiente (`SCREEN`).
   * Más de 30 min en sleep → apaga la pantalla por completo; un toque la enciende.
* `SCREEN`: cualquier pantalla distinta de Ojos. Tras 30 s sin interacción regresa a `EYES_ACTIVE`. Cada toque reinicia el contador. Mientras el usuario edita valores (rollers del countdown o de la alarma) no aplica el timeout.
* `ALARM_RINGING` y `COUNTDOWN_DONE`: tienen prioridad sobre cualquier estado (incluso sleep o pantalla apagada). Brillo al máximo, sonido y animación. Se descartan con un toque.
* El countdown sigue corriendo aunque la UI regrese a los Ojos.
* Todas las transiciones se registran en el serial.

Fuentes de hora (en orden de prioridad)

1. NTP por WiFi (si hay credenciales y red)
2. Hora enviada por la Mac por USB serial
3. RTC PCF85063 como respaldo

Cada vez que se obtiene hora de NTP o de la Mac, se escribe en el RTC.
WiFi

* Es opcional: sin credenciales, el firmware funciona completo (la hora y el clima llegan por USB).
* Si no hay credenciales guardadas o se mantiene presionado BOOT 5 s (o desde un botón en Estado), se abre un portal cautivo de WiFiManager con SSID `deskpet-setup`.
* La conexión no es bloqueante y se reconecta sola.

REGLAS TÉCNICAS

* Estructura de módulos en `src/`: `display`, `touch`, `ui_manager`, `state_machine`, `eyes`, `screen_clock`, `screen_countdown`, `screen_weather`, `screen_alarm`, `screen_status`, `audio`, `rtc`, `power`, `net`, `serial_link`, `config`.
* Pines centralizados en `include/board_pins.h`, cada uno con un comentario de su fuente.
* Tiempos y constantes en `include/config.h`. Flag `DEBUG_FAST_TIMERS` que reduce los tiempos (ojos 10 s, regreso 5 s, sleep largo 30 s) para pruebas.
* Secretos (WiFi de respaldo, latitud, longitud, zona horaria POSIX) en `include/secrets.h` dentro de `.gitignore`; versionar `include/secrets.example.h`.
* El CO5300 requiere que las áreas de refresco empiecen y midan en coordenadas pares: implementar el callback rounder de LVGL.
* Buffers de LVGL en PSRAM, doble buffer, refresco parcial.
* Red y HTTP en tareas FreeRTOS separadas; la UI nunca se bloquea.
* Fondo negro puro en todas las pantallas (ahorro en AMOLED).
* Configuración persistente (alarma, preferencias, caché de clima) en NVS con Preferences.
* Comentarios y textos de la UI en español. Fechas en español ("vie 23 oct").
* Unidades en °C, con una constante para cambiar a °F.
* `platformio.ini`: board `esp32-s3-devkitc-1` ajustado a 16MB flash, PSRAM OPI, `ARDUINO_USB_CDC_ON_BOOT=1` y tabla de particiones de 16MB con espacio para OTA.

NOTAS DE IMPLEMENTACIÓN (agregadas durante el desarrollo)

* Fuente de pines: repositorio oficial `waveshareteam/ESP32-S3-Touch-AMOLED-1.75`, commit
  `e4344e70c2fa78a13e8a06566507f1ba8af6672a` (2026-08-21):
  `examples/arduino/libraries/Mylibrary/pin_config.h` y, como verificación cruzada, el BSP
  `firmware/brookesia/components/waveshare__esp32_s3_touch_amoled_1_75/include/bsp/esp32_s3_touch_amoled_1_75.h`.
* Waveshare compila con Arduino-ESP32 3.3.10. El PlatformIO oficial sólo trae core 2.x, así que se
  usa la plataforma comunitaria `pioarduino` (fijada a una versión) para tener core 3.3.x.
* Plataforma fijada: pioarduino `55.03.311` (Arduino-ESP32 3.3.11).
* Librerías fijadas por etiqueta de GitHub, alineadas con los ejemplos oficiales: SensorLib 0.3.1,
  XPowersLib 0.2.6, LVGL 8.4.0. GFX Library for Arduino 1.6.5: Waveshare incluye una 1.6.4
  parcheada; la 1.6.4 original no compila con core >= 3.3.6 y la 1.6.5 corrige eso sin cambiar
  `Arduino_CO5300` ni `Arduino_ESP32QSPI`.
* `Arduino_CO5300` se construye con `col_offset1 = 6` (igual que los ejemplos oficiales).
* Touch: `setMaxCoordinates(466, 466)` y `setMirrorXY(true, true)` (ejemplo `06_LVGL_Widgets` y BSP
  `mirror_x = 1, mirror_y = 1`).
* Audio (Fase 7): `pin_config.h` define dos juegos de pines I2S en conflicto (`I2S_MCK_IO 16` vs
  `MCLKPIN 42`, y DI/DO invertidos). El BSP usa MCLK 42, BCLK 9, WS 45, DOUT 8, DIN 10, PA 46.
  Verificar contra `examples/arduino/08_ES8311` antes de usarlos.
