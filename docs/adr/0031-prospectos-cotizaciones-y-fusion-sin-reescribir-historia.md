# ADR 0031 — Prospectos, cotizaciones y fusión de clientes sin reescribir historia

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

CR2 pide un módulo comercial para los servicios que se venden por redes sociales. Debe cubrir:

- prospectos con canal de origen y embudo configurable;
- cotizaciones que se convierten en reserva y en OS;
- atribución de la venta al canal;
- rentabilidad del Lavado manual detallado (ADR 0026);
- segmentación;
- deduplicación con fusión supervisada, nunca sólo por nombre.

Ya existían estas piezas:

- clientes por organización con consentimiento por canal (ADR 0008 y 0014);
- el pipeline B2B/B2C premium (ADR 0017);
- la agenda (ADR 0010);
- la OS, que congela precio, costo y % del operador (ADR 0011 y 0026).

## Decisión

1. **El prospecto es una entidad propia (`leads`), distinta de la oportunidad del pipeline.**
   - Un prospecto es una consulta B2C de volumen: canal, contacto, interés y consentimiento. La oportunidad sigue siendo para B2B y clientes de alto valor.
   - Las etapas son por organización (`lead_stages`) y se pueden editar.
   - Tres hitos fijos (`contactado`, `cotizado`, `reservado`) se marcan solos al registrar el contacto, la cotización o la reserva. Así el embudo mide lo mismo aunque se renombren las etapas.
   - La historia vive en `lead_events`, que es inmutable. Las métricas salen de los eventos y de los hechos, no del estado actual.
2. **La cotización congela precio, costo y % del operador al cotizar.**
   - Al convertirse en OS (cita → OS), la línea usa el **precio cotizado** (`price_source = 'cotizacion'`, con `list_unit_price` para auditoría) y los descuentos de la cotización, con su nivel de autorización.
   - El costo y el % del operador de la OS son **los vigentes al vender**, igual que en cualquier otra OS. La cotización muestra un margen _estimado_; el margen real es el de la OS.
   - Vigencia: 15 días por omisión, máximo 90. Una cotización vencida no se puede reservar.
   - Una OS B2B no usa el precio cotizado: manda la tarifa convenida (ADR 0015).
3. **Atribución única.**
   - Un prospecto se gana con una sola OS (índice único `leads.service_order_id`).
   - El trigger `service_orders_win_lead` lo marca ganado cuando esa OS se entrega.
   - Las ventas y el margen atribuidos salen de esa OS, sin sumar la misma venta dos veces por canal.
4. **La fusión de duplicados no reescribe la historia financiera.**
   - La fusión conserva un cliente y deja el otro inactivo con `merged_into_id`.
   - Mueve vehículos, consentimiento (gana el más reciente por canal), prospectos y tareas abiertas.
   - **No** toca OS, cobros, cortes, membresías ni CxC: siguen apuntando al cliente original.
   - `private.client_family` hace que la ficha, el historial y los hechos del CRM (LTV, visitas) lean la familia completa.
   - Sólo son candidatos los pares con el mismo teléfono (últimos 10 dígitos) o el mismo email. Un nombre parecido sólo suma evidencia.
   - Una persona con permiso `clients.merge` elige cuál conservar y da un motivo. Queda en auditoría.
5. **Integraciones reales o ninguna.**
   - En esta fase ningún canal está conectado, y la pantalla lo dice ("Aún no disponible").
   - Cada conexión (fase 2: Instagram, Facebook y WhatsApp Business) usará la API oficial, con credenciales sólo en el servidor y webhooks verificados.
   - Un canal se marca "Conectada" sólo después de probarlo con una cuenta real.

## Consecuencias

- Los reportes financieros existentes no cambian con una fusión. Un reporte por cliente anterior a CR2 que no use la familia verá al duplicado por separado (ya está inactivo). Los hechos del CRM y la ficha sí lo agrupan.
- Si el precio de lista cambia después de cotizar, la OS respeta la cotización y la ficha lo advierte ("precio de lista cambió").
- El margen real puede diferir del cotizado si cambian los costos o el % del operador antes de la venta. Es intencional: el P&L refleja el costo real.
- Mientras no haya integraciones, las consultas de redes se capturan a mano. El tiempo de primera respuesta mide desde el registro, no desde que llegó el mensaje.
