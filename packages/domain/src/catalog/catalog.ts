import type { Result } from "../result";

/** Motores de ingreso (clasificación obligatoria de cada servicio). Coincide con `public.revenue_engine`. */
export const REVENUE_ENGINES = [
  "recurrente",
  "valor_medio",
  "premium",
  "producto_complemento",
  "membresia",
] as const;
export type RevenueEngine = (typeof REVENUE_ENGINES)[number];

/** Servicio homologado de la organización (valores base). Importes en MXN con IVA incluido. */
export interface Service {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description: string | null;
  revenueEngine: RevenueEngine;
  standardDurationMinutes: number;
  basePrice: number;
  standardDirectCost: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Servicio tal como se vende en un centro: valores propios del centro o base. */
export interface CatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  revenueEngine: RevenueEngine;
  standardDurationMinutes: number;
  basePrice: number;
  standardDirectCost: number;
  /** Precio vigente en el centro. */
  price: number;
  /** Costo directo estándar vigente en el centro. */
  directCost: number;
  priceSource: "base" | "center";
  available: boolean;
  active: boolean;
}

/** Cambio de precio/costo. `detailCenterId` null = valores base. */
export interface PriceHistoryEntry {
  id: number;
  detailCenterId: string | null;
  price: number | null;
  directCost: number | null;
  validFrom: string;
  reason: string | null;
}

export interface ServiceInput {
  name: string;
  description?: string | undefined;
  revenueEngine: RevenueEngine;
  standardDurationMinutes: number;
  basePrice: number;
  standardDirectCost: number;
}

export interface CreateServiceCommand extends ServiceInput {
  organizationId: string;
  code: string;
}

export interface UpdateServiceCommand extends ServiceInput {
  id: string;
  active: boolean;
  reason: string;
}

export interface CenterConfigCommand {
  detailCenterId: string;
  serviceId: string;
  available: boolean;
  /** undefined = usa el valor base. */
  priceOverride?: number | undefined;
  directCostOverride?: number | undefined;
  reason: string;
}

export interface CatalogFilter {
  revenueEngine?: RevenueEngine | undefined;
  /** Incluye servicios inactivos o no disponibles en el centro. */
  includeInactive?: boolean | undefined;
}

/** Puerto del catálogo. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface CatalogRepository {
  listForCenter(detailCenterId: string, filter?: CatalogFilter): Promise<Result<CatalogItem[]>>;
  get(serviceId: string): Promise<Result<Service>>;
  priceHistory(serviceId: string): Promise<Result<PriceHistoryEntry[]>>;
  create(command: CreateServiceCommand): Promise<Result<Service>>;
  update(command: UpdateServiceCommand): Promise<Result<Service>>;
  configureCenter(command: CenterConfigCommand): Promise<Result<void>>;
}

/**
 * Línea de Orden de Servicio con precio, costo, duración y motor congelados al
 * venderse (contrato para el módulo de OS): los cambios posteriores del
 * catálogo no alteran OS históricas.
 */
export interface FrozenServiceLine {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  revenueEngine: RevenueEngine;
  unitPrice: number;
  unitDirectCost: number;
  durationMinutes: number;
}

export function freezeServiceLine(item: CatalogItem): FrozenServiceLine {
  return {
    serviceId: item.id,
    serviceCode: item.code,
    serviceName: item.name,
    revenueEngine: item.revenueEngine,
    unitPrice: item.price,
    unitDirectCost: item.directCost,
    durationMinutes: item.standardDurationMinutes,
  };
}
