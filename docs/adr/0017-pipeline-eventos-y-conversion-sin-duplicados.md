# ADR 0017 — Pipeline: historial de eventos como fuente de métricas y conversión a cuenta sin duplicar la empresa

- Estado: aceptado
- Fecha: 2026-10-06

## Contexto

Se necesita un pipeline básico para oportunidades B2B y de clientes de alto valor, con estos requisitos:

- historial de etapas auditable;
- métricas reproducibles (oportunidades, conversión, valor ganado, ciclo);
- permisos por rol y centro;
- que ganar una oportunidad B2B cree la cuenta y el convenio sin recapturar ni duplicar la empresa.

Además, no debe crecer hasta ser un CRM empresarial.

## Decisión

1. **Historial inmutable como fuente de verdad** (`opportunity_events`).
   - Cada alta, cambio de etapa, valor, responsable, nota, cierre, reapertura o conversión inserta un evento.
   - El evento guarda la etapa anterior y la nueva, el valor vigente, el tipo y el centro, quién y cuándo.
   - Un trigger impide actualizar o borrar eventos; `seq` da el orden aunque compartan `now()`.
   - La fila de la oportunidad es el estado vigente para operar y lleva además `audit_row` con motivo.
2. **Métricas sólo desde eventos.**
   - `pipeline_metric_facts` reconstruye un hecho por oportunidad a partir de los eventos: alta, último cierre vigente, valor y etapa vigentes, etapas alcanzadas y ciclo.
   - Las fórmulas viven en `@meguiars/analytics`.
   - Una prueba SQL verifica que los hechos coinciden con el estado, y que alterar la tabla de oportunidades no cambia las métricas.
3. **Etapas configurables con tipo fijo.**
   - `pipeline_stages` tiene `kind` (`abierta`, `ganada`, `perdida`), con una sola ganada y una sola perdida.
   - El estado de la oportunidad es el tipo de su etapa (trigger).
   - El admin corporativo agrega, reordena, renombra o desactiva etapas abiertas; las de cierre sólo se renombran. Una etapa con oportunidades abiertas no se desactiva.
4. **Prospecto sin cliente; conversión al ganar.**
   - Los datos del prospecto viven en la oportunidad, así no se crean clientes por cada prospecto que se pierde.
   - Al registrarla o editarla, la base la liga a la empresa existente: cuenta del cliente, RFC, o teléfono o email de un cliente empresa.
   - Al ganarla, la base reutiliza esa cuenta o cliente. Si no existe, crea el cliente empresa, la cuenta y su contacto, y el convenio de la propuesta.
   - Todo ocurre en una transacción, serializada por empresa (advisory lock) y con un índice único de RFC por organización.
5. **Tareas en la cola del CRM.**
   - `crm_tasks` gana `opportunity_id`, y `client_id` pasa a ser opcional sólo para esas tareas.
   - Se completan con las mismas RPC del CRM. Sólo quien ve el pipeline ve estas tareas, y la cola del CRM y sus conteos las excluyen.
6. **Permisos.**
   - B2B: admin y comercial B2B (los mismos que administran cuentas).
   - B2C premium: además el encargado.
   - Indicadores: además el contador, sin datos personales (sigue de sólo lectura).
   - Etapas: admin corporativo.

## Consecuencias

- Las métricas no dependen de columnas mutables. Si cambia la definición de un KPI, se recalcula todo desde el historial.
- `crm_tasks.client_id` deja de ser obligatorio. El CRM filtra las tareas de oportunidad y un check exige cliente u oportunidad.
- Un prospecto B2C debe registrarse como cliente antes de ser oportunidad (decisión de alcance).
- Si hay RFC duplicado en cuentas existentes, la migración falla: hay que depurarlo antes de aplicarla (producción no tiene duplicados).
