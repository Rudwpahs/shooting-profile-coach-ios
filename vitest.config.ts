import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      // Render tests mount the real components through react-native-web in jsdom.
      "react-native": "react-native-web",
    },
  },
  esbuild: { jsx: "automatic" },
  // React Native code reads the bundler-provided __DEV__ flag at module scope.
  define: { __DEV__: "true" },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
    // The emulator suite needs a running Firestore emulator and is run by
    // `pnpm test:rules`. Keeping it out of the hermetic run stops it from being
    // silently swept into `pnpm test` / `pnpm test:unit`.
    exclude: [...configDefaults.exclude, "tests/emulator/**"],
  },
});
