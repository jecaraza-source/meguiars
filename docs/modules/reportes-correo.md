# Dirección / Reportes por correo

El Tablero corporativo llega por correo a Dirección: **diario, semanal, quincenal o mensual**. Es sólo para el equipo interno; no se envían correos a clientes. Decisiones en [ADR 0041](../adr/0041-reportes-de-direccion-por-correo-con-resend.md).

## Uso

Web: **Dirección → Reportes por correo** (`/direccion/reportes`). Sólo el admin corporativo.

1. **Nuevo reporte:** nombre (va en el asunto), frecuencia, correos (separados por coma, máximo 20), centros (ninguno marcado = todos) y motivo.
2. **Enviar ahora:** manda ya el último periodo cerrado, para probar o adelantar. No cuenta como el envío automático.
3. **Pausar:** desmarca «Activo» y guarda. **Borrar** pide motivo; la bitácora se conserva.
4. **Últimos envíos:** fecha, reporte, periodo, origen (automático o manual), estado y el error si falló.

Móvil: **Dirección → Reportes por correo** muestra los reportes y la bitácora; se configuran en la web.

## Cuándo llega y qué periodo cubre

| Frecuencia | Llega (≈ 7:00 hora de CDMX) | Periodo                        | Compara contra       |
| ---------- | --------------------------- | ------------------------------ | -------------------- |
| Diario     | cada día                    | ayer                           | el día anterior      |
| Semanal    | lunes                       | lunes a domingo anterior       | la semana anterior   |
| Quincenal  | días 1 y 16                 | 16–fin de mes anterior, o 1–15 | la quincena anterior |
| Mensual    | día 1                       | mes anterior                   | el mes anterior      |

El cron corre diario y manda el último periodo cerrado que no se haya enviado: si un día falla, se recupera al siguiente, y un periodo enviado no se repite.

## Qué lleva el correo

Ventas, EBITDA, margen bruto, vehículos, ticket promedio, membresías activas, MRR, recurrencia, venta B2B y venta de productos: consolidado y, con 2 a 6 centros, una columna por centro. Cada cifra trae su variación contra el periodo anterior (verde mejor, rojo peor), las alertas de umbral del tablero y un botón al Tablero corporativo con el mismo periodo. Son exactamente las cifras de la pantalla (mismo cálculo).

## Puesta en marcha

1. Crear una cuenta en [Resend](https://resend.com) y **verificar el dominio** del remitente (Domains → Add domain → agregar los registros DNS que indica).
2. Crear una API key con permiso **Sending access**.
3. En Vercel (proyecto web → Settings → Environment Variables, **sólo Production**):
   - `RESEND_API_KEY` = la llave;
   - `REPORTS_EMAIL_FROM` = remitente del dominio verificado, p. ej. `Meguiar's Reportes <reportes@tudominio.mx>`;
   - `CRON_SECRET` si aún no existe (lo usan también las alertas).
4. Redeploy. La pantalla debe decir «Envío de correos configurado».
5. Crear un reporte y usar **Enviar ahora** para comprobar que llega (revisa spam la primera vez).

## Permisos y seguridad

- Programaciones y bitácora: sólo admin corporativo (RLS + RPC). Escritura sólo por `save_report_subscription` / `delete_report_subscription`, con versión, motivo y auditoría.
- El cron usa la llave de servicio sólo en el servidor y lee los hechos con los permisos del autor de la programación (`report_subscription_facts`), que debe seguir siendo admin corporativo.
- La llave de Resend vive sólo en Vercel; nunca en la base, el navegador ni la app.

## Base de datos (20261101000000_report_emails.sql)

- `public.report_subscriptions`: qué, cada cuándo y a quién.
- `public.report_deliveries`: bitácora (automático/manual, periodo, destinatarios, enviado/fallido, error). Índice único: un periodo se envía una vez por la vía automática.
- RPC: `save_report_subscription`, `delete_report_subscription`, `record_report_delivery`, `report_subscription_facts` (sólo servicio).

## Pruebas

- `supabase/tests/report_emails.test.sql`: permisos, validación de correos, versión, bitácora sin duplicados, hechos con permisos del autor y auditoría.
- `packages/domain/src/report-emails/report-emails.test.ts`: periodos (cruces de mes, año y bisiesto), qué toca enviar, correo HTML y de texto.
- `packages/validation/src/report-emails.test.ts` y `packages/supabase/src/repositories/report-emails.test.ts`.
