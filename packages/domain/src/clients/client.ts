import type { Result } from "../result";

export const CLIENT_KINDS = ["person", "company"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Canales de contacto comercial (el consentimiento se usa en la fase Comercial). */
export const MARKETING_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

/** App desde la que se registra un cambio de consentimiento. */
export type ChangeSource = "web" | "mobile";

export interface MarketingConsent {
  optIn: boolean;
  channels: MarketingChannel[];
  /** Último cambio del consentimiento (UTC). */
  updatedAt: string | null;
  source: ChangeSource | null;
}

export interface Vehicle {
  id: string;
  clientId: string;
  make: string;
  model: string;
  year: number;
  /** Placa normalizada: mayúsculas, sólo letras y dígitos. */
  plate: string;
  /** Identificador opcional (VIN, número económico de flotilla…). */
  identifier: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}

/**
 * Expediente del cliente. Pertenece a la organización (no a un centro) para
 * no duplicarse cuando se atiende en varios centros; `homeDetailCenterId` es
 * su centro habitual.
 */
export interface Client {
  id: string;
  organizationId: string;
  homeDetailCenterId: string;
  kind: ClientKind;
  fullName: string;
  /** E.164 (p. ej. +525512345678). */
  phone: string;
  email: string | null;
  notes: string | null;
  marketing: MarketingConsent;
  lastVisitAt: string | null;
  lastVisitDetailCenterId: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientDetail extends Client {
  vehicles: Vehicle[];
  /** Centros donde se ha atendido (definen quién lo ve). */
  centerIds: string[];
}

export type SearchMatch = "plate" | "phone" | "email" | "name";

export interface ClientSearchResult {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  kind: ClientKind;
  homeDetailCenterId: string;
  homeCenterName: string | null;
  lastVisitAt: string | null;
  /** Ya vinculado al centro activo (se listan primero). */
  inActiveCenter: boolean;
  plates: string[];
  matchedOn: SearchMatch;
}

export type DuplicateField = "phone" | "email" | "plate" | "identifier";

/** Posible duplicado. Si no es visible desde el centro, el nombre y teléfono vienen enmascarados. */
export interface ClientMatch {
  clientId: string;
  displayName: string;
  phoneHint: string;
  homeCenterName: string;
  matchedOn: DuplicateField[];
  visible: boolean;
}

export const HISTORY_KINDS = [
  "client_created",
  "vehicle_added",
  "center_linked",
  "visit",
  "service_order",
] as const;
export type ClientHistoryKind = (typeof HISTORY_KINDS)[number];

/** Entrada del historial; cada una pertenece a un centro y respeta sus permisos. */
export interface ClientHistoryEntry {
  occurredAt: string;
  kind: ClientHistoryKind;
  detailCenterId: string;
  detailCenterName: string;
  title: string;
  vehicleId: string | null;
}

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  identifier?: string | undefined;
  notes?: string | undefined;
}

export interface CreateClientCommand {
  detailCenterId: string;
  /** Llave de idempotencia generada al abrir el formulario (misma en reintentos). */
  requestId: string;
  fullName: string;
  phone: string;
  email?: string | undefined;
  kind: ClientKind;
  notes?: string | undefined;
  marketingChannels: MarketingChannel[];
  source: ChangeSource;
  vehicles: VehicleInput[];
  /** Motivo para continuar pese a un posible duplicado. */
  duplicateReason?: string | undefined;
}

export interface UpdateClientCommand {
  id: string;
  fullName: string;
  phone: string;
  email?: string | undefined;
  kind: ClientKind;
  notes?: string | undefined;
  homeDetailCenterId: string;
  marketingChannels: MarketingChannel[];
  source: ChangeSource;
  reason: string;
  confirmDuplicate?: boolean | undefined;
}

export interface AddVehicleCommand extends VehicleInput {
  clientId: string;
  detailCenterId: string;
  requestId: string;
}

export interface UpdateVehicleCommand extends VehicleInput {
  id: string;
  active: boolean;
  reason: string;
}

export interface FindMatchesQuery {
  detailCenterId: string;
  phone: string;
  email?: string | undefined;
  plates?: string[] | undefined;
  identifiers?: string[] | undefined;
  excludeClientId?: string | undefined;
}

/** Puerto de clientes y vehículos. Web y móvil usan el mismo adaptador (`@meguiars/supabase`). */
export interface ClientRepository {
  search(detailCenterId: string, query: string): Promise<Result<ClientSearchResult[]>>;
  get(id: string): Promise<Result<ClientDetail>>;
  history(id: string): Promise<Result<ClientHistoryEntry[]>>;
  findMatches(query: FindMatchesQuery): Promise<Result<ClientMatch[]>>;
  create(command: CreateClientCommand): Promise<Result<Client>>;
  update(command: UpdateClientCommand): Promise<Result<Client>>;
  addVehicle(command: AddVehicleCommand): Promise<Result<Vehicle>>;
  updateVehicle(command: UpdateVehicleCommand): Promise<Result<Vehicle>>;
  linkToCenter(clientId: string, detailCenterId: string, reason: string): Promise<Result<string>>;
}
