import type { CrossViewPhaseAlignmentResultV1 } from "@/lib/shooting-profile/cross-view-alignment";

export type ReleaseGateReasonV1 =
  | "feature_flags_incomplete"
  | "representative_reconstruction_incomplete"
  | "cross_view_alignment_not_verified"
  | "validation_certificate_missing"
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

export type RepresentativeReleaseGateInputV1 = Readonly<{
  flags: Readonly<{
    captureV2: boolean;
    profileV2: boolean;
    representative4DViewer: boolean;
  }>;
  representativeStatus: "complete" | "recapture_required";
  crossViewAlignment: CrossViewPhaseAlignmentResultV1;
  validationCertificate?: ReleaseValidationCertificateV1;
}>;

export type RepresentativeReleaseGateResultV1 =
  | Readonly<{
    status: "eligible_for_feature_flag_rollout";
    certificate: ReleaseValidationCertificateV1;
  }>
  | Readonly<{
    status: "blocked";
    reasons: readonly ReleaseGateReasonV1[];
  }>;

/**
 * Conservative product-release gate for the representative 4D pipeline.
 *
 * This deliberately does not invent MAE/false-reject numerical thresholds in
 * code. Those values belong in a pre-registered validation protocol. This gate
 * only accepts a signed-off certificate stating that the versioned protocol
 * passed on the exact commit being considered for rollout.
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
