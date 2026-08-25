# Task 4B implementer report — deterministic perturbation uncertainty and shoulder closure

## Status and scope

Implemented the Task 4B deterministic engineering-sensitivity layer on top of the independently approved Task 3B subset and baseline reconstruction. The production profile remains `representative_phase_fused_4d_estimate_not_actual_3d`, uses the exact 101-sample `normalized_shot_phase` grid, persists `heuristic_v1`, and keeps baseline joint positions and selected IDs separate from the scenario samples.

Only the scoped files and this report were changed:

- `lib/shooting-profile/engineering-thresholds.ts`
- `lib/shooting-profile/representative-sequence.ts`
- `lib/shooting-profile/uncertainty.ts` (new pure deterministic helper)
- `tests/shooting-profile-representative-sequence.test.ts`
- `tests/fixtures/synthetic-dual-view.ts`
- `.superpowers/sdd/2026-08-22-representative-dual-view-4d-project-1/task-4b-implementer-report.md`

Phase detection, Task 3B subset selection/aggregation, native code, codec/types, persistence, UI, dependencies, V1, and GitHub were not edited. No package manager, project binary, `node_modules`, TypeScript compiler, Vitest, ESLint, commit, or upload was used.

## Test-first RED record

Tests and synthetic-fixture controls were added before production changes. The new RED specification named the production breaks it must catch:

- missing fixed coordinate-only and phase-only scenario planning;
- scenario/take order dependence or take mixing;
- omission of an admitted third take or inclusion of a Task 3B-rejected take;
- diagonal-only, nonfinite, or non-PSD covariance;
- uncertainty that falls when visibility, bounded coordinate jitter, or retained anchor jitter worsens;
- scenario means replacing the frozen baseline pose;
- raw input `z` influencing positions, uncertainty, confidence, or selection;
- a shoulder vector whose angle or length cannot close against the one-unit template;
- too few valid perturbation scenarios or perturbation-induced cone overflow producing partial output.

Because executable project tests are prohibited while the dependency tree is quarantined, RED was verified with a dependency-free static command. Before production edits it exited `0` only when `lib/shooting-profile/uncertainty.ts` was absent, both new stable reasons were absent from production, and the test file contained the new planner/PSD/closure/shortfall expectations. This is recorded RED intent, not a substitute for executing Vitest later.

## Exact deterministic scenario table

The table is frozen as `DETERMINISTIC_PERTURBATION_SCENARIOS_V1`; there is no randomness, clock, wall time, or input-order dependence.

| ID | Coordinate pattern | Coordinate sign | Front phase | Side phase |
|---|---:|---:|---:|---:|
| `baseline` | A | 0 | 0 | 0 |
| `landmark_a_plus` | A | +1 | 0 | 0 |
| `landmark_a_minus` | A | -1 | 0 | 0 |
| `phase_opposed_plus` | A | 0 | +1 | -1 |
| `phase_opposed_minus` | A | 0 | -1 | +1 |
| `combined_b_front_plus` | B | +1 | +1 | 0 |
| `combined_b_front_minus` | B | -1 | -1 | 0 |
| `combined_c_side_plus` | C | +1 | 0 | +1 |
| `combined_c_side_minus` | C | -1 | 0 | -1 |

Landmark base directions cycle by landmark index through `(+x, +y, -x, -y)`. Pattern A is identity, B is a 90-degree rotation, and C is a 45-degree rotation. Shooting-side x offsets are mirrored to respect the current side-axis convention. A landmark is perturbed once by a deterministic function of `(landmarkIndex, view, pattern)`, so a shoulder/elbow/wrist shared by connected bones receives exactly the same offset in every use.

For visibility `q`:

`offset = min(0.00075, 0.00025 * (1 + (1 - q) * 2))`

in upright-source-height isotropic units. It is finite, bounded, and monotonically nondecreasing as visibility falls. A coordinate scenario is rejected when either endpoint offset exceeds `0.30 * originalProjectedBoneLength`, or when perturbed evidence is nonfinite/collapsed.

