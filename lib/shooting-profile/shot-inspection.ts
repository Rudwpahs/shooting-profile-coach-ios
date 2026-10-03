export type ShotInspectionMode = "phase" | "film";

export type ShotInspectionModeModel = Readonly<{
  defaultMode: "phase";
  enabledModes: readonly ShotInspectionMode[];
  /** Film is listed whenever the inspection surface is on; without a local clip it shows an honest empty state. */
  filmSourceAvailable: boolean;
}>;

/**
 * The inspection surface behind the stage. Motion is the stage itself now,
 * so the surface holds Phase Space and Film; with the experimental flag
 * off there is nothing extra to show.
 */
export function resolveShotInspectionModes(input: Readonly<{
  experimentalEnabled: boolean;
  hasLocalFilm: boolean;
}>): ShotInspectionModeModel {
  if (!input.experimentalEnabled) {
    return Object.freeze({
      defaultMode: "phase" as const,
      enabledModes: Object.freeze([] as const),
      filmSourceAvailable: false,
    });
  }
  return Object.freeze({
    defaultMode: "phase" as const,
    enabledModes: Object.freeze(["phase", "film"] as const),
    filmSourceAvailable: input.hasLocalFilm,
  });
}
