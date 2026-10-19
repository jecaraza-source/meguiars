-- Tras 20261031000100_appointment_reminders: nada se envía solo. Los
-- recordatorios nacen apagados, las citas previas no tienen recordatorio ni
-- confirmación y las plantillas previas quedan sin botones hasta sincronizar.
\set ON_ERROR_STOP on
do $$
begin
  if exists (select 1 from public.bot_settings where reminders_enabled or reminder_template_id is not null) then
    raise exception 'FALLÓ: los recordatorios deben nacer apagados';
  end if;
  if exists (select 1 from public.appointments where confirmed_at is not null or reminder_sent_at is not null) then
    raise exception 'FALLÓ: las citas previas no tienen recordatorio ni confirmación';
  end if;
  if exists (select 1 from public.whatsapp_templates where quick_reply_count <> 0) then
    raise exception 'FALLÓ: las plantillas previas quedan sin botones hasta la siguiente sincronización';
  end if;
  raise notice 'ok - recordatorios apagados, citas previas sin recordatorio y plantillas por sincronizar';
end $$;
