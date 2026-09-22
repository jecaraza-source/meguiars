# @meguiars/core

Paquete compartido por `apps/web` y `apps/mobile`. No depende de ninguna plataforma.

| Módulo | Contenido |
| --- | --- |
| `domain/` | Tipos y constantes de negocio (roles, centro). |
| `validation/` | Esquemas zod que se usan en cliente y servidor. |
| `time/` | Reglas de fechas: se guardan en UTC y se presentan en la zona horaria del centro. |
| `kpi/` | `defineKpi` y `kpiRegistry`: cada KPI tiene un id único, su fórmula, su fuente de datos y su prueba. |
| `supabase/` | `createMeguiarsClient` tipado con `Database`. |

```bash
npm run test -w @meguiars/core
npm run typecheck -w @meguiars/core
```

Tras cada migración, regenera `src/supabase/database.types.ts` con `npx supabase gen types typescript`.
