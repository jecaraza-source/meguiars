/**
 * Almacenamiento de sesión para móvil sobre un almacén seguro (Keychain /
 * Keystore vía expo-secure-store). SecureStore limita cada valor a ~2 KB y una
 * sesión de Supabase puede superarlo, así que se guarda en fragmentos; todos
 * los fragmentos viven en el almacén seguro (nada en AsyncStorage en claro).
 */
export interface SecureKeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const SECURE_CHUNK_SIZE = 1800;

// SecureStore sólo admite claves [A-Za-z0-9._-].
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export function createChunkedSecureStorage(
  store: SecureKeyValueStore,
  chunkSize = SECURE_CHUNK_SIZE,
): SessionStorage {
  const countKey = (key: string) => `${safeKey(key)}.chunks`;
  const chunkKey = (key: string, i: number) => `${safeKey(key)}.${i}`;

  async function removeChunks(key: string): Promise<void> {
    const count = Number((await store.getItemAsync(countKey(key))) ?? 0);
    for (let i = 0; i < count; i++) await store.deleteItemAsync(chunkKey(key, i));
    await store.deleteItemAsync(countKey(key));
  }

  return {
    async getItem(key) {
      const raw = await store.getItemAsync(countKey(key));
      if (raw === null) return null;
      const count = Number(raw);
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await store.getItemAsync(chunkKey(key, i));
        // Fragmento perdido: la sesión está corrupta; se trata como inexistente.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    },
    async setItem(key, value) {
      await removeChunks(key);
      const count = Math.max(1, Math.ceil(value.length / chunkSize));
      for (let i = 0; i < count; i++) {
        await store.setItemAsync(chunkKey(key, i), value.slice(i * chunkSize, (i + 1) * chunkSize));
      }
      await store.setItemAsync(countKey(key), String(count));
    },
    async removeItem(key) {
      await removeChunks(key);
    },
  };
}
