-- Antes de 20261017000000_operator_commission: foto del costo de las OS previas.
\set ON_ERROR_STOP on
create table pg_temp_cr1_costs as select id, cost_total from public.service_orders;
