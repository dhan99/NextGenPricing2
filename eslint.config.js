// ESLint 9 flat-config for NextGenPricing2.
//
// Migrated from .eslintrc.cjs in F0.6 (Day 5 of PHASE0_RUNBOOK.md). The
// rationale is identical to the legacy config: permissive in Phase 0,
// catches real bugs (no-undef, no-unused-vars), holds new code in
// `packages/**` to a higher bar via overrides. Tighten rules one at a time
// in their own PRs.
//
// If a rule is annoying, file an issue before disabling it. Disabling rules
// without discussion is how lint configs decay into uselessness.

import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";

const baseRules = {
  // Permissive in Phase 0; tighten in later phases.
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": ["warn", {
    argsIgnorePattern: "^_",
    varsIgnorePattern: "^_",
  }],
  "@typescript-eslint/no-non-null-assertion": "off",
  "react/react-in-jsx-scope": "off",         // React 19 + new JSX transform
  "react/prop-types": "off",                  // we use TypeScript
  "react/display-name": "off",                // many anonymous components in legacy code
  // Apostrophes / quotes in JSX text are cosmetic — Phase 0 doesn't sweep
  // these. Demoting to warn keeps them visible without blocking lint.
  "react/no-unescaped-entities": "warn",
  // Cascading-renders warning from the React Compiler-aware rule. Real
  // perf concern but pervasive in the legacy wizard code; tracked as a
  // separate sweep.
  "react-hooks/set-state-in-effect": "warn",
  "no-console": "off",                        // server uses console liberally
  "no-useless-escape": "warn",
  "prefer-const": "warn",
  "no-empty": ["warn", { allowEmptyCatch: true }],
};

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".smoke-logs/**",
      "coverage/**",
      "exports/**",
      "public/**",
      "backups/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react": reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...baseRules,
    },
  },
  {
    // TypeScript handles undefined-name detection more accurately than
    // ESLint's `no-undef` (it knows about ambient lib types like
    // `RequestInit`, `React`, `Request`, etc. that lint sees as
    // undeclared). Standard @typescript-eslint guidance.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-undef": "off",
    },
  },
  {
    // New code under packages/ is held to a higher standard.
    files: ["packages/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "error",
    },
  },
  {
    // Test files: relax non-null-assertion since tests often assert on
    // things they know to be present.
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
