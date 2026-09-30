# Plan de pruebas UAT por rol (web y móvil)

Objetivo: que cada rol del Centro 1 complete su trabajo real de punta a punta, en web y en la app, antes de abrir operación; y repetirlo en cada centro nuevo.

## Cómo se corre

- **Ambiente:** producción con el centro real ya configurado (checklist completo) o staging con los mismos datos maestros. Nunca sobre la organización demo.
- **Equipos:** una computadora (Chrome) y un teléfono Android con el build vigente (perfil `preview`).
- **Evidencia:** por caso, captura del resultado y folio (OS, recibo, corte). Un caso falla si el resultado difiere, si aparece "Algo salió mal" (anota la **referencia**) o si un rol ve algo que no le corresponde.
- **Incidencias:** cada falla se registra con la plantilla _Incidencia del piloto_ en GitHub Issues (severidad S1–S4, ver [runbook](runbook.md)).
- **Salida:** 100 % de los casos S1/S2 en verde; los S3/S4 abiertos quedan en la lista de ajustes del reporte.

## Ciclo completo (criterio de salida)

Una persona por rol, en el mismo día, en web **y** móvil (alternando):

| #   | Paso                                                             | Rol                  | Resultado esperado                                                       |
| --- | ---------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| C1  | Agenda una cita con cliente y vehículo nuevos                    | Operador             | Cita en la agenda del día, sin traslapes de bahía                        |
| C2  | Recibe la cita y crea la OS desde ella                           | Operador             | OS con cliente, vehículo, bahía y servicios de la cita; folio del centro |
| C3  | Agrega un servicio sugerido y un descuento con motivo            | Operador / Encargado | Total recalculado; el descuento arriba del límite pide autorización      |
| C4  | Ejecuta: inicia y termina cada línea, registra consumo y 2 fotos | Operador             | Avance en "Operación del día"; fotos visibles en la OS                   |
| C5  | Cobra: anticipo en efectivo con cambio y resto con tarjeta       | Operador             | Recibo con cambio correcto; OS "pagada"                                  |
| C6  | Entrega la OS                                                    | Operador             | Sale de "Órdenes en curso"; suma en "Entregadas hoy"                     |
| C7  | Cierra la caja con el efectivo contado                           | Encargado            | Diferencia 0 (o explicada con motivo)                                    |
| C8  | Revisa el día en Resumen financiero, P&L y Tablero corporativo   | Admin / Contador     | Venta, cobrado y caja cuadran con C5–C7                                  |
| C9  | Revisa Dirección → Piloto                                        | Admin                | La OS del día aparece en adopción; indicadores vs línea base             |

## Casos por rol

### Operador de recepción

| #   | Caso                                                            | Web | Móvil |
| --- | --------------------------------------------------------------- | --- | ----- |
| O1  | Buscar cliente por teléfono y placa; alta sin duplicar teléfono | ☐   | ☐     |
| O2  | OS walk-in (sin cita) con 2 servicios                           | ☐   | ☐     |
| O3  | Redimir un beneficio de membresía en la OS                      | ☐   | ☐     |
| O4  | Cobro mixto y recibo compartido/impreso                         | ☐   | ☐     |
| O5  | No ve Finanzas, Dirección, Usuarios ni Centros (sin permiso)    | ☐   | ☐     |

### Encargado

| #   | Caso                                                        | Web | Móvil |
| --- | ----------------------------------------------------------- | --- | ----- |
| E1  | Autorizar descuento fuera de límite                         | ☐   | ☐     |
| E2  | Pausar y reanudar una OS; registrar incidencia              | ☐   | ☐     |
| E3  | Abrir y cerrar caja; reapertura sólo por admin              | ☐   | ☐     |
| E4  | Registrar un egreso con comprobante; aprobar según umbral   | ☐   | ☐     |
| E5  | Ver su centro y no otros (cambiar centro no muestra ajenos) | ☐   | ☐     |

### Contador

| #   | Caso                                              | Web | Móvil |
| --- | ------------------------------------------------- | --- | ----- |
| K1  | P&L del mes y drill-down a OS y egresos           | ☐   | ☐     |
| K2  | Cobranza y CxC B2B (sólo lectura, export CSV)     | ☐   | ☐     |
| K3  | Corte de caja: consulta, no cierra ni reabre      | ☐   | ☐     |
| K4  | No ve datos personales de clientes en indicadores | ☐   | ☐     |

### Comercial B2B

| #   | Caso                                              | Web | Móvil |
| --- | ------------------------------------------------- | --- | ----- |
| B1  | OS a cuenta B2B con tarifa del convenio           | ☐   | ☐     |
| B2  | Agrupar OS en documento de cobro y registrar pago | ☐   | ☐     |
| B3  | Pipeline: oportunidad a ganada                    | ☐   | ☐     |

### Admin / socio (corporativo)

| #   | Caso                                                            | Web | Móvil    |
| --- | --------------------------------------------------------------- | --- | -------- |
| A1  | Alta de usuario con rol y contraseña; desactivar y reactivar    | ☐   | consulta |
| A2  | Checklist del centro completo; línea base capturada             | ☐   | consulta |
| A3  | Importar un CSV con errores (no aplica) y uno correcto (aplica) | ☐   | —        |
| A4  | Reglas de alerta y bandeja                                      | ☐   | ☐        |
| A5  | Tableros y KPIs con el centro del piloto                        | ☐   | ☐        |

## Evidencia automatizada disponible

Antes del UAT la CI ya prueba: aislamiento entre centros y organizaciones (barrido de todas las tablas y funciones), integridad financiera de punta a punta (OS → cobro → reverso → caja → P&L), cada módulo en SQL, y e2e web por módulo (agenda, OS, ejecución, cobranza, caja, egresos, P&L, tableros, alertas, usuarios, piloto). El UAT valida lo que las pruebas no ven: el flujo real, los equipos y la comprensión de cada rol.
