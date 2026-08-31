const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Preserve the iOS development workaround locally, but let clean CI use
  // NativeWind's virtual-module patch so generated web.css has a Metro SHA-1.
  forceWriteFileSystem: process.env.CI !== "true",
});