For retained normalized anchor positions, let `A` be the maximum pairwise absolute inner-anchor dispersion within either retained view. The actual integer source-phase radius is:

`r = clamp(1 + ceil(100 * A), 1, 3)`

Each view samples its own source index `clamp(outputIndex + viewPhaseDirection * r, 0, 100)` while the returned frame remains at the canonical `outputIndex / 100`. The opposed rows directly probe the core separate-shot risk where the front evidence is early while the side evidence is late (and vice versa); the combined rows also isolate a one-view shift. A continuous `0.02 * A^2` isotropic variance floor ensures a larger still-admissible anchor dispersion remains observable even when two values fall in the same discrete/clamped radius bucket.

Basic uses the one retained front/side pair times all 9 patterns. High sorts the final Task 3B retained IDs and enumerates the Cartesian product:

`retainedFrontAttempt × retainedShootingSideAttempt × fixedPattern`

One plan row retains that exact front and side attempt for all 101 phases and every bone. There is no per-frame, per-landmark, or per-bone take selection. The minimum accepted count is:

`max(7, ceil(0.75 * totalPlannedScenarios))`

Any lower count returns only `perturbation_scenario_shortfall` plus stable affected bones.

## Reconstruction, covariance, cone, and confidence formulas

Every scenario rebuilds both projected views from x/y/visibility only, calls the existing `reconstructBoneDirection` through `reconstructObservedBone` for all 12 observed bones and all 101 phases, applies the existing radius-2 direction smoothing/resultant gate, and calls the existing fixed-length `forwardKinematicsFrame`. Input MediaPipe `z` is never read. Scenario FK samples never replace baseline positions; output `joints` still come from the original Task 3B aggregated/smoothed directions.

For joint samples `p_s` from the accepted whole-trajectory scenarios:

- `mean = sum(p_s) / n`
- `sampleCov = sum((p_s - mean)(p_s - mean)^T) / (n - 1)`
- packed order is `[xx, xy, xz, yy, yz, zz]`

This centered outer-product sum is PSD by construction. The only subsequent operation is addition of nonnegative isotropic diagonal floors; there is no determinant/eigenvalue repair of an arbitrary matrix.

For joint `j`, the primary isotropic floor is:

`F_j = maxEvidenceAncestorVariance + 0.000001 + 25 * maxAncestorCoordinateRoughnessSquared + 0.02 * A^2`

`coordinateRoughnessSquared` is the retained-attempt mean of `dx2^2 + dy2^2`, where `dx2 = x[i-1] - 2x[i] + x[i+1]` and likewise for y, across both endpoints and both retained views. A further nonnegative ancestor-envelope floor raises a child diagonal only enough that no Cartesian marginal falls below its already-built parent envelope. Since this is also an isotropic diagonal addition to a PSD sample matrix, PSD is preserved.

For directional sensitivity at a joint/phase:

`S = max angle(baselineSmoothedBoneDirection, scenarioSmoothedBoneDirection)`

over every accepted scenario and every observed bone in that joint's ancestor path. The reported cone is:

`max(existingEvidenceCone, S in degrees)`

The arm paths explicitly include `shoulder_line` from both shoulders through both wrists. Any evidence or perturbation sensitivity above the existing 25-degree admission cap returns only `uncertainty_exceeds_limit` and affected observed bones.

Evidence-only confidence is still calculated by the prior Task 4 formula. Perturbations can only lower it:

`confidence = evidenceOnly * (1 - 0.05 * clamp(maxSensitivityDegrees / 25, 0, 1))`

and Basic remains `min(confidence, 0.65)`. The code additionally takes `min(evidenceOnly, adjusted)` so sensitivity can never raise confidence.

## Shoulder-line closure

The persisted unit is exactly `template_shoulder_breadths`; therefore the versioned target is exactly `1.0`, not a value tuned to the old fixture. The fixture was corrected instead while retaining every existing hip/torso template length.

