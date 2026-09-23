import { readdirSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Un proyecto por paquete compartido (sólo directorios): `npm test` en la raíz corre todos.
const packages = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`);

export default defineConfig({
  test: {
    projects: packages,
  },
});
