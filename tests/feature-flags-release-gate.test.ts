import { describe, expect, it } from "vitest";

import {
  resolveFormPathFlags,
  type FormPathFlagEnvironment,
} from "@/lib/feature-flags";
import type { ReleaseValidationCertificateV1 } from "@/lib/shooting-profile/release-gate";

const BUILD_SHA = "0123456789abcdef0123456789abcdef01234567";

function certificate(
  overrides: Partial<ReleaseValidationCertificateV1> = {},
): ReleaseValidationCertificateV1 {
  return {
    version: "representative_release_validation_certificate_v1",
    independentGroundTruth: true,
    preRegisteredAccuracyGatePassed: true,
    preRegisteredFalseRejectGatePassed: true,
    physicalIPhoneMatrixPassed: true,
    offlineReopenValidationPassed: true,
    privacyDeletionValidationPassed: true,
    evidenceArtifactPath: "docs/evaluation/representative-v2-heldout-validation.json",
    evaluatedCommitSha: BUILD_SHA,
    ...overrides,
  };
}

function env(
  overrides: Partial<FormPathFlagEnvironment> = {},
): FormPathFlagEnvironment {
  return {
    EXPO_PUBLIC_FORMPATH_CAPTURE_V2: "1",
    EXPO_PUBLIC_FORMPATH_PROFILE_V2: "1",
    EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D: "1",
    EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA: BUILD_SHA,
    EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: JSON.stringify(certificate()),
    ...overrides,
  };
}

describe("resolveFormPathFlags", () => {
  it("keeps all V2 flags disabled when rollout is requested without a validation certificate", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: undefined,
    }));

    expect(resolution.requested).toEqual({
      captureV2: true,
      profileV2: true,
      representative4DViewer: true,
    });
    expect(resolution.flags).toEqual({
      captureV2: false,
      profileV2: false,
      representative4DViewer: false,
    });
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["validation_certificate_missing"],
    });
  });

  it("rejects a certificate that was evaluated against a different commit", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: JSON.stringify(certificate({
        evaluatedCommitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })),
    }));

    expect(resolution.flags.captureV2).toBe(false);
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["validation_certificate_commit_mismatch"],
    });
  });

  it("rejects rollout when the build commit identity was not embedded", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA: undefined,
    }));

    expect(resolution.flags.profileV2).toBe(false);
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["build_commit_sha_missing"],
    });
  });

  it("rejects a structurally valid certificate when a required validation gate failed", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: JSON.stringify(certificate({
        preRegisteredAccuracyGatePassed: false,
      })),
    }));

    expect(resolution.flags.captureV2).toBe(false);
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["pre_registered_accuracy_gate_failed"],
    });
  });

  it("rejects a partial V2 flag request even with otherwise valid rollout evidence", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D: undefined,
    }));

    expect(resolution.flags).toEqual({
      captureV2: false,
      profileV2: false,
      representative4DViewer: false,
    });
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["feature_flags_incomplete"],
    });
  });

  it("rejects malformed certificate JSON instead of silently enabling V2", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: "{not-json",
    }));

    expect(resolution.flags).toEqual({
      captureV2: false,
      profileV2: false,
      representative4DViewer: false,
    });
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["validation_certificate_invalid"],
    });
  });

  it("rejects structurally invalid certificate JSON", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: JSON.stringify({
        version: "representative_release_validation_certificate_v1",
        independentGroundTruth: "yes",
      }),
    }));

    expect(resolution.flags.representative4DViewer).toBe(false);
    expect(resolution.rollout).toEqual({
      status: "blocked",
      reasons: ["validation_certificate_invalid"],
    });
  });

  it("enables the requested V2 surface only when certificate and build commit match", () => {
    const resolution = resolveFormPathFlags(env());

    expect(resolution.flags).toEqual(resolution.requested);
    expect(resolution.rollout.status).toBe("eligible_for_feature_flag_rollout");
  });

  it("leaves V2 disabled without demanding a certificate when rollout was not requested", () => {
    const resolution = resolveFormPathFlags(env({
      EXPO_PUBLIC_FORMPATH_CAPTURE_V2: undefined,
      EXPO_PUBLIC_FORMPATH_PROFILE_V2: undefined,
      EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D: undefined,
      EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA: undefined,
      EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE: undefined,
    }));

    expect(resolution.flags).toEqual({
      captureV2: false,
      profileV2: false,
      representative4DViewer: false,
    });
    expect(resolution.rollout).toEqual({ status: "not_requested" });
  });
});
