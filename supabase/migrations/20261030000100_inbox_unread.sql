-- Aviso de mensajes sin leer en el menú (punto rojo en «Bandeja» y en
-- «Comercial»). Suma unread_count de las conversaciones del centro; abrir la
-- conversación lo regresa a 0. Sólo quien usa la bandeja ve el número; los
-- demás reciben 0 (no revela si hay conversaciones).
create index conversations_unread_idx on public.conversations (detail_center_id) where unread_count > 0;

create function public.inbox_unread(p_detail_center_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case
           when private.can_use_leads(p_detail_center_id) then
             coalesce((select sum(v.unread_count)::integer
                         from public.conversations v
                        where v.detail_center_id = p_detail_center_id and v.unread_count > 0), 0)
           else 0
         end;
$$;

revoke all on function public.inbox_unread(uuid) from public, anon;
grant execute on function public.inbox_unread(uuid) to authenticated;
