import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The emulator suite needs a running Firestore emulator and is run by
    // `pnpm test:rules`. Keeping it out of the hermetic run stops it from being
    // silently swept into `pnpm test` / `pnpm test:unit`.
    exclude: [...configDefaults.exclude, "tests/emulator/**"],
  },
});