For every phase, after radius-2 smoothing of both the FK input directions and the independently reconstructed observed `shoulder_line` series:

- `s_fk = rightShoulder_fk - leftShoulder_fk`
- `angularResidual = angle(s_fk, observedShoulderLineDirection)`
- `normalizedLengthResidual = abs(norm(s_fk) - 1.0) / 1.0`

The unvalidated engineering limits are 15 degrees and `0.12`. FK joint positions are not smoothed. Any nonfinite value or breach returns only:

`{ status: "recapture_required", reason: "inconsistent_skeleton_closure", affectedBones: ["shoulder_line"] }`

The synthetic golden constructs equal 1.10 torso directions around a common perpendicular component such that their endpoint difference plus the fixed 0.34/0.34 hip separation yields a shoulder vector with norm exactly 1.0. No production length was redefined.

## Dependency-free static/math GREEN evidence

The following permitted checks were run after implementation:

1. A delimiter/source hygiene scanner reported all five changed TypeScript files balanced; trailing whitespace, `Math.random`, clock access, and production raw-landmark `z` reads were absent.
2. Static contract scans found the fixed scenario planner, whole-pair consumption, continuous coordinate/anchor floors, sample covariance builder, both stable recapture reasons, shoulder-line arm ancestry, exact one-unit closure target, and named acceptance/closure limits. The obsolete diagonal-only `propagatedUncertainty` helper is absent.
3. An independent geometry/covariance probe exited `0`: the corrected golden shoulder width was `1.0000000000000002`; compressed side-view shoulder-rise evidence produced an angular residual above 24 degrees (over the 15-degree limit) while retaining near-unit length; vertical equal-torso evidence produced normalized length residual `0.32` (over `0.12`); and a hand-derived correlated sample covariance plus nonnegative floor had nonnegative principal minors and determinant.
4. A separate near-collapsed-bone calculation showed the `0.00010` projected-length fixture accepts only the three coordinate-zero rows (below 7/9), while `0.0010` stays under the 30-percent endpoint-offset ceiling and produces accepted angular sensitivities above 25 degrees for multiple fixed coordinate patterns.

These are static/mathematical evidence only. Vitest, TypeScript, ESLint, strict codec execution, Xcode/device, and physical capture validation remain pending until an authorized clean dependency/device environment exists.

## Scenario regression matrix

| Scenario | Expected result |
|---|---|
| same High input repeated/permuted | byte-for-byte equal profile/confidence/selection |
| Basic fixed coordinate and phase rows | nonzero PSD covariance, correlated off-diagonal present |
| lower relevant visibility | covariance/cone no smaller; at least one strict increase |
| larger bounded deterministic x/y noise | overall covariance no smaller; relevant covariance increases |
| larger retained anchor jitter | baseline joints unchanged; covariance strictly increases |
| admitted High third take | appears in whole-pair plan and can increase uncertainty |
| Task 3B-rejected take | absent from whole-pair plan |
| all input `z` changed | identical complete result |
| physically closed one-unit shoulder loop | complete |
| side-view angular inconsistency | `inconsistent_skeleton_closure`, no partial output |
| 0.68-unit equal-torso shoulder width | independent length closure failure, no partial output |
| `0.00010` projected forearm | `perturbation_scenario_shortfall`, no partial output |
| `0.0010` projected forearm | perturbation cone overflow, no partial output |
| every 101 × 12 output covariance | finite, PSD, strict codec-compatible literal/model |

## Boundary and remaining validation

`heuristic_v1` remains a deterministic engineering sensitivity ranker, not a confidence interval, percentile, calibrated probability, clinical result, or validated biomechanics. The coordinate magnitude, phase radius, floors, confidence penalty, closure limits, and template ratios are versioned unvalidated defaults. Feature flags remain outside this task and default-off under the existing integration plan. Executable suites and real front/side capture validation must be completed before enabling V2.
