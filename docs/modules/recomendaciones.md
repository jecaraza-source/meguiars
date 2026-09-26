# Módulo C4 — Comercial / Recomendaciones de venta (upselling y cross-selling)

## Alcance

Sugerencias simples, explicables y configurables para subir el ticket promedio, con paridad web y móvil:

- **Reglas:** servicio origen (o cualquier OS) → servicio/producto sugerido o plan de membresía. Cada regla tiene etapa (diagnóstico, cierre o ambas), prioridad, argumento para el cliente, elegibilidad (canales, centros, total mínimo) y vigencia.
- **Sugerencias en la OS** durante el diagnóstico (OS abierta o autorizada) y al cierre (en proceso, pausada o terminada), en una tarjeta discreta y plegable.
- **Registro** de cada sugerencia ofrecida, aceptada o rechazada (con motivo opcional) y de su valor incremental.
- **Indicadores:** tasa de aceptación, ingreso incremental, incremento por OS y membresías aceptadas, por regla y centro, del centro activo o consolidados.

Ejemplo sembrado: lavado → descontaminación → pulido → protección cerámica → membresía PLUS, lavado → membresía CARE y aromatizante al entregar.

Decisiones en [ADR 0016](../adr/0016-recomendaciones-reglas-explicables.md). **Sin aprendizaje automático** (fuera de alcance).

## Modelo de datos (`20261005000000_upselling.sql`)

```
upsell_rules (organización) ─ origen: services? ─ destino: services | membership_plans
upsell_offers (una por regla y OS) ─ service_orders ─ accepted_item_id → service_order_items
```

| Tabla           | Notas                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upsell_rules`  | Un solo destino (servicio o plan), distinto del origen. `channels` ⊆ {b2c, membresia, b2b}; `center_ids` null = todos; prioridad 1–100; `pitch` ≤ 280 caracteres. |
| `upsell_offers` | Precio mostrado, estado (`ofrecida`, `aceptada`, `rechazada`), motivo de rechazo, línea agregada y valor al aceptar, quién y cuándo. Única por (OS, regla).       |

## Reglas

| Regla             | Detalle                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elegibilidad      | Activa, vigente hoy (fecha del centro), de la etapa de la OS, del centro, del canal y con el total mínimo. El origen debe estar en la OS.                                                                             |
| Destino servicio  | Disponible en el catálogo del centro, aún no está en la OS y la OS admite líneas (antes de terminar). El precio mostrado es el que tendría la línea (centro o convenio B2B).                                          |
| Destino membresía | Plan activo y a la venta, OS no B2B y el vehículo sin membresía vigente.                                                                                                                                              |
| Ranking           | Prioridad; tasa de aceptación suavizada `(aceptadas + 1) ÷ (ofrecidas + 2)` de los últimos 90 días (sin contar la OS actual); precio; nombre. Máximo 3 por OS. `private.upsell_score` ↔ `acceptanceScore`.            |
| Oferta            | Mostrar la sugerencia la registra como ofrecida (una vez por regla y OS). Aceptada o rechazada deja de mostrarse en esa OS.                                                                                           |
| Aceptar           | Agrega 1 unidad por `set_service_order_item`: precio congelado; en OS autorizada, adicional con motivo y total autorizado actualizado. Idempotente. La membresía registra la intención y abre el alta con el cliente. |
| Nunca bloquea     | Sin permiso, la RPC devuelve vacío; ante cualquier error la tarjeta no se muestra. Las decisiones sólo afectan a la sugerencia.                                                                                       |
| Auditoría         | `audit_row` + `require_change_reason` en reglas y ofertas; la línea agregada queda auditada con su motivo.                                                                                                            |

## Indicadores (`@meguiars/analytics`)

| KPI                  | Fórmula                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| Tasa de aceptación   | Aceptadas ÷ ofrecidas × 100.                                                          |
| Ingreso incremental  | Σ valor vigente (subtotal − descuentos) de las líneas agregadas, en OS no canceladas. |
| Incremento por OS    | Ingreso incremental ÷ OS con al menos una sugerencia.                                 |
| Membresías aceptadas | Σ precio del plan de las sugerencias de membresía aceptadas (intención).              |

Fuente: `upsell_metric_facts(centers[], from, to)`, por regla y centro, sin datos personales.

## Permisos

| Capacidad       | Roles                                           | Qué permite                                              |
| --------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `orders.write`  | admin_socio, encargado, operador                | Ver, aceptar y rechazar sugerencias en la OS.            |
| `upsell.read`   | admin_socio, encargado, comercial_b2b, contador | Indicadores de conversión y lista de reglas.             |
| `upsell.manage` | admin_socio corporativo                         | Crear, editar, activar y desactivar reglas (con motivo). |

## RPC

| RPC                                        | Uso                                                     |
| ------------------------------------------ | ------------------------------------------------------- |
| `upsell_suggestions(order, limit?)`        | Sugerencias rankeadas; registra las mostradas.          |
| `accept_upsell(order, version, rule)`      | Agrega la línea (o registra la membresía). Idempotente. |
| `reject_upsell(order, rule, reason?)`      | Descarta la sugerencia en la OS.                        |
| `upsert_upsell_rule(…, reason)`            | Alta y edición de reglas.                               |
| `upsell_metric_facts(centers[], from, to)` | Hechos de conversión.                                   |

Errores: `MG002` → regla visible (ya rechazada, la OS no admite líneas), `40001` → la OS cambió, `42501` → permiso, `22023` → validación.

## Pantallas

| Web                            | Móvil                              | Contenido                                                                                      |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/ordenes/[id]` (`UpsellCard`) | `OrderDetailScreen` (`UpsellCard`) | Hasta 3 sugerencias con argumento y motivo; "Sí, agregar", "Vender membresía" y "No, gracias". |
| `/comercial/recomendaciones`   | `UpsellScreen`                     | Indicadores, conversión por regla y reglas (alta y edición para el admin).                     |

## Datos seed

Servicio `DESC-ARC` (descontaminación) y 6 reglas activas con la cadena de ejemplo.

## Variables de entorno

Ninguna nueva.

## Pendientes

- Ranking personalizado por historial del cliente (hoy, sólo reglas y tasa histórica).
- Conversión real de las membresías aceptadas (enlazar la membresía creada a la oferta).
