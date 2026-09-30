# Módulo CR2 — Fase 3: calendario, campañas, promociones y atribución

## Alcance

La fase 3 junta la planeación de marketing con el resultado comercial. Hay paridad web y móvil para consultar; la captura se hace en web.

- **Calendario de contenido** (`/comercial/calendario`).
  - Vista semanal por canal (Instagram, Facebook, TikTok, WhatsApp, Google, sitio web, otro) y formato.
  - Cada pieza pasa por idea → borrador → programada → publicada o cancelada.
  - Se puede ligar a una campaña y a un enlace con UTM.
  - Una pieza cuya hora ya pasó sin publicarse se marca **atrasada**.
  - Marcar «publicada» exige el enlace de la publicación.
  - La plataforma **no publica en redes**: el calendario planea y registra. Publicar desde aquí necesitaría las API de publicación de cada red y queda fuera de esta fase.
- **Campañas con UTM** (`/comercial/campanas`).
  - Cada campaña tiene objetivo, canales, fechas, presupuesto y estado. Puede ser de un centro o de toda la organización.
  - Lleva `utm_source`, `utm_medium` y `utm_campaign` normalizados. `utm_campaign` es único en la organización.
  - Tiene una página de destino **https**. El detalle arma el enlace con UTM, más un `utm_content` opcional por pieza, para copiar en web o compartir desde móvil.
- **Gasto de campaña.**
  - Cada registro lleva fecha, canal, importe y nota.
  - **Se recomienda ligarlo al egreso de marketing** que ya está en Egresos. La campaña toma entonces el importe y la fecha del egreso, así el P&L y la campaña leen el mismo dinero sin capturarlo dos veces.
  - Un egreso se liga a una sola campaña, y sólo si es del grupo marketing y no está rechazado ni anulado.
  - Anular un gasto exige motivo.
- **Promociones** (`/comercial/promociones`).
  - Tienen código, porcentaje o monto fijo, vigencia (fecha del centro), servicios y centros en los que aplican, usos máximos y campaña opcional.
  - Sólo admin/socio las crea: el alta equivale a autorizar el descuento.
  - Una vez usada, la promoción ya no cambia de código, tipo ni valor.
- **Aplicar una promoción** en una cotización o en una OS (no B2B), en web y móvil.
  - Se valida que esté activa, vigente, que aplique en el centro, que quede cupo y que el documento no tenga ya otra promoción.
  - Si la promoción limita servicios, el descuento se aplica sólo a esas líneas.
  - Queda como descuento con origen «promoción», con el nivel de autorización y el autor de la promoción.
  - Los descuentos manuales posteriores calculan su nivel sin contar lo ya preautorizado (membresía o promoción).
- **Atribución.**
  - Un prospecto se liga a una campaña a mano (tarjeta «Seguimiento» del prospecto).
  - También se liga solo al aplicar en su cotización una promoción de la campaña, si todavía no tenía campaña.

Decisiones en [ADR 0033](../adr/0033-campanas-atribucion-y-promociones-preautorizadas.md).

## Indicadores de campaña (`public.campaign_facts`)

Cohorte: prospectos atribuidos que **se registraron en el periodo**, en los centros visibles. La inversión es el gasto no anulado con fecha dentro del periodo. Ventas son las OS entregadas que ganaron a esos prospectos.

| KPI                             | Fórmula                                                                                                                            | «Sin datos» cuando                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Inversión                       | Σ gasto del periodo (sin anulados)                                                                                                 | no hay campañas                   |
| Prospectos atribuidos           | prospectos del periodo ligados a una campaña                                                                                       | —                                 |
| Costo por prospecto             | inversión ÷ prospectos atribuidos                                                                                                  | sin inversión o sin prospectos    |
| Prospecto → venta               | prospectos que compraron ÷ prospectos × 100                                                                                        | sin prospectos                    |
| Costo por venta                 | inversión ÷ prospectos que compraron                                                                                               | sin inversión o sin ventas        |
| Ventas atribuidas               | Σ total de las OS entregadas de esos prospectos                                                                                    | sin prospectos                    |
| Ventas por peso invertido       | ventas atribuidas ÷ inversión. **No es utilidad**                                                                                  | sin inversión                     |
| Margen después de la inversión  | Σ (total − costo directo, incluido el pago al operador) de las ventas atribuidas − inversión. Sin gastos de personal ni operativos | sin ventas ni inversión           |
| Presupuesto ejercido            | inversión ÷ presupuesto de las campañas con presupuesto × 100                                                                      | ninguna campaña tiene presupuesto |
| Usos / descuento de promociones | cotizaciones y OS con una promoción de la campaña (sin anulados) y la suma del descuento                                           | sin usos (descuento)              |

Reglas de presentación:

- No se muestra ROAS como utilidad. «Ventas por peso invertido» lleva la nota «No es utilidad» y el margen después de la inversión se muestra aparte (puede ser negativo).
- Cada tarjeta muestra su fórmula. Sin denominador se lee «sin datos», nunca 0.
- La atribución es de **último contacto registrado**: un prospecto tiene a lo más una campaña. No hay atribución multitoque ni lectura automática de UTM desde el sitio web (ver pendientes).

## Seguridad y permisos

