// Copia este archivo como include/secrets.h y llena tus datos.
// include/secrets.h está en .gitignore: nunca lo subas al repositorio.
#pragma once

// WiFi de respaldo (opcional). Déjalos vacíos para usar sólo el portal de WiFiManager o USB.
#define SECRET_WIFI_SSID ""
#define SECRET_WIFI_PASS ""

// Ubicación para Open-Meteo.
#define SECRET_LATITUDE  19.4326f
#define SECRET_LONGITUDE -99.1332f

// Zona horaria POSIX (ejemplo: Ciudad de México, sin horario de verano).
// Otras: "PST8PDT,M3.2.0,M11.1.0" (Pacífico EE. UU.), "CET-1CEST,M3.5.0,M10.5.0/3" (Madrid).
#define SECRET_TZ_POSIX "CST6"

// Contraseña de OTA (Fase 9).
#define SECRET_OTA_PASSWORD "cambia-esto"
