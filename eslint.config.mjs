import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  { ignores: ["node_modules/", "main.js", "*.config.*"] },
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { obsidianmd },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...obsidianmd.configs.recommended,
      // disable type-aware rules (incompatible with TypeScript 4.7.4 + typescript-eslint v8)
      "obsidianmd/prefer-file-manager-trash-file": "off",
      "obsidianmd/no-view-references-in-plugin": "off",
    },
  },
];