| Acción                                      | Quién                                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Ver calendario, campañas y promociones      | `marketing.read`: admin, encargado, recepción, contador y comercial del centro               |
| Crear o editar campañas, gasto y calendario | `marketing.manage`: admin, encargado y comercial del centro (campaña de organización: admin) |
| Crear o editar promociones                  | `promotions.manage`: admin/socio de la organización                                          |
| Aplicar una promoción                       | quien puede editar la cotización (`leads.use`) o descontar en la OS                          |
| Indicadores de campaña                      | `commercial.metrics.read` (el contador ve cifras, no datos personales)                       |

- Todas las escrituras son RPC `security definer` con verificación explícita. `authenticated` no tiene `insert`, `update` ni `delete` sobre las tablas.
- Los cambios llevan motivo y quedan en `audit_log`.
- Una promoción limitada a otros centros no se ve. La campaña de otro centro se oculta en la lista de promociones.
- El barrido multicentro (`cross_tenant.test.sql`) cubre las RPC nuevas.

## Modelo de datos (`20261025000000_marketing_campaigns.sql`)

```
campaigns (organización, centro?) ─< campaign_spend ─ expenses?
campaigns ─< content_posts · campaigns ─< promotions
leads.campaign_id · quote_discounts / service_order_discounts .source = 'promocion', .promotion_id
```

| Tabla            | Notas                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `campaigns`      | Nombre, objetivo, canales, fechas, presupuesto, estado, UTM (único por organización), página https, notas, versión.    |
| `campaign_spend` | Fecha, importe, canal, egreso ligado (único), nota, anulación con motivo.                                              |
| `content_posts`  | Centro, campaña, canal, formato, título, texto, fecha y hora planeada, responsable, enlace, estado y enlace publicado. |
| `promotions`     | Código (mayúsculas, único), tipo, valor, servicios, centros, vigencia, usos máximos, activa, condiciones, autor.       |

## Web y móvil

| Pantalla        | Web                                                                | Móvil                                                         |
| --------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| Calendario      | semana, alta y edición de piezas, cambio de estado                 | semana, marcar publicada con enlace, compartir enlace con UTM |
| Campañas        | KPIs por periodo, tabla, alta                                      | KPIs por periodo y lista                                      |
| Campaña         | KPIs, enlace UTM, gasto (con egreso), promociones, piezas, edición | datos, enlace UTM para compartir, promociones                 |
| Promociones     | lista y alta (admin)                                               | lista                                                         |
| Cotización / OS | aplicar código                                                     | aplicar código                                                |
| Prospecto       | elegir campaña                                                     | —                                                             |

Los cálculos de KPIs y la semana del calendario están en `lib/marketing.ts`, idéntico en web y móvil (prueba de paridad).

## Datos demo

El seed trae:

- la campaña «Lavado manual del mes» del Centro CDMX, con $1,200 de gasto y una pieza programada;
- la promoción **LAVA15** (15 % en lavado manual detallado);
- la prospecta Mariana Soto atribuida a la campaña.

## Pruebas

- SQL (`supabase/tests/marketing.test.sql`):
  - permisos por rol;
  - UTM único y https;
  - gasto ligado a egreso (importe del egreso, un egreso por campaña, grupo marketing);
  - calendario (publicada exige enlace, publicadas no se editan);
  - promociones:
    - cotización $940;
    - OS $340;
    - usos máximos;
    - una por documento;
    - otro centro;
    - inmutable una vez usada;
  - atribución;
  - `campaign_facts` leído por el contador;
  - auditoría.
- Barrido multicentro.
- Unitarias:
  - UTM, estado de promoción y acciones del calendario;
  - validación;
  - KPIs con «sin datos»;
  - repositorio;
  - paridad web/móvil.
- E2E (servidor simulado):
  - KPIs con fórmula y sin ROAS;
  - UTM inválido rechazado antes de la base;
  - alta de campaña;
  - enlace con UTM;
  - gasto ligado a egreso;
  - pieza atrasada publicada con enlace;
  - hora del centro a UTC;
  - LAVA15 en cotización ($450 → $382.50) con atribución automática;
  - alta de promoción por admin;
  - contador de sólo lectura.

## Limitaciones conocidas

- **No se publica en redes ni se lee el gasto de Meta Ads, Google Ads o TikTok Ads.** El gasto se registra a mano o ligado al egreso. Leerlo de las plataformas requiere sus API de anuncios (Marketing API de Meta, Google Ads API, TikTok Marketing API), con app revisada y permisos `ads_read`. Queda para cuando se conecten oficialmente. No se simula.
- **Los UTM no se leen solos.** No hay formulario web propio que capture `utm_*` al llegar un prospecto. La atribución es manual o por promoción. Los mensajes de la bandeja tampoco traen UTM.
- **Una promoción copiada de la cotización a la OS** llega a la OS como descuento manual con el mismo importe (así se copian hoy los descuentos). La atribución no se pierde porque vive en el prospecto. El uso ya se contó en la cotización.
- Presupuesto por canal y comparativo contra periodos anteriores: fase 4 (tablero de analítica).

## Pendientes (fase 4)

- Automatizaciones: recordatorios de piezas atrasadas, seguimiento de cotizaciones y vencimiento de promociones.
- Tablero de analítica comercial con tendencia por campaña y canal.
