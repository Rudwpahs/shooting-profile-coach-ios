import type { CrossViewPhaseAlignmentResultV1 } from "@/lib/shooting-profile/cross-view-alignment";

export type ReleaseGateReasonV1 =
  | "feature_flags_incomplete"
  | "representative_reconstruction_incomplete"
  | "cross_view_alignment_not_verified"
  | "validation_certificate_missing"
  | "validation_certificate_invalid"
  | "build_commit_sha_missing"
  | "validation_certificate_commit_mismatch"
  | "independent_ground_truth_missing"
  | "pre_registered_accuracy_gate_failed"
  | "pre_registered_false_reject_gate_failed"
  | "physical_iphone_matrix_failed"
  | "offline_reopen_validation_failed"
  | "privacy_deletion_validation_failed";

export type ReleaseValidationCertificateV1 = Readonly<{
  version: "representative_release_validation_certificate_v1";
  /** Validation labels/truth must not come from the same estimator under test. */
  independentGroundTruth: boolean;
  /** Numerical accuracy thresholds must be fixed before evaluating the held-out set. */
  preRegisteredAccuracyGatePassed: boolean;
  /** Reject/recapture behavior must be evaluated over independently labeled valid attempts. */
  preRegisteredFalseRejectGatePassed: boolean;
  physicalIPhoneMatrixPassed: boolean;
  offlineReopenValidationPassed: boolean;
  privacyDeletionValidationPassed: boolean;
  evidenceArtifactPath: string;
  evaluatedCommitSha: string;
}>;

export type RepresentativeRolloutFlagsV1 = Readonly<{
  captureV2: boolean;
  profileV2: boolean;
  representative4DViewer: boolean;
}>;

export type RepresentativeRolloutGateInputV1 = Readonly<{
  flags: RepresentativeRolloutFlagsV1;
  /** Exact source commit embedded into the build being considered for rollout. */
  buildCommitSha: string;
  validationCertificate?: ReleaseValidationCertificateV1;
}>;

export type RepresentativeRolloutGateResultV1 =
  | Readonly<{
    status: "eligible_for_feature_flag_rollout";
    certificate: ReleaseValidationCertificateV1;
  }>
  | Readonly<{
    status: "blocked";
    reasons: readonly ReleaseGateReasonV1[];
  }>;

function certificateFailureReasons(
  certificate: ReleaseValidationCertificateV1,
): ReleaseGateReasonV1[] {
  const reasons: ReleaseGateReasonV1[] = [];
  if (!certificate.independentGroundTruth) reasons.push("independent_ground_truth_missing");
  if (!certificate.preRegisteredAccuracyGatePassed) reasons.push("pre_registered_accuracy_gate_failed");
  if (!certificate.preRegisteredFalseRejectGatePassed) {
    reasons.push("pre_registered_false_reject_gate_failed");
  }
  if (!certificate.physicalIPhoneMatrixPassed) reasons.push("physical_iphone_matrix_failed");
  if (!certificate.offlineReopenValidationPassed) reasons.push("offline_reopen_validation_failed");
  if (!certificate.privacyDeletionValidationPassed) reasons.push("privacy_deletion_validation_failed");
  if (!certificate.evidenceArtifactPath.trim() || !certificate.evaluatedCommitSha.trim()) {
    reasons.push("validation_certificate_missing");
  }
  return reasons;
}

/**
 * Build-scoped rollout gate for Representative V2.
 *
 * This is intentionally separate from per-capture reconstruction quality.
 * A release certificate is only evidence for the exact source commit that was
 * evaluated; copying a certificate to a different build must fail closed.
 * The certificate is a reviewed rollout control, not a cryptographic trust
 * boundary and must never contain secrets.
 */
export function assessRepresentativeRolloutGate(
  input: RepresentativeRolloutGateInputV1,
): RepresentativeRolloutGateResultV1 {
  const reasons: ReleaseGateReasonV1[] = [];
  if (!input.flags.captureV2 || !input.flags.profileV2 || !input.flags.representative4DViewer) {
    reasons.push("feature_flags_incomplete");
  }

  const buildCommitSha = input.buildCommitSha.trim();
  if (!buildCommitSha) reasons.push("build_commit_sha_missing");

  const certificate = input.validationCertificate;
  if (!certificate) {
    reasons.push("validation_certificate_missing");
  } else {
    reasons.push(...certificateFailureReasons(certificate));
    if (
      buildCommitSha
      && certificate.evaluatedCommitSha.trim()
      && certificate.evaluatedCommitSha.trim() !== buildCommitSha
    ) {
      reasons.push("validation_certificate_commit_mismatch");
    }
  }

  if (reasons.length > 0 || !certificate) {
    return Object.freeze({
      status: "blocked" as const,
      reasons: Object.freeze([...new Set(reasons)]),
    });
  }

  return Object.freeze({
    status: "eligible_for_feature_flag_rollout" as const,
    certificate,
  });
}

export type RepresentativeReleaseGateInputV1 = Readonly<{
  flags: RepresentativeRolloutFlagsV1;
  representativeStatus: "complete" | "recapture_required";
  crossViewAlignment: CrossViewPhaseAlignmentResultV1;
  validationCertificate?: ReleaseValidationCertificateV1;
}>;

export type RepresentativeReleaseGateResultV1 = RepresentativeRolloutGateResultV1;

/**
 * Legacy per-session + release assessment retained for existing callers/tests.
 * New build activation must use `assessRepresentativeRolloutGate`, because a
 * single capture cannot prove that a build is eligible for rollout.
 */
export function assessRepresentativeReleaseGate(
  input: RepresentativeReleaseGateInputV1,
): RepresentativeReleaseGateResultV1 {
  const reasons: ReleaseGateReasonV1[] = [];
  if (!input.flags.captureV2 || !input.flags.profileV2 || !input.flags.representative4DViewer) {
    reasons.push("feature_flags_incomplete");
  }
  if (input.representativeStatus !== "complete") {
    reasons.push("representative_reconstruction_incomplete");
  }
  if (input.crossViewAlignment.status !== "accepted") {
    reasons.push("cross_view_alignment_not_verified");
  }

  const certificate = input.validationCertificate;
  if (!certificate) {
    reasons.push("validation_certificate_missing");
  } else {
    reasons.push(...certificateFailureReasons(certificate));
  }

  if (reasons.length > 0 || !certificate) {
    return Object.freeze({
      status: "blocked" as const,
      reasons: Object.freeze([...new Set(reasons)]),
    });
  }

  return Object.freeze({
    status: "eligible_for_feature_flag_rollout" as const,
    certificate,
  });
}
