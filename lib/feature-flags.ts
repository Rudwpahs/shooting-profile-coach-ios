import {
  assessRepresentativeRolloutGate,
  type ReleaseGateReasonV1,
  type ReleaseValidationCertificateV1,
  type RepresentativeRolloutFlagsV1,
} from "@/lib/shooting-profile/release-gate";

export type FormPathFlagEnvironment = Readonly<{
  EXPO_PUBLIC_FORMPATH_CAPTURE_V2?: string;
  EXPO_PUBLIC_FORMPATH_PROFILE_V2?: string;
  EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D?: string;
  EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA?: string;
  EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE?: string;
}>;

export type FormPathFlagResolution = Readonly<{
  requested: RepresentativeRolloutFlagsV1;
  flags: RepresentativeRolloutFlagsV1;
  rollout:
    | Readonly<{ status: "not_requested" }>
    | Readonly<{ status: "blocked"; reasons: readonly ReleaseGateReasonV1[] }>
    | Readonly<{
      status: "eligible_for_feature_flag_rollout";
      certificate: ReleaseValidationCertificateV1;
    }>;
}>;

const DISABLED_FLAGS: RepresentativeRolloutFlagsV1 = Object.freeze({
  captureV2: false,
  representative4DViewer: false,
  profileV2: false,
});

const CERTIFICATE_BOOLEAN_FIELDS = [
  "independentGroundTruth",
  "preRegisteredAccuracyGatePassed",
  "preRegisteredFalseRejectGatePassed",
  "physicalIPhoneMatrixPassed",
  "offlineReopenValidationPassed",
  "privacyDeletionValidationPassed",
] as const;

function parseReleaseValidationCertificate(
  raw: string | undefined,
): { status: "missing" } | { status: "invalid" } | {
  status: "valid";
  certificate: ReleaseValidationCertificateV1;
} {
  if (raw === undefined || raw.trim() === "") return { status: "missing" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { status: "invalid" };
  }
  const value = parsed as Record<string, unknown>;
  if (value.version !== "representative_release_validation_certificate_v1") {
    return { status: "invalid" };
  }
  if (CERTIFICATE_BOOLEAN_FIELDS.some((field) => typeof value[field] !== "boolean")) {
    return { status: "invalid" };
  }
  if (typeof value.evidenceArtifactPath !== "string" || typeof value.evaluatedCommitSha !== "string") {
    return { status: "invalid" };
  }
  return {
    status: "valid",
    certificate: value as ReleaseValidationCertificateV1,
  };
}

export function resolveFormPathFlags(
  env: FormPathFlagEnvironment,
): FormPathFlagResolution {
  const requested: RepresentativeRolloutFlagsV1 = Object.freeze({
    captureV2: env.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",
    representative4DViewer: env.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",
    profileV2: env.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",
  });
  if (!requested.captureV2 && !requested.profileV2 && !requested.representative4DViewer) {
    return Object.freeze({
      requested,
      flags: DISABLED_FLAGS,
      rollout: Object.freeze({ status: "not_requested" as const }),
    });
  }

  const parsedCertificate = parseReleaseValidationCertificate(
    env.EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE,
  );
  if (parsedCertificate.status === "missing") {
    return Object.freeze({
      requested,
      flags: DISABLED_FLAGS,
      rollout: Object.freeze({
        status: "blocked" as const,
        reasons: Object.freeze(["validation_certificate_missing" as const]),
      }),
    });
  }
  if (parsedCertificate.status === "invalid") {
    return Object.freeze({
      requested,
      flags: DISABLED_FLAGS,
      rollout: Object.freeze({
        status: "blocked" as const,
        reasons: Object.freeze(["validation_certificate_invalid" as const]),
      }),
    });
  }

  const rollout = assessRepresentativeRolloutGate({
    flags: requested,
    buildCommitSha: env.EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA ?? "",
    validationCertificate: parsedCertificate.certificate,
  });
  return Object.freeze({
    requested,
    flags: rollout.status === "eligible_for_feature_flag_rollout"
      ? requested
      : DISABLED_FLAGS,
    rollout,
  });
}

// Keep explicit Expo public-environment property access so Metro can inline
// these values at build time. The effective exported flags are resolved below.
const REQUESTED_FORMPATH_FLAGS = Object.freeze({
  captureV2: process.env.EXPO_PUBLIC_FORMPATH_CAPTURE_V2 === "1",
  representative4DViewer: process.env.EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D === "1",
  profileV2: process.env.EXPO_PUBLIC_FORMPATH_PROFILE_V2 === "1",
});

export const FORMPATH_FLAG_RESOLUTION = resolveFormPathFlags({
  EXPO_PUBLIC_FORMPATH_CAPTURE_V2: REQUESTED_FORMPATH_FLAGS.captureV2 ? "1" : undefined,
  EXPO_PUBLIC_FORMPATH_PROFILE_V2: REQUESTED_FORMPATH_FLAGS.profileV2 ? "1" : undefined,
  EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D: REQUESTED_FORMPATH_FLAGS.representative4DViewer ? "1" : undefined,
  EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA: process.env.EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA,
  EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE:
    process.env.EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE,
});

export const FORMPATH_FLAGS = FORMPATH_FLAG_RESOLUTION.flags;
