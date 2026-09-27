-- Verifica que la organización previa recibió las etapas mínimas, que los
-- seguimientos del CRM siguen válidos y editables, y que la cuenta con RFC no
-- se puede duplicar.
do $$
begin
  if (select string_agg(code, ',' order by position) from public.pipeline_stages
       where organization_id = '2e000000-0000-0000-0000-000000000001')
     is distinct from 'prospecto,contactado,propuesta,negociacion,ganado,perdido' then
    raise exception 'FALLÓ: la organización previa no recibió las etapas mínimas';
  end if;
  if not exists (select 1 from public.crm_tasks
                  where id = '2b000000-0000-0000-0000-000000000001' and source = 'manual' and opportunity_id is null
                    and client_id = '2c000000-0000-0000-0000-000000000001') then
    raise exception 'FALLÓ: el seguimiento previo cambió';
  end if;
  update public.crm_tasks set notes = 'Editado tras la migración' where id = '2b000000-0000-0000-0000-000000000001';
  begin
    insert into public.b2b_accounts (organization_id, home_detail_center_id, client_id, name, rfc, request_id) values
      ('2e000000-0000-0000-0000-000000000001', '2eea0000-0000-0000-0000-000000000001',
       '2c000000-0000-0000-0000-000000000002', 'Duplicada', 'FPR010101AB1', gen_random_uuid());
    raise exception 'FALLÓ: se duplicó la cuenta por RFC';
  exception when unique_violation then null;
  end;
  raise notice 'ok - transición: etapas mínimas para organizaciones existentes, seguimientos intactos, RFC único';
end $$;
