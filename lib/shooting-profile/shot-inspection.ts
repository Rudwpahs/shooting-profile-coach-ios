export type ShotInspectionMode = "motion" | "phase" | "film";

export type ShotInspectionModeModel = Readonly<{
  defaultMode: "motion";
  enabledModes: readonly ShotInspectionMode[];
  /** Film is listed whenever the inspection surface is on; without a local clip it shows an honest empty state. */
  filmSourceAvailable: boolean;
}>;

export function resolveShotInspectionModes(input: Readonly<{
  experimentalEnabled: boolean;
  hasLocalFilm: boolean;
}>): ShotInspectionModeModel {
  if (!input.experimentalEnabled) {
    return Object.freeze({
      defaultMode: "motion" as const,
      enabledModes: Object.freeze(["motion"] as const),
      filmSourceAvailable: false,
    });
  }
  return Object.freeze({
    defaultMode: "motion" as const,
    enabledModes: Object.freeze(["motion", "phase", "film"] as const),
    filmSourceAvailable: input.hasLocalFilm,
  });
}
