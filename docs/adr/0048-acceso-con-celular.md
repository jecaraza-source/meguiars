# ADR 0048 — Acceso del equipo con celular y contraseña

- Estado: aceptado
- Fecha: 2026-10-29

## Contexto

Varias personas de los centros no usan correo. Pedirlo sólo para entrar retrasa las altas. Supabase Auth admite celular + contraseña y, si la cuenta la crea el admin con el celular confirmado, no necesita enviar SMS.

## Decisión

1. **Un solo campo «Correo o celular»** en web y móvil. `parseLoginIdentifier` (domain) decide: con «@» es correo; si no, celular normalizado con `normalizePhone` (10 dígitos = México, E.164 +52…), igual que clientes y WhatsApp.
2. **Alta con celular, correo o ambos** (`newUserSchema`). `auth.admin.createUser` recibe `phone_confirm: true`: no hay SMS ni proveedor de SMS ni costo por mensaje.
3. **Contraseña olvidada:** el enlace por correo sigue para quien tiene correo; a quien entra con celular se la cambia el admin en Usuarios (ya existía).
4. **Visualización:** quien no tiene correo se muestra con su celular (`accountLabel` en sesión; `org_users` devuelve el celular en `email` con la misma firma).
5. **Configuración:** proveedor Phone activado en Supabase, confirmaciones de teléfono apagadas y registro público apagado (sólo el admin crea cuentas).

## Consecuencias

- Las cuentas actuales con correo no cambian.
- Riesgo: el celular es un identificador más fácil de adivinar que un correo. Se mitiga con contraseña mínima de 8, límites de intentos de Supabase y altas sólo por el admin. Si más adelante se quiere quitar la contraseña, se agrega código por SMS (requiere proveedor y tiene costo).
- Pruebas: dominio (`parseLoginIdentifier`, `accountLabel`), validación (login y alta), adaptador de Supabase (login con celular) y SQL (`users_phone_login.test.sql`).
