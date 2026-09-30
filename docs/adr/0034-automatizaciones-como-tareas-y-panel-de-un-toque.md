# ADR 0034 — Automatizaciones que crean tareas y panel comercial con atribución de un toque

- Estado: aceptado
- Fecha: 2026-09-30

## Contexto

La fase 4 de CR2 pide automatizaciones configurables:

- asignar prospectos;
- recordar cotizaciones;
- confirmar reservas;
- pedir valoración;
- proponer recompra;
- reactivar inactivos.

Cada una debe tener disparador, condiciones, acción, responsable, límites de frecuencia e historial. Además deben:

- distinguir lo operativo de lo promocional;
- respetar consentimiento, bajas y horarios;
- detener las secuencias cuando el cliente responde, reserva o pide no recibir más.

También pide un panel con fórmulas, origen del dato y modelo de atribución, que no cuente una venta dos veces ni presente el ROAS como rentabilidad.

Hay dos restricciones reales:

- WhatsApp sólo admite texto libre dentro de 24 h y fuera de ellas exige plantillas aprobadas, que no hay.
- La plataforma ya estableció en C2 que «la tarea es la acción».

## Decisión

1. **La acción de una automatización es una tarea** (`crm_tasks`, origen `automatizacion`), con el mensaje sugerido, el canal, el plazo y el horario.
   - No se envían mensajes sin una persona, así que no se simula una integración que no existe.
   - El diseño deja lugar para una acción «enviar plantilla» cuando haya plantillas aprobadas.
2. **Motor en la base, diario con `pg_cron`**, igual que los pendientes del CRM.
   - Candidatos, consentimiento, frecuencia y paro se evalúan en SQL, cerca de los datos y con las mismas reglas de acceso.
   - Hay ejecución manual y vista previa sin efectos.
3. **Tipo fijo por disparador.** Mantenimiento y reactivación son promocionales y exigen consentimiento del canal, con enfriamiento compartido entre promocionales. Las demás son operativas.
4. **Una acción por regla y sujeto** (índice único parcial). Reintentos y corridas repetidas no duplican.
5. **Paro de secuencias.**
   - Por disparadores de la base, al instante: mensaje entrante en la bandeja, cita nueva, consentimiento retirado.
   - Por barrido en cada corrida: cotización decidida o vencida, cita cambiada, prospecto cerrado.
   - Todo paro queda en el historial con su motivo.
6. **Mensajes con marcadores cerrados** (`{nombre}`, `{servicio}`, `{centro}`, `{fecha}`, `{folio}`), validados en el dominio y en la base. No hay forma de insertar precios ni promociones que no existan.
7. **Panel con atribución de un toque.**
   - Prospectos: cohorte por fecha de registro.
   - Ventas: OS entregadas en el periodo.
   - Atribuido: la OS que ganó a un prospecto con campaña. Como una OS gana a un solo prospecto, la atribución es única.
   - La inversión sólo se separa por canal y campaña; con otros filtros se muestra «sin datos».
   - Cada KPI declara su origen: interno, registro manual o proveedor, y hoy no hay ninguno de proveedor.

## Consecuencias

- El equipo ve en Seguimientos lo que debe hacer, con qué mensaje y en qué horario. El cumplimiento se mide con las tareas hechas, detenidas o pendientes de cada regla.
- Conectar el envío automático (plantillas de WhatsApp) será una acción nueva sobre la misma regla, sin rehacer la base.
- El ROAS y los costos por prospecto y por cliente dependen de registrar la inversión en Campañas, idealmente ligada al egreso.
