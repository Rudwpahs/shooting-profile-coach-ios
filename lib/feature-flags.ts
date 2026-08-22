export const FORMPATH_FLAGS = Object.freeze({
  captureV2: process.env.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",
  representative4DViewer: process.env.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",
  profileV2: process.env.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",
});
