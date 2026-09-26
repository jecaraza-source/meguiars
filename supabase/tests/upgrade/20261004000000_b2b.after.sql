-- Verifica que las OS B2B previas (sin cuenta) siguen válidas y editables.
do $$
begin
  if not exists (select 1 from public.service_orders
                  where id = '2a000000-0000-0000-0000-000000000001' and channel = 'b2b' and channel_reference = 'OC-LEGADO'
                    and b2b_account_id is null and b2b_agreement_id is null and b2b_invoice_id is null) then
    raise exception 'FALLÓ: la OS B2B previa cambió';
  end if;
  if not exists (select 1 from public.service_order_items
                  where service_order_id = '2a000000-0000-0000-0000-000000000001' and price_source = 'center'
                    and unit_price = 220 and list_unit_price is null and b2b_price_rule_id is null) then
    raise exception 'FALLÓ: la línea previa cambió';
  end if;
  update public.service_order_items set quantity = 2 where service_order_id = '2a000000-0000-0000-0000-000000000001';
  update public.service_orders set observations = 'Editada tras la migración' where id = '2a000000-0000-0000-0000-000000000001';
  raise notice 'ok - transición: las OS B2B sin cuenta y sus líneas siguen válidas y editables';
end $$;
