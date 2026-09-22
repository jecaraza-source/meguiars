import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { sharedRules } from "./eslint.shared.mjs";

export default defineConfig([
  // apps/web tiene su propia configuración (eslint-config-next).
  globalIgnores(["**/node_modules/**", "apps/web/**", "**/.expo/**", "**/dist/**", "**/coverage/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  ...sharedRules,
]);
