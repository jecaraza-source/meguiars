-- Verifica el paso del consentimiento de clients.marketing_channels a contact_preferences.
do $$
begin
  if (select string_agg(channel || '=' || opted_in, ',' order by channel) from public.contact_preferences
       where client_id = '2c000000-0000-0000-0000-000000000001') is distinct from 'email=true,whatsapp=true' then
    raise exception 'FALLÓ: el consentimiento existente no pasó a contact_preferences';
  end if;
  if exists (select 1 from public.contact_preferences where client_id = '2c000000-0000-0000-0000-000000000002') then
    raise exception 'FALLÓ: un cliente sin consentimiento no debe tener preferencias';
  end if;
  raise notice 'ok - transición: el consentimiento de marketing existente pasa a contact_preferences por canal';
end $$;
