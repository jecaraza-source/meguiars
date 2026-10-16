# ADR 0037 — Rol «técnico / lavador» con «Mi día»: fuera de los chequeos genéricos

- Estado: aceptado
- Fecha: 2026-10-15

## Contexto

Quien lava o detalla el auto necesita una interfaz muy sencilla en el teléfono: sus asignaciones, un botón de «Trabajo realizado», comentarios y fotos. Hasta ahora los técnicos eran sólo nombres en la agenda (`technicians`), sin usuario.

Varias políticas y RPC usan `has_center_role(centro)` o `has_org_role(org)` **sin lista de roles** como «cualquier miembro del centro u organización» (catálogo con costos, configuración del centro, tableros, KPIs, resumen del día, datos públicos del asistente). Un rol nuevo pasaría todos esos chequeos.

## Decisión

1. **Rol `tecnico` de centro** (nunca corporativo: `role_assignments_not_tecnico`), con sólo `center.read` y `work.mine`.
2. **Los chequeos genéricos lo excluyen:** `has_center_role`/`has_org_role` sin lista ignoran `tecnico`. Así ninguna política existente ni futura que diga «cualquier rol» le da acceso por accidente. Ve su centro y su organización con `is_center_technician`/`is_org_technician`, sólo para elegir centro.
3. **Acceso por asignación, no por rol:** las RPC `my_work_*` son security definer y verifican que la OS esté asignada al técnico ligado al usuario de la sesión. Por dentro llaman a las RPC de ejecución existentes, así las reglas de la OS (transiciones, tiempos, bitácora, auditoría) son las mismas.
4. **Vínculo explícito** técnico ↔ usuario (`technicians.profile_id`), lo hace el encargado o admin con motivo.
5. **Pantalla propia** («Mi día») como inicio del técnico en web y móvil, sin pasar por la OS completa.

## Consecuencias

- Un rol nuevo «de oficina» que deba entrar a esas políticas genéricas sigue funcionando sin cambios; uno restringido como el técnico se agrega a la exclusión.
- El técnico no ve precios, costos, clientes ni indicadores. Lo que necesita de la OS (vehículo, bahía, indicaciones, servicios, fotos, comentarios) lo trae `my_work`.
- Las fotos se toman en la app móvil; la web muestra el conteo.
