// Reglas comunes a todo el monorepo. apps/web las añade sobre eslint-config-next;
// el resto de workspaces las usa a través de eslint.config.mjs (raíz).
import prettier from "eslint-config-prettier/flat";

export const sharedRules = [
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  // Siempre al final: desactiva reglas de estilo que Prettier ya resuelve.
  prettier,
];
