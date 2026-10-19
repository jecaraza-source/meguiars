import type { Screen } from "./auth/guards";

/**
 * Qué se captura o consulta en cada opción del menú. La web la muestra al
 * pasar el cursor (y la lee el lector de pantalla); la app móvil, como pista
 * de accesibilidad y al dejar presionada la opción. Toda opción del menú debe
 * tener una (navigation.test.ts).
 */
export const NAV_ITEM_DESCRIPTIONS: Partial<Record<Screen, string>> = {
  home: "Tu centro activo: hora local, roles y accesos rápidos a cada sección.",
  myWork: "Tus autos asignados de hoy y mañana: empezar, trabajo realizado, fotos, comentarios y problemas.",
  operacion:
    "El día del centro: citas, órdenes abiertas, autos en proceso, por entregar y pendientes de cobro.",
  agenda: "Citas por día, bahía y técnico; alta de citas y walk-ins, reagendar y recibir el auto.",
  orders: "Órdenes de servicio: servicios y productos, descuentos, ejecución, evidencias, cobro y entrega.",
  cash: "Apertura y cierre de caja por turno: fondo inicial, cobros del turno, efectivo contado y diferencias.",
  clients: "Clientes y sus vehículos: datos de contacto, consentimiento, placas e historial de visitas.",
  catalog: "Servicios y productos: precio, costo, duración, comisión e insumos estándar por servicio.",
  comercial: "Resumen de ventas, membresías, recurrencia y oportunidades del centro.",
  inbox: "Conversaciones de WhatsApp, Messenger e Instagram: responder, asignar, etiquetar y notas internas.",
  conversationHistory:
    "Todas las conversaciones guardadas, abiertas y atendidas: busca por cliente o teléfono, canal, estado y fechas.",
  assistant:
    "Asistente de WhatsApp con IA: modo, horarios, respuestas aprobadas, cuándo pasa a persona e indicadores.",
  leads: "Prospectos: origen, interés, etapa del embudo, seguimiento y conversión en cliente.",
  quotes: "Cotizaciones a prospectos o clientes: servicios, precios, vigencia, envío y reserva.",
  memberships: "Membresías vendidas: plan, vigencia, beneficios usados y renovaciones.",
  crmCustomers: "Clientes por recurrencia: última visita, frecuencia, valor y próximos servicios sugeridos.",
  crmTasks: "Seguimientos pendientes: llamar, escribir por WhatsApp, renovar u ofrecer mantenimiento.",
  b2bAccounts: "Empresas con flotilla: convenios, tarifas especiales, vehículos autorizados y crédito.",
  b2bProfitability: "Rentabilidad de cada cuenta B2B: venta, costo, margen y cumplimiento del convenio.",
  upsell: "Reglas de recomendación de servicios adicionales y su efectividad en las órdenes.",
  pipeline: "Oportunidades de venta por etapa (B2C premium y B2B): monto, probabilidad y fecha de cierre.",
  pipelineMetrics: "Indicadores del pipeline: conversión por etapa, ciclo de venta y pronóstico.",
  commercialReports: "Reportes del embudo: prospectos por origen, conversión, tiempos de respuesta y ventas.",
  integrations: "Conexiones oficiales (WhatsApp, Messenger, Instagram) y su estado real.",
  duplicates: "Clientes posiblemente duplicados (mismo teléfono, correo o placa) para fusionarlos.",
  commercialPanel:
    "Panel comercial y de marketing (sólo admin): prospectos, conversiones, ventas y atribución.",
  campaigns: "Campañas de marketing: canal, presupuesto, gasto, enlaces con UTM y resultados.",
  contentCalendar: "Calendario de publicaciones y acciones de marketing por canal y fecha.",
  promotions: "Promociones (descuentos preautorizados): vigencia, centros, usos y nivel de autorización.",
  segments: "Segmentos de clientes por visitas, gasto, vehículo o consentimiento para campañas.",
  automations: "Automatizaciones: recordatorios y seguimientos automáticos, su historial y resultados.",
  finanzas: "Resumen financiero del día y del mes: venta, cobrado, por cobrar, egresos y caja.",
  payments: "Cobros de órdenes: efectivo, tarjeta, transferencia o mixto; recibos y reversiones.",
  expenses: "Egresos del centro: proveedor, categoría, comprobante y aprobación.",
  pnl: "Estado de resultados por centro y periodo: ingresos, costos, gastos y utilidad.",
  receivables: "Cuentas por cobrar de empresas B2B: facturas, abonos, saldos y antigüedad.",
  team: "Personas del centro y su rol.",
  users: "Usuarios de la organización: alta con correo y contraseña, roles, centros y acceso.",
  centers: "Centros de la organización: alta, datos maestros, activación e importación de datos.",
  direccion: "Tablero corporativo: comparativo entre centros, tendencias, ranking y alertas.",
  dashboards: "Tableros configurables por rol con los indicadores que elijas.",
  kpis: "Catálogo de KPIs con su fórmula, origen del dato y umbrales.",
  alerts: "Alertas cuando un indicador sale de su umbral: revisar y resolver.",
  editCenter: "Nombre y zona horaria del centro activo (con motivo y auditoría).",
  reportEmails: "El tablero corporativo por correo a Dirección: diario, semanal, quincenal o mensual.",
  pilot: "Seguimiento del piloto: adopción del sistema y resultados contra la línea base.",
};
