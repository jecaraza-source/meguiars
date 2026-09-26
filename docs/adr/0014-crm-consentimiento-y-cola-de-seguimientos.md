# ADR 0014 — CRM: consentimiento por canal, cola de seguimientos sin envío y métricas derivadas

- Estado: aceptado
- Fecha: 2026-10-03

## Contexto

El módulo comercial necesita una ficha por cliente (última visita, próxima recomendación, membresía y valor acumulado), segmentos y una cola de acciones (llamar, WhatsApp, email, renovar, ofrecer mantenimiento). El consentimiento de marketing ya existía en `clients.marketing_*` (O1). La plataforma todavía no integra proveedores de mensajería y no debe enviar nada.

## Decisión

1. **Consentimiento por canal en `contact_preferences`**, sincronizado con `clients.marketing_channels` en ambas direcciones mediante una sola función (`private.put_contact_preference`) y un trigger en `clients`. Hay una sola verdad por canal: el formulario de clientes y la ficha comercial escriben lo mismo, y la migración copia el consentimiento previo (`source = 'migracion'`). Sólo se escribe por RPC con motivo (auditado).
2. **Retirar un canal cancela los seguimientos pendientes de ese canal**, en la misma transacción. Crear un seguimiento por un canal sin consentimiento falla con `MG002`; `presencial` siempre está permitido.
3. **Cola de tareas (`crm_tasks`), no envío.** Cada tarea tiene tipo, canal, fecha, origen y resultado. La persona contacta por fuera (los enlaces `tel:`, `wa.me` y `mailto:` sólo aparecen para canales aceptados) y registra el resultado. Un futuro conector de mensajería consumirá esta cola.
4. **Métricas derivadas, no almacenadas.** Visitas, última visita, valor de servicios entregados, cobros de membresía, segmento y próxima visita se calculan al leer (`private.customer_order_facts`, `private.crm_rows`) desde OS y membresías. No hay contadores que puedan desfasarse; el costo es una consulta más pesada, acotada por centro y `limit`.
5. **Reglas con espejo en el dominio.** `private.customer_segment`, `private.next_visit_state` y `private.crm_rule` tienen su espejo en `customerSegment`, `nextVisitState` y `CRM_RULES`; la prueba de paridad SQL↔TS compara umbrales y listas.
6. **Automatización por triggers e idempotencia por llave.** Al terminar una OS sin recomendación y con un servicio recurrente se recomienda volver en 30 días al mismo servicio; toda OS terminada con próxima visita genera "ofrecer mantenimiento" 3 días antes (`dedupe_key = 'os:<id>'`) y reemplaza la tarea de mantenimiento pendiente anterior del cliente en ese centro. `generate_crm_tasks` agrega renovaciones de membresía y próximas visitas vencidas o cercanas con las mismas llaves (sin duplicar), así puede correrse a mano o por un job.

## Consecuencias

- El CRM depende de la calidad de la próxima visita capturada en la OS; la regla por defecto sólo aplica a servicios recurrentes.
- `crm_customers` y `generate_crm_tasks` son `security definer` con chequeo explícito de centro (`private.can_use_crm`); aparecen en el advisor de Supabase como esperado.
- El contador no tiene CRM (datos personales), igual que en membresías.
- Si la mensajería se integra, deberá respetar `contact_preferences` y registrar el resultado en la tarea, no crear una ruta paralela.
