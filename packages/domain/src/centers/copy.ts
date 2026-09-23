/** Textos del caso de uso "Mis centros", idénticos en web y móvil. */
export const centersCopy = {
  title: "Mis centros",
  subtitle: "Centros de costos y resultados a los que tienes acceso.",
  loading: "Cargando centros…",
  empty: "Aún no tienes centros asignados. Pide a un administrador que te agregue.",
  permissionDenied: "Inicia sesión con una cuenta asignada a un centro para ver esta información.",
  notConfigured: "Supabase no está configurado. Copia .env.example a .env.local y completa las variables.",
  retry: "Reintentar",
  timeZoneLabel: "Zona horaria",
  localTimeLabel: "Hora local",
  rolesLabel: "Tus roles",
  corporateBadge: "Corporativo",
  inactiveBadge: "Deshabilitado",
  readOnlyBadge: "Sólo lectura",
  corporateSummary: (centers: number, organizations: number) =>
    `Vista corporativa: ${centers} ${centers === 1 ? "centro" : "centros"} en ${organizations} ${
      organizations === 1 ? "organización" : "organizaciones"
    }.`,
} as const;
