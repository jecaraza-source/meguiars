# supabase

- `migrations/`: migraciones SQL en orden (`YYYYMMDDHHMMSS_nombre.sql`), compatibles con `supabase db push`.
- `tests/`: pruebas de RLS y auditoría. `00_supabase_stub.sql` sólo existe para correrlas en un Postgres plano; nunca se aplica a un proyecto real.

```bash
npm run test:db                               # Postgres temporal local (requiere binarios de Postgres 16)
DATABASE_URL=postgres://... npm run test:db   # base vacía existente
```

Despliegue: `npx supabase link --project-ref <ref>` y luego `npx supabase db push`.
