import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Component tests use the automatic JSX runtime, matching the app's tsconfig.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": rootDir,
      // React Native ships untranspiled Flow, which Vite cannot load. The web
      // runtime the project already builds with is used instead so component
      // tests render the real Pressable/Text/ActivityIndicator tree.
      "react-native": path.join(rootDir, "node_modules/react-native-web"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // The emulator suite needs a running Firestore emulator and is run by
    // `pnpm test:rules`. Keeping it out of the hermetic run stops it from being
    // silently swept into `pnpm test` / `pnpm test:unit`.
    exclude: [...configDefaults.exclude, "tests/emulator/**"],
    environmentMatchGlobs: [["tests/**/*.test.tsx", "jsdom"]],
  },
});
