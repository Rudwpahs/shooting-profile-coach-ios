export type ShotInspectionMode = "motion" | "phase" | "film";

export type ShotInspectionModeModel = Readonly<{
  defaultMode: "motion";
  enabledModes: readonly ShotInspectionMode[];
}>;

export function resolveShotInspectionModes(input: Readonly<{
  experimentalEnabled: boolean;
  hasLocalFilm: boolean;
}>): ShotInspectionModeModel {
  if (!input.experimentalEnabled) {
    return Object.freeze({
      defaultMode: "motion" as const,
      enabledModes: Object.freeze(["motion"] as const),
    });
  }
  return Object.freeze({
    defaultMode: "motion" as const,
    enabledModes: Object.freeze(
      input.hasLocalFilm
        ? (["motion", "phase", "film"] as const)
        : (["motion", "phase"] as const),
    ),
  });
}