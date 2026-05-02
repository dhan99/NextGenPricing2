/**
 * ESLint config for NextGenPricing2.
 *
 * This config is intentionally permissive in Phase 0. The existing codebase
 * was built under Replit and does not lint cleanly under strict rules. Our
 * goal is not to retroactively style-police 41,800 LOC; it is to:
 *
 *   1. Catch real bugs (no-undef, no-unused-vars, no-floating-promises).
 *   2. Lint NEW code more strictly than existing code.
 *   3. Tighten rules over time, one rule at a time, with each tightening
 *      landing as its own PR.
 *
 * If a rule is annoying, file an issue before disabling it. Disabling rules
 * without discussion is how lint configs decay into uselessness.
 */
module.exports = {
  root: true,
  env: { node: true, browser: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
  ],
  settings: {
    react: { version: "detect" },
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    ".smoke-logs/",
    "coverage/",
    "exports/",
    "public/",
    "**/*.d.ts",
  ],
  rules: {
    // Permissive in Phase 0; tighten in later phases.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["warn", {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    }],
    "@typescript-eslint/no-non-null-assertion": "off",
    "react/react-in-jsx-scope": "off",         // React 19 + new JSX transform
    "react/prop-types": "off",                  // we use TypeScript
    "no-console": "off",                        // server uses console liberally
    "prefer-const": "warn",
    "no-empty": ["warn", { allowEmptyCatch: true }],
  },
  overrides: [
    {
      // New code under packages/ is held to a higher standard.
      files: ["packages/**/*.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": "error",
      },
    },
    {
      // Test files: relax the "no-non-null-assertion" because tests often
      // assert on things they know to be present.
      files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
      rules: {
        "@typescript-eslint/no-non-null-assertion": "off",
      },
    },
  ],
};
