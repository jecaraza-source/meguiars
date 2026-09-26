# ADR 0016 — Recomendaciones de venta: reglas explicables, ofertas registradas y aceptación por el camino de la OS

- Estado: aceptado
- Fecha: 2026-10-05

## Contexto

Se busca subir el ticket promedio con sugerencias simples y configurables (lavado → descontaminación → pulido → protección → membresía), sin aprendizaje automático. Deben medirse la tasa de aceptación y el ingreso incremental, y nunca frenar la operación.

## Decisión

1. **Reglas declarativas por organización** (`upsell_rules`): origen (un servicio o cualquier OS) → un destino (servicio/producto **o** plan de membresía), etapa, prioridad, argumento visible, elegibilidad (canales, centros, total mínimo) y vigencia. Sólo el admin corporativo las edita, con motivo, igual que el catálogo.
2. **Ranking explicable en la base** (`private.upsell_candidates`): prioridad, luego tasa de aceptación histórica suavizada `(aceptadas + 1) ÷ (ofrecidas + 2)` de los últimos 90 días, precio y nombre. La tarjeta muestra el argumento, el servicio que la dispara y la tasa: el operador entiende por qué aparece.
3. **Oferta = sugerencia mostrada**, una por regla y OS (`upsell_offers`, única). Es el denominador de la tasa de aceptación; aceptar o rechazar (con motivo opcional) la cierra y deja de mostrarse en esa OS.
4. **Aceptar usa el camino normal de la OS** (`set_service_order_item`): precio congelado del centro o la tarifa del convenio B2B (ADR 0015), cantidad 1 y, si la OS ya estaba autorizada, adicional con motivo ("Adicional sugerido aceptado por el cliente: …") y total autorizado actualizado. Es idempotente: aceptar dos veces no duplica la línea. Una membresía aceptada registra la intención y su valor, y lleva al alta en Membresías (la venta real sigue allí).
5. **Nunca bloquea.** `upsell_suggestions` devuelve vacío sin permiso y las apps ocultan la tarjeta ante cualquier error. Las sugerencias de servicio sólo aparecen mientras la OS admite líneas (antes de terminar); al cierre, en OS terminada, sólo las que no agregan líneas (membresía).
6. **Ingreso incremental realizado:** el valor vigente de la línea agregada (subtotal − descuentos) en OS no canceladas. Si la línea se quita, deja de contar. Las fórmulas viven en `@meguiars/analytics`.

## Consecuencias

- Mostrar una OS registra ofertas (una escritura idempotente por regla). La tasa mide "aceptadas sobre mostradas al operador", no sobre lo que el operador dijo en voz alta.
- La membresía aceptada es intención; su conversión real se ve en Membresías.
- Sin personalización por cliente ni aprendizaje automático. Las reglas y la tasa histórica son el mecanismo del MVP.
