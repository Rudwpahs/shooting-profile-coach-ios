# Representative V2 rollout gate

Representative V2 remains **default-off** until the validation protocol in `docs/representative-4d-validation-protocol.md` has been completed on the exact source commit being shipped.

This gate controls build-time feature activation. It does not replace per-capture admission, cross-view alignment, reconstruction uncertainty, recapture behavior, or the human release review.

## Required rollout inputs

A rollout build that requests any Representative V2 surface uses five public build inputs:

- `EXPO_PUBLIC_FORMPATH_CAPTURE_V2=1`
- `EXPO_PUBLIC_FORMPATH_PROFILE_V2=1`
- `EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D=1`
- `EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA=<exact source commit SHA>`
- `EXPO_PUBLIC_FORMPATH_RELEASE_VALIDATION_CERTIFICATE=<reviewed JSON certificate>`

If no V2 surface is requested, the feature stays off and no certificate is required.

If rollout is requested, the effective `FORMPATH_FLAGS` remain all `false` unless the complete gate passes. A missing/malformed certificate, missing build commit identity, failed validation field, partial feature-flag request, or certificate/build commit mismatch fails closed.

## Certificate contract

The JSON value must match `ReleaseValidationCertificateV1`:

```json
{
  "version": "representative_release_validation_certificate_v1",
  "independentGroundTruth": true,
  "preRegisteredAccuracyGatePassed": true,
  "preRegisteredFalseRejectGatePassed": true,
  "physicalIPhoneMatrixPassed": true,
  "offlineReopenValidationPassed": true,
  "privacyDeletionValidationPassed": true,
  "evidenceArtifactPath": "docs/evaluation/<reviewed-artifact>.json",
  "evaluatedCommitSha": "<exact source commit SHA>"
}
```

The booleans above are not assertions an engineer may set merely to make a build pass. They summarize evidence already reviewed under the validation protocol. `evaluatedCommitSha` must equal the build's `EXPO_PUBLIC_FORMPATH_BUILD_COMMIT_SHA` exactly.

No passing certificate is committed as a project default. Creating one is a release action performed only after the required held-out, device, offline/reopen, privacy/deletion, and other protocol evidence exists.

## Trust boundary

The certificate contains no secrets and is intentionally public in an Expo build. It is a **release-process guard**, not a cryptographic authorization mechanism. It prevents accidental activation of unvalidated code and prevents a validation record for one source revision from being silently reused by another revision.

Repository, CI, deployment, signing, Firebase/IAM, App Store, and human review controls remain separate security and release boundaries.

## Operational sequence

1. Keep all three Representative V2 flags absent or `0` during development and validation.
2. Freeze the candidate source commit.
3. Run the complete validation protocol against that exact commit and preserve its evidence artifact.
4. Review the evidence independently and create the certificate only if every required gate passed.
5. Build from the same commit, embedding its SHA plus the reviewed certificate.
6. Request all three V2 flags together.
7. Confirm `FORMPATH_FLAG_RESOLUTION.rollout.status === "eligible_for_feature_flag_rollout"` in release diagnostics before distribution.
8. Any source change after validation requires a new applicable validation record before V2 can be re-enabled.

## Failure behavior

The resolver disables every Representative V2 surface together when rollout is blocked. It never enables only capture, only profile persistence, or only the representative viewer from a partially validated rollout request.

Known blocking reasons include:

- `validation_certificate_missing`
- `validation_certificate_invalid`
- `build_commit_sha_missing`
- `validation_certificate_commit_mismatch`
- `feature_flags_incomplete`
- validation-specific failures such as ground-truth, accuracy, false-reject, iPhone, offline/reopen, or privacy/deletion gates

These reasons describe rollout eligibility only. They must not be confused with per-user recapture reasons from the shooting reconstruction pipeline.
