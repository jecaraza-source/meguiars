# supabase

- `config.toml`: pila local (`npm run db:start`). Postgres 17, igual que el servicio gestionado.
- `migrations/`: migraciones SQL en orden (`YYYYMMDDHHMMSS_nombre.sql`), compatibles con `supabase db push`.
- `seed.sql`: dos centros de ejemplo. Lo cargan `supabase db reset` y `npm run test:db`.
- `tests/`: pruebas de RLS, RPC y auditoría. `00_supabase_stub.sql` sólo existe para correrlas en un Postgres plano; nunca se aplica a un proyecto real.

## Contrato de seguridad

- Todas las tablas tienen RLS. `anon` no tiene acceso.
- Lectura: por membresía activa en el centro (`private.has_center_role`). Los perfiles son visibles para quien comparte centro (`private.shares_center_with`).
- Escritura sensible: sólo por RPC (`update_detail_center`, `set_center_membership`), con motivo obligatorio. Una escritura directa sin motivo falla con `23514`.
- Alta y baja de centros: sólo con `service_role` (onboarding).
- Todo centro conserva al menos un owner activo: un cliente no puede degradar ni desactivar al último (`23514`).
- Auditoría: `public.audit_log` guarda actor, fecha UTC, fila anterior y nueva, y motivo. No tiene FK a `detail_centers`, así que sobrevive al borrado del centro. Sólo es legible por owner, admin y manager.

```bash
npm run test:db                               # Postgres temporal local (binarios de Postgres 16+)
DATABASE_URL=postgres://... npm run test:db   # base vacía existente (CI)
npm run db:types                              # tras cada migración, con la pila local levantada
```
