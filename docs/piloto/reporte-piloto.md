# Reporte del piloto vs línea base (plantilla)

Se llena al cierre del piloto (sugerido: 4 semanas) con los datos de **Dirección → Piloto** (periodo del piloto, centro del piloto) y del P&L. Resultado: decisión de rollout y lista de ajustes.

## 1. Datos generales

| Campo                         | Valor            |
| ----------------------------- | ---------------- |
| Centro                        |                  |
| Periodo del piloto            | del ____ al ____ |
| Línea base (periodo y fuente) |                  |
| Usuarios por rol              |                  |

## 2. Modelo económico y operación vs línea base

Copia la tabla "Resultado vs línea base" de Dirección → Piloto (periodo completo).

| Indicador                    | Línea base | Piloto | Δ   | Lectura |
| ---------------------------- | ---------- | ------ | --- | ------- |
| OS entregadas por día        |            |        |     |         |
| Ticket promedio              |            |        |     |         |
| Ingreso mensual (OS)         |            |        |     |         |
| Margen bruto                 |            |        |     |         |
| Membresías vendidas al mes   |            |        |     |         |
| Tiempo de ciclo (min)        |            |        |     |         |
| Entregas a tiempo            |            |        |     |         |
| Diferencia de caja por corte |            |        |     |         |

## 3. Adopción de la plataforma

| Indicador                                        | Valor | Meta sugerida                |
| ------------------------------------------------ | ----- | ---------------------------- |
| Usuarios activos por día (promedio / máximo)     |       | ≥ 80 % del personal en turno |
| OS creadas en la plataforma vs OS reales del día |       | 100 %                        |
| OS canceladas                                    |       | explicadas                   |
| Cortes de caja cerrados / días operados          |       | 100 %                        |
| Errores de la app por día                        |       | tendencia a 0                |
| Incidencias S1 / S2 / S3 / S4                    |       | 0 S1 abiertas                |

## 4. Membresías y datos

- Membresías vendidas y redimidas; redenciones en otro centro (si aplica).
- Calidad de datos: clientes con teléfono, vehículos con placa, OS con fotos, servicios sin costo directo (checklist).

## 5. Hallazgos

Qué funcionó, qué no y por qué (con referencias a incidencias).

## 6. Ajustes antes del rollout

| #   | Ajuste | Tipo (datos / proceso / producto) | Severidad | Responsable | Estado |
| --- | ------ | --------------------------------- | --------- | ----------- | ------ |
|     |        |                                   |           |             |        |

Candidatos conocidos al iniciar el piloto (revisar con los datos reales):

- Staging propio y e2e dentro de la CI (F5.1 H12–H13).
- Enmascarar datos personales en la auditoría (F5.1 H14).
- Importador de cuentas B2B y de clientes, si el volumen lo justifica.

## 7. Decisión

☐ Rollout a Centro 2 · ☐ Extender el piloto · ☐ Ajustes mayores antes de continuar

Firmas: admin corporativo, encargado del centro, responsable de la plataforma.
