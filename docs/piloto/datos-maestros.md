# Checklist de datos maestros por centro

Úsalo para el Centro 1 y para cada centro nuevo. La pantalla **Administración → Centros → (centro)** muestra el mismo checklist con el estado real (`center_readiness`); los puntos marcados _obligatorio_ bloquean la apertura.

Responsable general: **admin corporativo**. Cada punto indica quién junta la información y dónde se captura. Nada se inserta directo en la base de producción: todo pasa por pantalla o por el importador (vista previa → aplicar), con motivo y auditoría.

## 1. Centro — obligatorio

| Dato         | Formato                                                               | Dónde                                   | Quién             |
| ------------ | --------------------------------------------------------------------- | --------------------------------------- | ----------------- |
| Código       | 2–20 mayúsculas, números o guion (`GDL-01`); único en la organización | Administración → Centros → Nuevo centro | Admin corporativo |
| Nombre       | 2–120 caracteres                                                      | Ídem (editable en Equipo del centro)    | Admin corporativo |
| Zona horaria | IANA: `America/Mexico_City`, `America/Monterrey`, `America/Tijuana`…  | Ídem                                    | Admin corporativo |

## 2. Usuarios y roles — obligatorio

Mínimo: **1 encargado (o admin del centro)** y **1 operador de recepción** activos. Recomendado: contador (corporativo o del centro) y comercial B2B si hay flotillas.

| Dato                                                        | Formato                                                                 | Dónde                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------- |
| Nombre completo, correo (usuario), contraseña inicial (≥ 8) | Uno por persona; nunca cuentas compartidas                              | Administración → Usuarios (web) |
| Rol por centro                                              | admin_socio · encargado · operador_recepcion · contador · comercial_b2b | Ídem                            |

Las contraseñas no se importan por archivo (se capturan una por una y se entregan en persona). Al terminar el piloto, desactiva usuarios demo o de prueba.

## 3. Catálogo, precios y costos — obligatorio

Por servicio: clave, nombre, motor de ingreso, duración estándar, **precio base**, **costo directo estándar** (productos y consumibles) y, si aplica, % al operador. Precio o costo propio del centro sólo si difiere del catálogo de la organización.

- **Importador:** tipo _Catálogo de servicios_ (plantilla descargable). Columnas `precio_centro` y `costo_centro` para el centro activo.
- El checklist avisa si hay servicios sin precio o sin costo directo: el P&L y los márgenes los necesitan.
- Fuente sugerida: lista de precios vigente + costeo de insumos por servicio.

## 4. Bahías y técnicos — obligatorio

Al menos una bahía y un técnico activos en el centro. **Importador** (tipos _Bahías_ y _Técnicos_, con el centro activo) o Agenda → recursos.

## 5. Métodos de cobro — obligatorio (global)

Efectivo, tarjeta, transferencia, membresía y B2B vienen con la plataforma. Confirma con el centro qué terminal usa y cómo registra referencias.

## 6. Categorías de egreso — obligatorio

Cada organización nace con 10 categorías agrupadas por renglón del P&L. Ajusta nombres u orden en Egresos → configuración o con el importador (_Categorías de egreso_). Define también el **umbral de aprobación** de egresos del centro (Egresos → configuración).

## 7. Membresías — recomendado

Planes con precio, periodicidad, alcance (centro de origen o cualquier centro) y beneficios por periodo. **Importador** (_Planes de membresía_; beneficios `CLAVE:unidades;…`, las claves deben existir en el catálogo) o Comercial → planes.

## 8. Cuentas B2B — recomendado si hay flotillas

Cliente titular, razón social y RFC, convenio (modelo de cobro, tarifas, crédito, centros que operan) y vehículos. Se capturan en Comercial → Cuentas B2B (no hay importador: cada cuenta requiere su cliente y su convenio).

## 9. Línea base — recomendado (necesario para el reporte)

Al menos tres indicadores con fuente y periodo, capturados en la activación del centro:

| Indicador                    | Cómo obtenerlo antes del piloto                     |
| ---------------------------- | --------------------------------------------------- |
| OS entregadas por día        | Bitácora o sistema anterior, promedio de 30–90 días |
| Ticket promedio              | Ventas de servicios ÷ servicios entregados          |
| Ingreso mensual (OS)         | Ventas de servicios de un mes típico                |
| Margen bruto                 | (Ventas − costo directo) ÷ ventas                   |
| Membresías vendidas al mes   | Si ya se vendían                                    |
| Tiempo de ciclo (min)        | Muestreo de recepción → entrega                     |
| Entregas a tiempo            | Muestreo contra la hora prometida                   |
| Diferencia de caja por corte | Promedio de faltantes/sobrantes absolutos           |

## 10. Prerrequisitos de plataforma (una vez)

Del informe [F5.1](../auditoria/f5-1-piloto-centro-1.md): registro público de Supabase Auth desactivado, protección de contraseñas filtradas activa, previews de Vercel sin la base de producción, monitor externo a `/api/health`, respaldos diarios confirmados, datos demo separados del centro real y build Android vigente instalado en los equipos del centro.
