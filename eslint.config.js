import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "*.zip"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "scripts/*.mjs",
            "scripts/lib/*.mjs",
            "*.config.js",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 16,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // PRV-005: nothing may log URLs in a production build. All logging goes through
      // shared/log.ts, which compiles to a no-op outside dev builds.
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      eqeqeq: ["error", "always"],
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "Use a union of string literals instead of an enum.",
        },
      ],
    },
  },

  // The shared module must stay pure so it is trivially unit-testable in Node and can
  // be imported by both the service worker and the panel.
  {
    files: ["src/shared/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        {
          name: "chrome",
          message:
            "src/shared must stay free of Chrome APIs. Pass values in, or put the call in src/background.",
        },
      ],
    },
  },
  { files: ["src/shared/log.ts"], rules: { "no-console": "off" } },

  {
    files: ["src/sidepanel/**/*.{ts,tsx}", "src/onboarding/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
  },

  {
    files: ["scripts/**/*.mjs", "*.config.ts", "*.config.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      // TypeScript already flags undefined variables via noImplicitAny; ESLint's
      // no-undef does not understand declaration merging in .d.ts files.
      "no-undef": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },

  {
    files: ["e2e/**/*.ts"],
    rules: {
      "no-empty-pattern": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
);
