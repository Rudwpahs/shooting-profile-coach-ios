/**
 * Development-only UI demo gate. Both conditions are required: a development
 * bundle (Metro strips `__DEV__` branches from production output) and an
 * explicit opt-in variable, so the demo never appears in a release build.
 */
export const UI_DEMO_ENABLED: boolean = __DEV__ && process.env.EXPO_PUBLIC_HOOPHUB_UI_DEMO === "1";
