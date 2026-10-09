import { defineConfig } from "eslint/config";
import globals from "globals";

import { config as baseConfig } from "./base.js";

/**
 * Config for the NestJS API. Nest's decorator metadata needs runtime class
 * imports, so type-only import enforcement is relaxed here.
 */
export const nestJsConfig = defineConfig(baseConfig, {
  languageOptions: {
    globals: { ...globals.node, ...globals.jest },
  },
  rules: {
    "@typescript-eslint/consistent-type-imports": "off",
  },
});
