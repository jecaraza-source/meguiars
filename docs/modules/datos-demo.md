# Datos demo

Dos scripts, en este orden, sobre una base con todas las migraciones:

| Script                        | Qué carga                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/seed.sql`           | Organización `meguiars-demo` con 2 centros (CDMX y Monterrey) y un escenario por módulo: clientes y vehículos, catálogo, agenda de hoy, OS en proceso/abierta/B2B, ejecución, membresías, CRM, cuenta B2B con convenio, recomendaciones, pipeline, cobranza, egresos, cortes de caja, CxC, tableros, KPIs, umbrales y reglas de alerta. |
| `supabase/demo/historial.sql` | 90 días de historial: 24 clientes más con vehículo, ~950 OS entregadas y cobradas (efectivo, tarjeta, transferencia; algunas por cobrar), egresos mensuales por centro y citas para mañana y pasado. Da tendencia a tableros, KPIs, P&L y alertas.                                                                                      |

`historial.sql` es determinista e idempotente (si ya corrió, no hace nada) y `scripts/test-db.sh` lo valida en CI después del seed. CDMX llega hasta anteayer: ayer tiene un corte de caja cerrado; por eso las alertas diarias de ejemplo se disparan para CDMX.

## Local

```bash
psql "$DATABASE_URL" -f supabase/seed.sql -f supabase/demo/historial.sql
```

(`supabase db reset` ya carga `seed.sql`; después corre sólo `historial.sql`.)

## Usuarios de prueba

Los scripts no crean usuarios. Créalos en Supabase (**Authentication → Users → Add user**, con _Auto Confirm_) y dales acceso en **SQL Editor**:

```sql
-- admin_socio corporativo (ambos centros, Dirección, reglas de alerta)
insert into public.role_assignments (organization_id, user_id, role)
select '00000000-0000-4000-8000-00000000d3e0', id, 'admin_socio' from auth.users where email = 'admin@ejemplo.com';

-- rol en un centro: encargado | operador_recepcion | contador | comercial_b2b
-- CDMX = 11111111-1111-4111-8111-111111111111, Monterrey = 22222222-2222-4222-8222-222222222222
insert into public.user_detail_centers (detail_center_id, user_id, role)
select '11111111-1111-4111-8111-111111111111', id, 'encargado' from auth.users where email = 'encargado@ejemplo.com';
```

Las reglas de alerta del seed no tienen autor; la evaluación diaria las omite hasta que un admin corporativo las guarde (o `update public.alert_rules set created_by = '<uuid del admin>'` con `app.change_reason`).

## Producción (demo)

El 29 sep 2026 se cargaron `seed.sql` e `historial.sql` en el proyecto de producción (organización demo), con un admin corporativo y un usuario por rol (`*@example.com`). Para quitar los usuarios de prueba: **Authentication → Users → Delete user** (sus accesos se borran en cascada). Los datos demo no afectan a otras organizaciones.
