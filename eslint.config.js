// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat.js");

module.exports = defineConfig([
  expoConfig,
  {
    // A local Python venv for ml/coach ships JavaScript inside site-packages (torch); it is not ours to lint.
    ignores: [".expo/**", "dist/**", "web-dist/**", "ml/**/.venv/**"],
  },
]);
