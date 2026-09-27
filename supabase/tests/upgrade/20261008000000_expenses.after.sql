-- Tras 20261008000000_expenses: las organizaciones existentes reciben las
-- categorías mínimas de egresos mapeadas al P&L.
\set ON_ERROR_STOP on
do $$
begin
  if (select count(*) from public.expense_categories where organization_id = '2e000000-0000-0000-0000-000000000001') <> 10
     or not exists (select 1 from public.expense_categories where organization_id = '2e000000-0000-0000-0000-000000000001'
                      and code = 'insumos' and pnl_group = 'insumos') then
    raise exception 'FALLÓ: la organización previa recibe las categorías mínimas de egresos';
  end if;
  raise notice 'ok - categorías de egresos para organizaciones existentes';
end $$;
