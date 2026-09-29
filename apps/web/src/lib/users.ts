import "server-only";
import {
  activeCenterAccess,
  presentOrgUser,
  usableCenters,
  usersErrorMessage,
  type SignedInState,
  type UsersRepository,
} from "@meguiars/domain";

/** Contexto de Usuarios: organización del centro activo, sus centros y si el usuario la administra. */
export async function usersScope(state: SignedInState, repo: UsersRepository) {
  const active = activeCenterAccess(state)!.center;
  const can = await repo.canAdmin(active.organizationId, null);
  return {
    organizationId: active.organizationId,
    canManage: can.ok && can.data,
    centers: usableCenters(state.access)
      .filter((a) => a.center.organizationId === active.organizationId)
      .map((a) => ({ id: a.center.id, name: a.center.name })),
  };
}

export async function loadUsers(state: SignedInState, repo: UsersRepository) {
  const scope = await usersScope(state, repo);
  if (!scope.canManage) return { scope, error: null, users: [] };
  const list = await repo.list(scope.organizationId);
  return {
    scope,
    error: list.ok ? null : usersErrorMessage(list.error),
    users: list.ok ? list.data.map((u) => ({ raw: u, view: presentOrgUser(u) })) : [],
  };
}

export async function loadUser(state: SignedInState, repo: UsersRepository, userId: string) {
  const view = await loadUsers(state, repo);
  const user = view.users.find((u) => u.raw.userId === userId) ?? null;
  return { ...view, user, isSelf: userId === state.user.id };
}
