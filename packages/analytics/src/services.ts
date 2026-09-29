/**
 * Ventas por servicio (D3). Fuente: public.dashboard_facts, fuente `services`
 * (private.order_line_facts): líneas de las OS entregadas por centro, periodo,
 * canal, motor y servicio, más el descuento general de cada OS. Es el mismo
 * criterio que las líneas "ingreso" y "costo estándar" del P&L, así que la suma
 * por servicio cuadra con el P&L sin diferencias.
 */
export interface ServiceFact {
  detailCenterId: string;
  bucket: string;
  channel: "b2c" | "membresia" | "b2b";
  /** Motor de ingreso de la línea ("descuento_os" para el descuento general). */
  engine: string;
  /** null = descuento general de la OS (no ligado a un servicio). */
  serviceId: string | null;
  serviceName: string;
  kind: "servicio" | "producto" | "descuento";
  quantity: number;
  orders: number;
  /** Σ (subtotal − descuento de línea); el descuento general viene negativo. */
  revenue: number;
  /** Σ costo estándar congelado de las líneas (otros costos directos). */
  standardCost: number;
  /** Σ pago al operador congelado de las líneas (CR1; 0 si el servicio no paga %). */
  operatorPay?: number | undefined;
}

/** Llave de un servicio en rankings y drill-down (el descuento general no tiene servicio). */
export const serviceKeyOf = (f: Pick<ServiceFact, "serviceId">) => f.serviceId ?? "descuento_os";
