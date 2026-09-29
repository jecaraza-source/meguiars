import { ROLE_LABELS } from "../roles";
import type { OrgUser } from "./users";

const dateTime = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

export const USERS_COPY = {
  title: "Usuarios",
  description: "Altas, contraseñas, roles y acceso de las personas de la organización.",
  newUser: "Nuevo usuario",
  create: "Crear usuario",
  empty: "Aún no hay usuarios.",
  onlyCorporate: "Sólo el administrador corporativo da de alta usuarios.",
  password: "Contraseña",
  confirmPassword: "Confirmar contraseña",
  setPassword: "Cambiar contraseña",
  passwordHint:
    "Mínimo 8 caracteres. Compártela por un medio seguro; la persona puede cambiarla con “¿Olvidaste tu contraseña?”.",
  disable: "Desactivar",
  enable: "Reactivar",
  disabledNote: "Sin acceso: no puede iniciar sesión.",
  otherOrg:
    "También tiene acceso en otra organización: su cuenta (contraseña y estado) no se administra desde aquí.",
  self: "Es tu cuenta.",
  addRole: "Asignar rol en centro",
  removeRole: "Quitar",
  corporateAdmin: "Admin corporativo (todos los centros)",
  noServiceKey:
    "El servidor no tiene configurada la llave de servicio (SUPABASE_SERVICE_ROLE_KEY): no se pueden crear cuentas ni cambiar contraseñas.",
  emailTaken: "Ya existe una cuenta con ese correo.",
} as const;

/** Fila del listado: nombre, correo, accesos, estado y último acceso. */
export function presentOrgUser(u: OrgUser) {
  const access = [
    ...u.corporateRoles.map((r) => `${ROLE_LABELS[r]} · corporativo`),
    ...u.centerRoles.filter((c) => c.active).map((c) => `${ROLE_LABELS[c.role]} · ${c.centerName}`),
  ];
  return {
    id: u.userId,
    name: u.fullName ?? u.email ?? u.userId,
    email: u.email ?? "—",
    access: access.length ? access.join(", ") : "Sin rol activo",
    status: u.active ? "Activo" : "Desactivado",
    statusTone: u.active ? ("success" as const) : ("danger" as const),
    lastSignIn: u.lastSignInAt ? dateTime.format(new Date(u.lastSignInAt)) : "Nunca",
    manageable: !u.otherOrg,
  };
}

export type OrgUserView = ReturnType<typeof presentOrgUser>;

/** Mensaje de error de la administración de usuarios. */
export function usersErrorMessage(error: { kind: string; message: string }): string {
  if (error.kind === "permission_denied") return error.message || USERS_COPY.onlyCorporate;
  if (error.kind === "unavailable") return "Sin conexión: intenta de nuevo.";
  if (/already been registered|already registered|email_exists/i.test(error.message))
    return USERS_COPY.emailTaken;
  return error.message;
}
