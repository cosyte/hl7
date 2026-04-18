// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import jsdoc from "eslint-plugin-jsdoc";
import prettierConfig from "eslint-config-prettier";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
  // 1. Ignore generated + external directories.
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "*.config.js"],
  },

  // 2. Base rules for all TypeScript source + tests.
  {
    files: ["src/**/*.ts", "test/**/*.ts", "*.config.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      jsdoc: jsdoc,
    },
    rules: {
      // --- CLAUDE.md guardrails: no any, no unjustified as ---
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "never" },
      ],
      "@typescript-eslint/no-non-null-assertion": "error",

      // --- Strictness ---
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      // --- CLAUDE.md: no console.* in library code ---
      "no-console": "error",

      // --- CLAUDE.md: JSDoc + @example on public exports ---
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
            MethodDefinition: true,
          },
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > TSTypeAliasDeclaration",
            "ExportNamedDeclaration > TSInterfaceDeclaration",
            "ExportNamedDeclaration > TSEnumDeclaration",
          ],
        },
      ],
      "jsdoc/require-example": [
        "error",
        {
          contexts: [
            "ExportNamedDeclaration > VariableDeclaration",
            "ExportNamedDeclaration > FunctionDeclaration",
            "ExportNamedDeclaration > ClassDeclaration",
          ],
          exemptedBy: ["internal", "private"],
        },
      ],
      "jsdoc/check-tag-names": ["error", { definedTags: ["internal", "remarks"] }],

      // --- General safety ---
      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
    },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
  },

  // 3. Relax JSDoc requirements inside test files (tests don't need @example).
  {
    files: ["test/**/*.ts"],
    rules: {
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-example": "off",
    },
  },

  // 4. eslint-config-prettier MUST be last — turns off rules that conflict with Prettier.
  prettierConfig,
];
