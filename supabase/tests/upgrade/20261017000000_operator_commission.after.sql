-- Tras 20261017000000_operator_commission: los servicios y las líneas de OS
-- previas no pagan porcentaje (null → pago 0) y el costo de las OS no cambia.
\set ON_ERROR_STOP on
do $$
begin
  if exists (select 1 from public.services where operator_commission_pct is not null) then
    raise exception 'FALLÓ: la migración no debe asignar un %% del operador a servicios existentes';
  end if;
  if exists (select 1 from public.service_order_items where operator_commission_amount <> 0) then
    raise exception 'FALLÓ: las líneas previas no deben tener pago al operador';
  end if;
  if (select count(*) from public.pg_temp_cr1_costs) = 0 then
    raise exception 'FALLÓ: la prueba de actualización necesita OS previas';
  end if;
  if exists (select 1 from public.service_orders o join public.pg_temp_cr1_costs c on c.id = o.id
              where o.cost_total <> c.cost_total) then
    raise exception 'FALLÓ: el costo de las OS previas cambió';
  end if;
  raise notice 'ok - datos previos: sin %% del operador, sin pago y mismo costo de OS';
end $$;
drop table public.pg_temp_cr1_costs;
