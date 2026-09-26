import { describe, expect, it } from "vitest";
import { createChunkedSecureStorage, type SecureKeyValueStore } from "./storage";

/** Almacén en memoria que, como SecureStore, rechaza valores > 2048 y claves inválidas. */
function memoryStore() {
  const data = new Map<string, string>();
  const store: SecureKeyValueStore = {
    async getItemAsync(key) {
      return data.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`clave inválida: ${key}`);
      if (value.length > 2048) throw new Error("valor demasiado grande para SecureStore");
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      data.delete(key);
    },
  };
  return { store, data };
}

describe("createChunkedSecureStorage", () => {
  it("guarda y recupera sesiones más grandes que el límite de SecureStore", async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedSecureStorage(store);
    const session = JSON.stringify({ access_token: "x".repeat(5000), refresh_token: "r" });
    await storage.setItem("sb-ref-auth-token", session);
    expect(await storage.getItem("sb-ref-auth-token")).toBe(session);
    expect([...data.values()].every((v) => v.length <= 2048)).toBe(true);
  });

  it("al sobrescribir con un valor menor borra los fragmentos sobrantes", async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedSecureStorage(store, 10);
    await storage.setItem("k", "a".repeat(35));
    await storage.setItem("k", "corto");
    expect(await storage.getItem("k")).toBe("corto");
    expect([...data.keys()].sort()).toEqual(["k.0", "k.chunks"]);
  });

  it("removeItem borra todo y getItem devuelve null", async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedSecureStorage(store, 10);
    await storage.setItem("k", "a".repeat(25));
    await storage.removeItem("k");
    expect(data.size).toBe(0);
    expect(await storage.getItem("k")).toBeNull();
  });

  it("normaliza claves no admitidas por SecureStore y trata fragmentos perdidos como sesión inexistente", async () => {
    const { store, data } = memoryStore();
    const storage = createChunkedSecureStorage(store, 10);
    await storage.setItem("sb:ref/auth", "a".repeat(25));
    expect(await storage.getItem("sb:ref/auth")).toBe("a".repeat(25));
    data.delete("sb_ref_auth.1");
    expect(await storage.getItem("sb:ref/auth")).toBeNull();
  });
});
