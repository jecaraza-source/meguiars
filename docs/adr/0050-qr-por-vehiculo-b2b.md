# ADR 0050 — QR por vehículo de flotilla B2B

- Estado: aceptado
- Fecha: 2026-10-30

## Contexto

Los vehículos de empresas con convenio (ADR 0015) llegan al centro y recepción tiene que buscar la cuenta y el vehículo para abrir la OS a cuenta. El dueño pidió un ticket o QR para que el cliente B2B use su convenio sin fricción, y eligió un QR por vehículo.

## Decisión

1. **Código:** cada fila de `b2b_vehicles` tiene `qr_token` (uuid aleatorio, único). El QR contiene el enlace `<web>/q/b2b/<token>`; no lleva datos del cliente ni precios.
2. **Lectura:** `b2b_vehicle_by_qr(center, token)` (security invoker, con la RLS de B2B) devuelve la cuenta, el vehículo y si se puede usar en el centro (cuenta activa, vehículo activo y convenio vigente habilitado según `b2b_accounts_for_center`). No aplica precios: la tarifa la sigue decidiendo `create_b2b_service_order`.
3. **Uso:** web abre `/q/b2b/<token>` (cámara del teléfono o lector de códigos en el campo de la OS nueva) y lleva a `/ordenes/nueva?modo=b2b&qr=<token>` con la cuenta y el vehículo elegidos. Móvil escanea con `expo-camera` desde "Nueva OS → A cuenta B2B".
4. **Impresión:** `/comercial/b2b/[id]/qr` muestra las calcomanías para imprimir (`b2b_vehicle_qr_codes`, roles que ven la cuenta).
5. **Robo o pérdida:** `regenerate_b2b_vehicle_qr` (gestor B2B del centro de la cuenta, con motivo y auditoría) cambia el código y el anterior deja de funcionar.

## Consecuencias

- Dependencias nuevas: `qrcode` en web (genera el SVG en el servidor, sin red) y `expo-camera` en móvil (módulo oficial de Expo). Móvil necesita un build nuevo, no basta OTA.
- Un QR sin sesión no abre nada: lleva al login y luego la RLS decide.
