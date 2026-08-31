// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat.js");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [".expo/**", "dist/**", "web-dist/**"],
  },
]);
