# Runbook del piloto: soporte, incidencias, respaldos y rollback

## Severidades y tiempos

| Severidad      | Qué es                                             | Ejemplos                                                                                                      | Respuesta | Solución o mitigación        |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------- |
| **S1 Crítica** | No se puede operar o hay riesgo de datos           | La app no abre; no se puede cobrar ni crear OS; un usuario ve datos de otro centro; totales o caja no cuadran | 30 min    | 4 h (rollback si hace falta) |
| **S2 Alta**    | Un flujo importante falla y hay alternativa manual | No sube fotos; un reporte no carga; un rol no puede una acción que le toca                                    | 2 h       | 1 día hábil                  |
| **S3 Media**   | Molestia con alternativa                           | Texto confuso, un filtro no funciona                                                                          | 1 día     | Siguiente versión            |
| **S4 Baja**    | Mejora                                             | Sugerencias de flujo o de diseño                                                                              | Semanal   | Priorizar en el backlog      |

Cualquier sospecha de **fuga de datos entre centros** o de **descuadre financiero** es S1 aunque parezca menor.

## Flujo de soporte

1. **Nivel 1: encargado del centro.** Recibe el reporte del usuario, pide la **referencia** que muestra la pantalla "Algo salió mal", la pantalla y la hora, y reintenta una vez.
2. **Nivel 2: responsable de la plataforma.** Registra la incidencia en GitHub Issues con la plantilla _Incidencia del piloto_ (etiquetas `piloto` + severidad), busca la referencia en Vercel → Logs (`digest`) y en Administración → Centros → errores recientes, y reproduce.
3. **Nivel 3: desarrollo.** Corrige en una rama con PR (CI verde), despliega y cierra la incidencia con la causa y la prueba que la cubre.

**Escalamiento:** S1 se avisa de inmediato por teléfono o chat al responsable de la plataforma y al admin corporativo; si en 1 h no hay mitigación, se hace rollback (abajo). S2 sin avance en un día hábil sube a S1.

## Monitoreo diario (durante el piloto)

- `/api/health` en un monitor externo cada 5 min (200 = sano; 503 = Supabase o configuración).
- Dirección → **Piloto**: usuarios activos, OS creadas/entregadas, errores de la app y diferencias de caja del día anterior.
- Vercel → Logs: líneas JSON con `level: "error"` (sin datos personales; `requestId` = `x-vercel-id`).
- Supabase → Advisors (seguridad y rendimiento) una vez por semana.

## Respaldos

- Supabase Pro: respaldo diario automático (retención según el plan); PITR es opcional. Confírmalo antes del primer día.
- Antes de cada migración a producción: revisa que el respaldo del día exista (Supabase → Database → Backups).
- Restaurar reemplaza **toda** la base: último recurso. Para errores acotados, corrige con una migración o con la pantalla correspondiente (con motivo y auditoría).
- Exportes útiles para el contador (CSV) no sustituyen al respaldo.

## Rollback

| Qué            | Cómo                                                                                                                                 | Tiempo   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Web            | Vercel → Deployments → despliegue anterior → **Instant Rollback**; después, `git revert` del PR para que `main` refleje lo publicado | segundos |
| Base (esquema) | Hacia adelante: migración que compense (recrear la función anterior). Nunca editar ni borrar una migración aplicada                  | minutos  |
| Base (datos)   | Corrección con RPC auditada; restaurar respaldo sólo si no hay otra salida                                                           | horas    |
| Móvil (JS)     | Republicar la actualización anterior con EAS Update (expo.dev → Updates → Republish); llega al abrir la app                          | minutos  |
| Móvil (nativo) | Reinstalar el build anterior desde expo.dev; tiendas: detener el rollout y publicar la corrección                                    | horas    |

Detalle técnico en [CI/CD → Rollback](../modules/ci-cd.md#rollback).

## Contactos (llenar antes del piloto)

| Rol                                    | Nombre | Teléfono / chat | Horario |
| -------------------------------------- | ------ | --------------- | ------- |
| Encargado del Centro 1 (nivel 1)       |        |                 |         |
| Responsable de la plataforma (nivel 2) |        |                 |         |
| Desarrollo (nivel 3)                   |        |                 |         |
| Admin corporativo                      |        |                 |         |
