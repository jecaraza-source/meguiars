# ADR 0033 — Campañas con atribución simple, gasto ligado al egreso y promociones preautorizadas

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

La fase 3 de CR2 pide:

- un calendario de contenido;
- campañas con UTM;
- promociones;
- atribución a prospectos y ventas.

También fija estas reglas:

- explicar cada fórmula;
- mostrar «sin datos» en lugar de 0;
- nunca presentar ROAS como utilidad;
- no simular integraciones.

Ya existen varias piezas relacionadas:

- los egresos con grupo P&L «marketing» (AF2);
- los descuentos de cotización y OS con nivel de autorización;
- los prospectos con canal de origen (fase 1).

## Decisión

1. **Atribución de un solo toque.**
   - `leads.campaign_id` guarda a lo más una campaña.
   - Se asigna a mano o al aplicar una promoción de la campaña en la cotización del prospecto, si no tenía campaña.
   - Es auditable y cualquier rol comercial la entiende. La atribución multitoque exige rastrear visitas, cosa que la plataforma no hace.
2. **Cohorte por fecha de registro del prospecto.** Los KPIs toman los prospectos atribuidos creados en el periodo y siguen su resultado (contactado, cotizado, reservado, compró). La inversión es la del mismo periodo. Así, costo por prospecto y costo por venta usan el mismo recorte.
3. **El gasto se liga al egreso.**
   - `campaign_spend.expense_id` es único. El importe y la fecha salen del egreso, que debe ser del grupo marketing y no estar rechazado ni anulado.
   - El P&L sigue leyendo sólo egresos, así que ligar no duplica nada.
   - Se permite gasto sin egreso para campañas cuyo pago todavía no se registra, pero la pantalla recomienda ligarlo.
4. **Promociones como descuento preautorizado.**
   - Sólo admin/socio crea promociones.
   - Al aplicarla, el descuento guarda `source = 'promocion'`, `promotion_id`, el nivel de la promoción y su autor como quien autorizó.
   - El nivel requerido de los descuentos manuales posteriores excluye lo preautorizado, igual que las membresías.
   - Hay una promoción por documento (índice único parcial). Los usos máximos se cuentan en cotizaciones y OS.
   - Una vez usada, la promoción no cambia de código, tipo ni valor, para que su historial no se reinterprete.
5. **Sin ROAS como utilidad.**
   - Se reportan «ventas por peso invertido», con la nota «No es utilidad».
   - Aparte se reporta «margen después de la inversión»: total − costo directo − pago al operador − inversión.
6. **Sin integraciones simuladas.**
   - El calendario no publica en redes.
   - El gasto no se lee de las plataformas de anuncios.
   - Ambas cosas requieren las API oficiales de anuncios y publicación, con app revisada. Se documentan como limitación.

## Consecuencias

- Los números de campaña cuadran con el P&L cuando el gasto se liga al egreso.
- Una campaña sin prospectos atribuidos muestra «sin datos» en costo por prospecto: es una señal para registrar la atribución.
- Si más adelante se capturan UTM de un formulario propio, podrán llenar `leads.campaign_id` por `utm_campaign` sin cambiar el modelo.
- La copia de un descuento de promoción de la cotización a la OS llega como descuento manual. El uso se cuenta una vez, en la cotización.
