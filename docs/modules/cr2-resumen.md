# CR2 — Resumen final del módulo comercial y de marketing

El módulo quedó completo en cuatro fases, cada una verificada en producción antes de pasar a la siguiente.

| Fase | Módulo                                                    | ADR  |
| ---- | --------------------------------------------------------- | ---- |
| 1    | [Prospectos y cotizaciones](prospectos-cotizaciones.md)   | 0031 |
| 2    | [Bandeja y conexiones oficiales de Meta](bandeja.md)      | 0032 |
| 3    | [Calendario, campañas y promociones](marketing.md)        | 0033 |
| 4    | [Automatizaciones y panel comercial](automatizaciones.md) | 0034 |

## Recorrido cubierto

Contenido o anuncio → consulta → prospecto → cotización → reserva → servicio → seguimiento → recompra:

1. **Contenido o anuncio.** Campaña con UTM y promoción; pieza en el calendario.
2. **Consulta.** Llega por la bandeja (WhatsApp, Messenger o Instagram) o se registra a mano.
3. **Prospecto.** Se crea sin recapturar y se atribuye a la campaña.
4. **Cotización.** Lleva el pago al operador congelado, descuentos autorizados y promociones preautorizadas.
5. **Reserva.** Queda en la agenda.
6. **Servicio.** La OS se entrega y gana al prospecto.
7. **Seguimiento.** Automatizaciones de confirmación, valoración y recompra.
8. **Resultados.** Se leen en el panel comercial.

## Funcionalidades por área

- **CRM:**
  - embudo configurable;
  - responsable, tareas y próxima acción;
  - motivos de pérdida;
  - duplicados con fusión supervisada (nunca sólo por nombre);
  - segmentos por servicios, frecuencia, gasto, interés y tiempo sin visitar.
- **Bandeja:**
  - conversaciones por centro, con responsable y estado;
  - ventana de 24 h;
  - estado de entrega;
  - prospecto desde la conversación;
  - primera respuesta medida.
- **Calendario, campañas y promociones:**
  - piezas por canal y formato;
  - campañas con UTM y gasto ligado al egreso;
  - promociones con vigencia, usos y centros;
  - atribución.
- **Automatizaciones.** Seis disparadores, operativos o promocionales, con:
  - consentimiento y límites de frecuencia;
  - paro de secuencias;
  - historial;
  - ejecución diaria, manual o en vista previa.
- **Panel comercial:**
  - prospectos por etapa;
  - conversiones y tiempo de respuesta;
  - ventas y ticket;
  - clientes nuevos y recurrentes;
  - inversión;
  - costo por prospecto y por cliente;
  - ingresos atribuidos;
  - ROAS (no es rentabilidad);
  - margen.

  Cada indicador trae fórmula, origen del dato y «sin datos» cuando corresponde.

- **Seguridad:**
  - RPC con permisos explícitos, motivo y auditoría;
  - credenciales de Meta sólo en el servidor;
  - webhooks con firma verificada;
  - barrido de aislamiento multicentro sobre todas las funciones.

## Configuración necesaria

| Qué                                                        | Dónde                                                   | Estado                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| App de Meta y `META_APP_SECRET`                            | Vercel (servidor web)                                   | por configurar ([bandeja](bandeja.md#configuración-una-vez-por-negocio)) |
| `META_WEBHOOK_VERIFY_TOKEN` y webhook `/api/webhooks/meta` | Vercel y panel de la app de Meta                        | por configurar                                                           |
| `WHATSAPP_ACCESS_TOKEN` (usuario del sistema)              | Vercel                                                  | por configurar                                                           |
| `MESSENGER_PAGE_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`    | Vercel                                                  | por configurar                                                           |
| Cuentas oficiales en Integraciones y «Probar conexión»     | Web (admin)                                             | después de las variables                                                 |
| Automatizaciones                                           | Web → Automatizaciones (revisar vista previa y activar) | demo activa en CDMX; nacen inactivas                                     |
| Inversión de campañas                                      | Web → Campañas (ligar al egreso de marketing)           | manual                                                                   |

Las migraciones y los trabajos diarios de `pg_cron` se aplican solos al hacer merge: `crm-generar-pendientes` y `automatizaciones-comerciales`.

## Limitaciones por canal

| Canal                              | Funciona hoy                                                                                        | Pendiente o no disponible                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp Business                  | Recibir y responder dentro de 24 h (Cloud API), estados de entrega, prospecto desde la conversación | Plantillas aprobadas fuera de 24 h y envío automático; adjuntos; queda operativo tras configurar credenciales y verificar la cuenta |
| Messenger                          | Recibir y responder dentro de 24 h, estado «entregado»                                              | Etiquetas de mensaje fuera de 24 h; adjuntos                                                                                        |
| Instagram                          | Recibir y responder DM dentro de 24 h (cuenta profesional)                                          | Publicar contenido y responder comentarios; métricas                                                                                |
| Facebook (página)                  | Mensajes vía Messenger                                                                              | Publicar contenido y responder comentarios; métricas                                                                                |
| Meta Ads / Google Ads / TikTok Ads | Inversión registrada a mano o ligada al egreso                                                      | Lectura de gasto y resultados desde la API de anuncios (no conectada)                                                               |
| Google Business Profile, TikTok    | Canal de origen del prospecto y de la campaña                                                       | Integración («Aún no disponible» en Integraciones)                                                                                  |
| Sitio web                          | Canal de origen; enlaces con UTM                                                                    | Captura automática de UTM de un formulario propio                                                                                   |

Ninguna integración se marca como conectada sin que el servidor la verifique con Meta. Hoy la cuenta demo aparece como «pendiente de configurar».
