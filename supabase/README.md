# supabase

- `config.toml`: pila local (`npm run db:start`). Postgres 17, igual que el servicio gestionado.
- `migrations/`: migraciones SQL en orden (`YYYYMMDDHHMMSS_nombre.sql`), compatibles con `supabase db push`.
- `seed.sql`: dos centros, tres clientes con vehículos y un catálogo de servicios de ejemplo. Lo cargan `supabase db reset` y `npm run test:db`.
- `tests/`: pruebas de RLS, RPC y auditoría. `00_supabase_stub.sql` sólo existe para correrlas en un Postgres plano; nunca se aplica a un proyecto real.

## Contrato de seguridad

Detalle completo, matriz de roles y plantilla para tablas nuevas en [docs/modules/multicentro-seguridad.md](../docs/modules/multicentro-seguridad.md).

- **Deny-by-default:** RLS en todas las tablas; `anon` y `PUBLIC` sin privilegios, tampoco sobre objetos futuros.
- **Acceso:** los roles efectivos en un centro son su rol en el centro (`user_detail_centers`) más sus roles corporativos (`role_assignments`). Los helpers `private.has_center_role` y `private.has_org_role` son la única vía de autorización.
- **Escritura sensible:** sólo por RPC (`update_detail_center`, `set_center_membership`, `set_role_assignment`) con motivo obligatorio. Una escritura directa sin motivo falla con `23514`.
- **Alta y baja** de organizaciones y centros, y deshabilitar perfiles: sólo con `service_role`.
- **Auditoría:** `public.audit_log` registra cambios de fila y eventos (`private.log_event`) con actor, organización, centro, fecha UTC, valores y motivo. La leen admin_socio y contador.
- **Pruebas:** `tests/*.test.sql` (RLS) y `tests/upgrade/<migración>.{before,after}.sql` (transición de datos).

```bash
npm run test:db                               # Postgres temporal local (binarios de Postgres 16+)
DATABASE_URL=postgres://... npm run test:db   # base vacía existente (CI)
npm run db:types                              # tras cada migración, con la pila local levantada
```
