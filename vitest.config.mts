import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
      alias: [
      { find: "obsidian", replacement: path.resolve(__dirname, "src/test/utils/obsidian-shim.ts") },
    ],
  },
});