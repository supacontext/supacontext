import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const ignores = {
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

const typescriptRules = {
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
];

export const browserConfig = [
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
];

export const nextConfig = browserConfig;

