-- Rol «técnico / lavador»: sólo usa «Mi día» (sus asignaciones, terminar,
-- comentarios, fotos y problemas). Va en su propio archivo porque un valor
-- nuevo de un enum no se puede usar en la misma transacción que lo agrega.
alter type public.app_role add value if not exists 'tecnico';
