import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scratch/experiment files are not part of the app surface.
    "scratch/**",
  ]),
  {
    rules: {
      // Legacy code has pervasive `any` (tracked cleanup). Kept as a warning so CI
      // stays green and real errors aren't drowned out; re-tightened to "error" on
      // clean modules below, and expanded as `any` is progressively removed.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Modules that are already `any`-free — enforce strictly so they don't regress.
    files: [
      "lib/config.ts",
      "lib/auth.ts",
      "lib/apiHandler.ts",
      "lib/rateLimit.ts",
      "lib/llm/language/**/*.ts",
      "lib/llm/fewshot/**/*.ts",
      "lib/pipeline/validators/PromptBudgetValidator.ts",
      "lib/pipeline/validators/LanguageQualityValidator.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]);

export default eslintConfig;
