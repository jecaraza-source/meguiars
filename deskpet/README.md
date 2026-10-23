# deskpet

Mascota de escritorio para la Waveshare ESP32-S3-Touch-AMOLED-1.75 (PlatformIO + Arduino core 3.x).
La especificación completa y las reglas técnicas están en [`CLAUDE.md`](CLAUDE.md).

> Este README se completa en la Fase 9. Por ahora cubre lo necesario para compilar y flashear.

## Requisitos

- PlatformIO Core (`pip install platformio`) o la extensión de VS Code.
- Cable USB-C con datos. La placa usa el USB nativo del ESP32-S3 (no hace falta driver en macOS).

## Configuración

```bash
cp include/secrets.example.h include/secrets.h   # luego edita tus datos
```

`include/secrets.h` está en `.gitignore`.

## Compilar, flashear y monitor serial

Desde la carpeta `deskpet/`:

```bash
pio run                              # compilar
pio run -t upload                    # flashear (detecta /dev/cu.usbmodem*)
pio device monitor                   # monitor serial a 115200
pio run -t upload -t monitor         # todo junto
```

Si hay varios puertos: `pio run -t upload --upload-port /dev/cu.usbmodemXXXX` y
`pio device monitor -p /dev/cu.usbmodemXXXX`.

### Modo BOOT manual (si el flasheo no conecta)

1. Mantén presionado **BOOT**.
2. Sin soltar BOOT, desconecta y vuelve a conectar el USB-C (la placa no tiene botón de reset;
   PWR va al AXP2101).
3. Suelta BOOT y vuelve a ejecutar `pio run -t upload`.
4. Al terminar, desconecta y conecta el USB para arrancar el firmware nuevo.

## Plataforma y librerías

- Plataforma `pioarduino` 55.03.311 (Arduino-ESP32 3.3.11). Waveshare compila sus ejemplos con
  core 3.3.10; la plataforma oficial de PlatformIO sólo trae core 2.x.
- Librerías fijadas por etiqueta de GitHub en `platformio.ini`.
- Pines en `include/board_pins.h`, cada uno con su fuente en los ejemplos oficiales de Waveshare.
