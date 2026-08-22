# Task 1B brief — fail-closed representative profile codec

## Scope

Modify only:

- `lib/shooting-profile/codec.ts`
- `tests/shooting-profile-contract.test.ts`
- this task's implementer report

Do not modify types, reconstruction, persistence, UI, dependencies, or GitHub.

## Required behavior

`parseRepresentativePose4D` is the strict boundary for a completed 101-frame representative profile. It must reject every framed object that does not satisfy all of these:

- exact existing top-level and nested key allowlists remain;
- `quality.passed === true` and `quality.reasons` is exactly an empty array;
- exactly 101 present/non-sparse frames;
- frame `i` has phase exactly `i / 100` within the existing narrow deterministic tolerance; first is 0 and last is 1;
- five phase anchors remain exact canonical IDs/order/phases;
- every covariance tuple is finite and is a valid symmetric 3×3 covariance in packed order `[xx, xy, xz, yy, yz, zz]`: diagonal entries nonnegative and matrix positive semidefinite within a narrow numerical tolerance (all principal minors/eigen-equivalent checks); reject negative variance and materially indefinite covariance;
- `directionalConeDegrees` is finite and in `[0, 180]`;
- existing boundary/schema/mode/timeBasis/units/joint allowlists remain unchanged.

Do not silently repair, clamp, fill, reorder, or synthesize. A failed/recapture result belongs outside this framed profile codec and must contain no profile frames.

## Tests first

Add failing tests before production edits for: failed quality, nonempty reasons, 100/102/sparse frames, shifted/noncanonical phases including `0.001…0.999`, negative diagonal variance, indefinite covariance with nonnegative diagonal, negative cone, cone >180, and a valid correlated PSD covariance. Preserve all existing valid fixtures.

## Verification

Use only static/read-only source checks. An unrelated auditor materialized `node_modules` without authorization; do not use it or run Vitest/tsc/eslint/package managers. Do not install, commit, or upload.

