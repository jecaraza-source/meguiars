# ADR 0042 — Integridad de cobros: GraphQL apagado, membresía fuera de las formas de pago y B2B sin cuenta se cobra

- Estado: aceptado
- Fecha: 2026-10-25

## Contexto

Una auditoría de seguridad encontró tres caminos para que un `operador_recepcion` marcara una OS como pagada o entregada sin cobrarla:

1. **Escrituras directas tras una RPC.** `private.set_change_reason()` fija el motivo con `set_config(..., true)`, que dura hasta el fin de la **transacción**. `private.require_change_reason()` sólo revisa que haya motivo. PostgREST ejecuta una llamada por transacción, pero pg_graphql (expuesto en `graphql_public`) ejecuta todas las mutaciones de una petición en una sola: una RPC cualquiera seguida de `update service_orders set total = 1, status = 'entregada'` pasaba. Ninguna app usa GraphQL.
2. **Membresía como forma de pago** (ADR 0018). Sólo exigía que el cliente tuviera una membresía vigente y saldaba cualquier importe, sin cobrar nada y sin entrar a caja. Contradice ADR 0013: los servicios incluidos se redimen como descuento de la OS; no hay saldo de la membresía que respalde un pago.
3. **OS B2B sin cuenta.** La entrega B2B sólo exigía la orden de compra, también sin cuenta B2B ligada. Esas OS se entregaban sin cobrar y no entraban a ningún estado de cuenta (sólo a "por cobrar").

## Decisión

1. **Apagar GraphQL** (`drop extension if exists pg_graphql`, y `graphql_public` fuera de `api.schemas` en `config.toml`). `security_invariants.test.sql` falla si se vuelve a habilitar. Se prefirió a revocar escrituras directas tabla por tabla (las RPC `security invoker` las necesitan) o a acotar el motivo a cada función (más de 190 RPC).
2. **Desactivar la membresía como forma de pago** (`payment_methods.active = false`). `create_order_payment` ya rechaza formas inactivas (22023). Los recibos previos con membresía siguen válidos. El dominio filtra por `PAYMENT_METHOD_RULES[m].active`; `hasActiveMembership` se conserva por compatibilidad y ya no habilita nada.
3. **B2B sin cuenta se cobra antes de entregar** (`service_order_delivery_blocker` ↔ `deliveryBlocker`). Sólo la OS a cuenta B2B se entrega a crédito: su saldo va al estado de cuenta de la empresa.

## Consecuencias

- En el proyecto de Supabase hay que quitar `graphql_public` de **Exposed schemas** (Settings → API) además de aplicar la migración.
- Habilitar GraphQL en el futuro exige primero acotar el motivo de cambio a cada RPC.
- Las OS B2B sin cuenta abiertas al aplicar la migración piden su cobro (o ligarlas a una cuenta) antes de entregarse.
- **Pendiente:** cobrar la venta y la renovación de membresías con recibo y corte de caja (hoy sólo guardan una referencia de pago). Se diseñará aparte.
