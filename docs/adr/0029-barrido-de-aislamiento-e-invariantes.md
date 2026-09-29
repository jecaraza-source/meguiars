# ADR 0029 — Barrido automático de aislamiento e invariantes financieros

- Estado: aceptado
- Fecha: 2026-09-29

## Contexto

Cada módulo probaba su RLS y sus RPC con casos escritos a mano. Antes del piloto (F5.1) hacía falta una garantía que no dependa de acordarse de escribir el caso: con 72 tablas y 152 funciones expuestas, la auditoría encontró una fuga entre centros (la cartera B2B, legible por los centros del convenio) que ninguna prueba por módulo cubría.

## Decisión

1. **Barrido derivado del catálogo** (`supabase/tests/seeded/cross_tenant.test.sql`, corre sobre el seed):
   - la tenencia de cada tabla sale de sus columnas (`detail_center_id`, `home_detail_center_id`, `organization_id`) o de su llave foránea al `id` del padre (hasta dos niveles);
   - cada rol de un centro ataca al otro centro y cada rol de otra organización ataca a la demo: lectura, UPDATE/DELETE e INSERT directos por tabla, y **todas** las funciones de `public` ejecutables por `authenticated` con ids ajenos mapeados por nombre de parámetro (y la versión real de la fila, para que el rechazo venga del permiso);
   - se exige que ninguna fila ajena cambie (huella por tabla) y que ningún id o folio ajeno aparezca en el resultado;
   - un **control positivo** (usuario legítimo contra su propio centro) debe disparar los tres detectores; si no, la prueba falla (evita que el barrido se vuelva ciego);
   - lo compartido por diseño se declara en la prueba con su ADR (clientes, ficha B2B, membresía en cualquier centro, umbrales).
2. **Invariantes de seguridad del esquema** (`supabase/tests/security_invariants.test.sql`): RLS y política en toda tabla, nada para `anon`, sin TRUNCATE/TRIGGER/REFERENCES, `search_path` fijo y chequeo de permiso en SECURITY DEFINER, buckets privados y acotados.
3. **Invariantes financieros** (`supabase/tests/seeded/financial_integrity.test.sql`) sobre el seed, el historial demo y un escenario de punta a punta, con conciliación contra `private.pnl_movements`. La misma consulta sirve, de sólo lectura, para auditar producción.
4. **La cartera B2B es del centro gestor** también en lectura directa (`private.b2b_portfolio_visible`), como ya decía ADR 0022.

## Consecuencias

- Una tabla o función nueva entra sola al barrido; lo único que puede requerir mantenimiento es el mapeo de nombres de parámetro a tablas (`pg_temp.param_table`) y la lista de lo compartido por diseño.
- `npm run test:db` tarda ≈ 40 s más.
- Un parámetro sin mapeo recibe un uuid aleatorio: la función se ejecuta pero con menos cobertura. El control positivo y el resumen de funciones con resultado ayudan a detectarlo.
