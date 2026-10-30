# ADR 0051 — Reporte comercial redactado por IA

- Estado: aceptado
- Fecha: 2026-10-30

## Contexto

El dueño pidió que la IA arme los reportes comerciales. Los KPIs comerciales ya tienen definición única en `@meguiars/analytics` (ADR 0017 y reglas de KPIs) y se muestran en Reportes comerciales (web y móvil). Ya usamos Claude en el asistente de WhatsApp (ADR 0039) con la llave `ANTHROPIC_API_KEY` sólo en el servidor web.

## Decisión

1. **La IA redacta, no calcula.** El servidor arma las cifras con `loadCommercialReport` (mismas fórmulas y formato que la pantalla) y Claude (`claude-opus-5-5`, salida estructurada) devuelve resumen, hallazgos, riesgos y acciones. Las instrucciones prohíben inventar o recalcular cifras.
2. **Dos pasos en la base** (`commercial_ai_reports`, migración 20261113000000): `start_commercial_ai_report` con la sesión del usuario valida que pueda ver las métricas de todos los centros del alcance (`private.can_read_commercial_metrics`) y deja el reporte pendiente; `complete_commercial_ai_report` / `fail_commercial_ai_report` sólo con `service_role`, así nadie publica un texto propio como si fuera de la IA. Historial inmutable; lo ven quienes pueden ver las métricas de todos sus centros.
3. **Costo acotado:** se genera sólo cuando alguien lo pide (botón), idempotente por `request_id` y con límite de 20 por persona al día.
4. **Paridad:** web llama la server action; móvil llama `POST /api/comercial/reporte-ia` con su sesión (Bearer). Ambos usan `generateCommercialAiReport` y muestran el mismo texto (`COMMERCIAL_AI_COPY`, `presentCommercialAiReport`).

## Consecuencias

- Requiere `ANTHROPIC_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel (Production); sin ellas la pantalla avisa que la IA no está configurada.
- El texto puede equivocarse al interpretar: se muestra con la leyenda de revisar las cifras de la tabla.
- Envío automático por correo de este texto: pendiente (se puede sumar a los reportes programados).
