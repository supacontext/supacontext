import js from "@eslint/js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import type { Linter } from "eslint";

const ignores: Linter.Config = {
  ignores: [
    "dist/**",
    "node_modules/**",
    "coverage/**",
    ".next/**",
    "next-env.d.ts",
    "*.config.js",
    "*.config.mjs",
  ],
};

const typescriptRules: Linter.Config = {
  files: ["**/*.{ts,tsx}"],
  rules: {
    "no-undef": "off",
    "@typescript-eslint/consistent-type-imports": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
};

export const nodeConfig = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.node,
    },
  },
  typescriptRules,
] as unknown as Linter.Config[];

const browserBaseConfig = [
  ignores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  typescriptRules,
] as unknown as Linter.Config[];

const reactRules = {
  files: ["**/*.{jsx,tsx}"],
  plugins: {
    "jsx-a11y": jsxA11y,
    "react-hooks": reactHooks,
  },
  rules: {
    ...jsxA11y.configs.recommended.rules,
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/rules-of-hooks": "error",
  },
} as unknown as Linter.Config;

export const browserConfig: Linter.Config[] = [...browserBaseConfig, reactRules];

export const nextConfig: Linter.Config[] = [
  ...browserBaseConfig,
  ...nextCoreWebVitals,
] as unknown as Linter.Config[];
