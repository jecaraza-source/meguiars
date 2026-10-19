-- Tras 20261031000200_inbox_media_order_status: los mensajes previos quedan sin
-- archivo (el hilo sigue mostrando el aviso) y el bucket es privado.
\set ON_ERROR_STOP on
do $$
begin
  if exists (select 1 from public.messages where media_id is not null or media_path is not null) then
    raise exception 'FALLÓ: los mensajes previos no tienen archivo registrado';
  end if;
  if not exists (select 1 from storage.buckets where id = 'inbox-media' and not public) then
    raise exception 'FALLÓ: el bucket inbox-media debe existir y ser privado';
  end if;
  raise notice 'ok - mensajes previos sin archivo y bucket privado';
end $$;
