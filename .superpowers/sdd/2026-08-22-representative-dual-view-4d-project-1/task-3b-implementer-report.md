# Task 3B implementer report

## Status and scope

Implemented Task 3B's fail-closed shot admission, upright-source-height isotropic coordinates, visibility-weighted 2D pre-angle smoothing, all-101/all-bone deterministic consensus, signed circular aggregation, retained-spread gating, and uncertainty/confidence handoff.

Only the eight scoped source/test/fixture files and this report were changed:

- `lib/shooting-profile/engineering-thresholds.ts`
- `lib/shooting-profile/phase-normalization.ts`
- `lib/shooting-profile/repeated-shot.ts`
- `lib/shooting-profile/representative-sequence.ts`
- `tests/shooting-profile-phase-normalization.test.ts`
- `tests/shooting-profile-repeated-shot.test.ts`
- `tests/shooting-profile-representative-sequence.test.ts`
- `tests/fixtures/synthetic-dual-view.ts`
- `.superpowers/sdd/2026-08-22-representative-dual-view-4d-project-1/task-3b-implementer-report.md`

Native detection/adapter, codec, persistence, UI/hook, dependencies, V1 modules, and GitHub were not changed. No package manager, dependency install, commit, or upload was used.

## Test-first history and static RED

The phase, repeated-shot, representative-sequence, and synthetic-fixture regressions were edited before any production file. The new tests specify:

- stationary front and shooting-side input, sub-threshold jitter, realistic walking translation, missing rise, a valid body dip/rise without shooting-wrist release evidence, degenerate scale, and a release-window timestamp gap fail before normalized frames exist;
- ready/follow-through anchors are invariant to near-idle pre-roll and appended idle tails; the same interpolated shot at 15 and 30 fps lands within one 15-fps anchor neighborhood; release-truncated and 1 ms duplicate clips fail without anchors;
- credible right- and left-hand attempts retain ordered canonical anchors;
- landscape, portrait, and square 45-degree pixel projections reconstruct an absolute horizontal/vertical ratio of one;
- raw MediaPipe z stays absent and low-visibility 2D spikes are deterministically down-weighted while exact endpoints, phases, and visibility are retained;
- phase-40 corruption is evaluated even though indices 0/25/50/75/100 agree;
- one corrupt High-accuracy take is excluded, incompatible phase-40 corruptions recapture, and every input permutation selects the same whole-view subset;
- circular output is an actual retained signed direction with stable attempt-ID ties, visibility weighting, per-sample MAD/spread, and a retained-spread gate;
- accepted third-take dispersion increases uncertainty and lowers confidence;
- existing strict 101-frame, Basic cap, z rejection, fixed-length FK, conditioning/sign, uncertainty ceiling, no-partial-profile, and V1 boundary assertions remain.

Because the brief prohibits using the materialized `node_modules`, Vitest and TypeScript execution were not authorized. A dependency-free Node built-in static RED probe was run after the tests and before production edits. It exited `1` and reported all expected old defects:

```json
{
  "missing": [
    "PhaseDetectionError",
    "invalid_source_dimensions",
    "insufficient_total_motion",
    "x_iso",
    "confidenceWeighted",
    "maximumRetainedAngularSpreadRadians",
    "AggregatedProjectedBoneV1",
    "angularMadRadians",
    "consensusDispersionRadians"
  ],
  "markerOnly": true,
  "coordinateMedian": true,
  "pairOnly": true
}
```

This is static RED evidence only. It is not a claim that the Vitest files were executed.

## Admission and coordinate implementation

`PhaseDetectionError` now exposes stable, media-identifier-free reasons. Detection validates positive finite display dimensions and required landmark visibility, then converts restored normalized points exactly once using:

```text
x_iso = (x - 0.5) * (displayWidth / displayHeight)
y_iso = y - 0.5
```

The robust body scale is the median shooting-leg chain length `pelvis->knee + knee->ankle` in source-height units. Admission then requires total tracked range; the latest credible baseline immediately before the dip; dip and post-dip rise excursions; shooting-wrist rise plus elbow-to-wrist extension; body-scale-normalized release-proxy velocity computed from each positive observed timestamp delta; the earliest retained follow-through frame after a minimum elapsed duration; and no critical timestamp bridge across that evidence interval. A failed gate throws before anchors can be returned.

The explicitly unvalidated V1 defaults added under `ENGINEERING_THRESHOLDS_V1` are:

| Threshold | V1 default |
|---|---:|
| Minimum visible phase landmark | 0.50 |
| Minimum body scale | 0.12 source-height units |
| Minimum total tracked motion | 0.30 body scales |
| Maximum ready-baseline excursion | 0.03 body scales |
| Minimum dip excursion | 0.12 body scales |
| Minimum post-dip rise | 0.10 body scales |
| Minimum shooting-wrist rise | 0.25 body scales |
| Minimum shooting-wrist extension | 0.04 body scales |
| Minimum release-proxy velocity | 1.0 body scales/second |
| Maximum critical detected-frame gap | 300 ms |
| Minimum release-to-follow-through elapsed time | 120 ms |
| Maximum follow-through wrist drop | 0.15 body scales |
| Maximum follow-through extension loss | 0.03 body scales |

Resampling still defaults to exactly 101 samples at `index / 100`, stays inside one attempt, and drops raw z. It converts interpolated upright-source normalized x/y into isotropic units, then applies a radius-2 deterministic triangular temporal window weighted by visibility. Sample 0 and sample 100 remain exact; phase, timestamp, view, hand, take index, and center-sample visibility are not smoothed.

## Consensus and circular evidence

`CONSENSUS_V1.evaluationPhaseIndices` is now the complete ordered integer range 0 through 100, and config validation rejects any other V1 evaluation grid. Pair admission visits every required projected bone at every one of those samples. Angles use signed proximal-to-distal unit directions; a single over-limit bone/sample rejects the pair.

High accuracy still accepts exactly three inputs and starts from the lowest robust complete pair with lexicographic ties. The third take is included only when it passes the configured direction and spread gates against every already retained take. The confidence-weighted whole-attempt medoid is then recomputed from the final retained subset with a stable ID tie-break. The frozen chosen ID set is used for every bone and sample.

`aggregateViewAttempts` no longer builds coordinate-wise landmark medians. Each bone/sample now exposes `AggregatedProjectedBoneV1` with:

- an actual retained signed unit direction selected by visibility-product-weighted circular medoid;
- weighted projected length and availability;
- circular median angular deviation;
- maximum retained angular spread;
- the per-sample medoid attempt ID and complete frozen support ID set.

Every retained spread is gated by the named 12-degree unvalidated V1 cap. `consensusDispersionRadians` is the mean over all retained required bones and all 101 samples, so a retained third take contributes evidence rather than disappearing behind the original selected-pair score.

## Reconstruction, uncertainty, and confidence handoff

`reconstructObservedBone` now consumes front/side aggregated directions, projected lengths, availability, and retained spread directly. It no longer consumes a synthetic coordinate map. Image y-down is converted to mathematical y-up once. The existing projection-constraint solver, conditioning/sign checks, shooting-hand side-axis convention, and separate-shot phase fusion are unchanged; no tangent production implementation was added.

Per-bone/sample heuristic uncertainty normalizes that bone/sample's retained spread by the configured angular pair limit. Joint uncertainty still propagates the worst ancestor evidence and keeps `model: "heuristic_v1"` plus the existing 25-degree fail-closed ceiling. Overall confidence now averages normalized retained spread, conditioning, and availability over all 12 observed bones and all 101 phase samples. Basic remains capped at 0.65. No statistical coverage claim was added.

## Interface-ripple self-review

A repository-wide static call-site scan excluding `node_modules` found:

- `detectPhaseAnchors` and `resampleAttemptToPhaseGrid` have one non-test caller, `hooks/use-shooting-profile-capture.ts`; their call signatures are unchanged. A phase error remains contained by the hook's existing aggregation `try/catch`.
- `AggregatedPhaseSampleFrameV1` is consumed only by the scoped repeated-shot tests and `representative-sequence.ts`. Its internal evidence shape changed from coordinate medians to projected-bone evidence at both sites.
- `aggregateViewAttempts` is consumed only by the scoped representative builder/tests.
- No representative fusion path reads `sourceTimestampMs`; front and shooting-side source timestamps remain separate and only normalized phase index 0 through 100 joins the views.
- `SourceObservation2DV2` and V1 contracts were not edited. The legacy `sourceLandmarks` property name on `PhaseSampleFrameV2` now carries documented upright-source-height isotropic x/y after normalization; no second scale is applied downstream.

## Static verification evidence

No project dependency was loaded. Three fresh dependency-free/static checks completed:

1. A Node built-in implementation scan exited `0` with all checks `true`: named admission thresholds, exact isotropic formula, stable admission errors, all-101 config, absence of coordinate aggregation, circular evidence, retained-spread gate, per-bone uncertainty handoff, absence of selected-pair dispersion use, and absence of timestamp fusion.
2. A Node built-in test-coverage scan exited `0` with all checks `true` for stationary/jitter/walking/missing-rise/scale/gap, both hands, three aspects, z exclusion, smoothing, phase-40 exclusion/recapture, permutations, circular/weighted medoid, third-take spread, uncertainty, and no partial profile.
3. A dependency-free delimiter scanner reported all eight touched TypeScript files balanced. A shell scan found no trailing whitespace or conflict markers.

## Blockers and concerns

- Per the explicit verification constraint, Vitest, `tsc`, and ESLint were not run. Therefore runtime test pass status and TypeScript compile status are not proven in this task report. The authorized follow-up is to run the focused phase/repeated-shot/representative suites and a type check only after the workspace dependency provenance is resolved.
- Admission amplitudes, smoothing radius, angular limits, retained-spread cap, confidence weights, and uncertainty weights are deterministic engineering defaults. They are not validated biomechanics and must not be labeled calibrated, anatomical truth, clinical output, or statistical coverage.
- Task 5B still owns native ROI, native 80-percent admission, and richer attempted-versus-detected gap evidence. This task only fails critical bridges visible in the actual returned detection timestamps.
- Landmark/phase perturbation and statistically calibrated uncertainty remain out of scope; `heuristic_v1` is preserved.

## Independent-review remediation: complete-link admission and conservative spread

The reviewer identified a real three-take geometry defect. Third-take admission checked only the selected pair's medoid. Thus directions at `0`, `+7`, and `-7` degrees could all survive an 8-degree medoid gate even though the two endpoints were 14 degrees apart. The retained spread was also the maximum medoid distance, so it reported only 7 degrees and hid the admitted subset diameter.

Two regressions were added before the production correction:

1. All six input permutations of `0/+7/-7` must deterministically retain only `take-a/take-b`; the `+7/-7` pair is beyond the 8-degree complete-link gate.
2. A fully compatible `0/+3/+6` subset must report 6 degrees of retained spread, not the 3-degree medoid radius.

A dependency-free static RED probe exited `1` and reported:

```json
{
  "medoidOnly": true,
  "radiusOnly": true,
  "completeLink": false,
  "pairwiseSpread": false
}
```

The minimal production correction changes third-take admission to require `measurePair` success against every already retained attempt. The selected initial pair is already a passing complete link, so after this check every admitted take satisfies the configured all-bone/all-101 pair gate against every other admitted take. Robust-score differences within `1e-12` are treated as ties before stable attempt IDs are applied, preserving deterministic subset and medoid behavior under floating-point symmetry and input permutation.

`angularMadRadians` remains the circular median distance from the selected circular medoid. `retainedSpreadRadians` now has the distinct conservative meaning **maximum pairwise angular separation among all retained signed directions at that bone/sample**. The existing 12-degree retained-spread gate and downstream uncertainty/confidence therefore consume subset diameter and cannot hide two endpoints behind a central medoid.

The remediation touched only:

- `tests/shooting-profile-repeated-shot.test.ts` (first)
- `lib/shooting-profile/repeated-shot.ts` (second)
- this implementer report

The original prohibition on project binaries remains in force; the remediation is verified only by fresh dependency-free static checks documented in the handoff, not by Vitest or TypeScript execution.

## Independent-review remediation: evidence-derived phases and final-subset circular behavior

The second independent review found that phase boundaries still depended on clip boundaries and frame cadence: ready used the clip start, follow-through used the clip end, and release used per-frame displacement without timestamp normalization. It also found that the selection-level medoid ID was computed before an accepted third take was appended, and that direct signed wraparound/antipodal regressions were absent.

The regressions were added before the corresponding production edits. Separate dependency-free static RED probes exited `1` and recorded the old phase defects:

```json
{
  "clipBoundaryReady": true,
  "clipBoundaryFollow": true,
  "displacementRelease": true,
  "noDeltaTimeRelease": true,
  "missingReadyTolerance": true,
  "missingFollowDuration": true,
  "newRegressionsPresent": true
}
```

and the old repeated-shot defects:

```json
{
  "stalePairMedoid": true,
  "noFinalMedoidRecompute": true,
  "wraparoundRegressionPresent": true,
  "antipodalRegressionPresent": true,
  "finalMedoidExpectationPresent": true
}
```

The phase correction now:

- selects the latest pre-dip observation within the named `0.03`-body-scale ready-baseline tolerance, so identical or near-idle pre-roll does not move ready to the arbitrary clip start;
- measures the release proxy in body scales per second using the actual positive adjacent timestamp delta and the named `1.0 body scales/second` minimum;
- selects the earliest post-release observation that is at least `120 ms` later while retaining wrist position and elbow-to-wrist extension within their named tolerances;
- scans the maximum `300 ms` critical detected-frame gap only from the selected ready evidence through selected follow-through evidence, so appended idle tail is irrelevant while a release-window bridge still fails closed;
- uses modest, joint-specific continuous shot and walking fixtures rather than moving every landmark across the full frame.

Explicit tests cover pre-roll and appended-tail invariance, 15/30-fps cadence equivalence within one 15-fps neighborhood, a release-truncated clip, a 1 ms duplicate of release, a valid body dip/rise with no shooting-wrist rise/extension (`missing_release_proxy` and no anchors), realistic translation/walking, and the retained five-frame right/left credible case.

The repeated-shot correction recomputes `selection.medoidAttemptId` after complete-link third-take admission. For the compatible `0/.04/.06`-radian subset this yields `take-b`, the whole-subset medoid, rather than the stale initial-pair `take-a`. Direct tests also establish that `+179/-179` degrees are approximately 2 degrees apart, while true antipodal directions reject when no complete pair exists. The complete-link permutation and maximum-pairwise-diameter regressions remain in force, and the outdated admission wording was removed.

Fresh dependency-free STATIC-GREEN probes were kept separate:

1. The phase source/test scan exited `0` with all 15 checks true: named ready tolerance, backwards evidence selection, no clip-start ready, timestamp-normalized per-second release velocity, named minimum follow elapsed, earliest qualifying follow evidence, no clip-end follow, evidence-interval gap scan, pre/post-roll, cadence, truncation/1 ms, walking, explicit missing-release, and removal of the all-landmark sweep.
2. The repeated-shot source/test scan exited `0` with all 10 checks true: complete-link inclusion, medoid calculation ordered after final inclusion, deterministic score tolerance, maximum pairwise retained diameter, permutation regression, final-medoid regression, signed wraparound, antipodal rejection, diameter regression, and removal of the outdated title.
3. A dependency-free mathematical phase probe exited `0`: the 15-fps anchors were `[600, 866.666667, 1000, 1333.333333, 1466.666667]`; the 30-fps anchors were `[600, 900, 966.666667, 1300, 1433.333333]`; every anchor differed by at most one 15-fps interval; pre-roll and tail results were identical to the 30-fps base; release-truncated and 1 ms duplicate cases returned `missing_follow_through`; the explicit arm-stationary case returned `missing_release_proxy`; walking returned `missing_dip`; and the release-window timestamp bridge returned `critical_phase_gap`.
4. A dependency-free circular-geometry probe exited `0`: all six `0/+7/-7` input permutations retained `take-a/take-b`; the final `0/.04/.06` subset medoid was `take-b`; `+179/-179` separation was approximately 2 degrees; antipodal separation was 180 degrees; and `0/+3/+6` retained diameter was 6 degrees.

These probes mirror or statically inspect the production math without importing project code. They are evidence for the named invariants, not substitutes for the prohibited Vitest/TypeScript runtime verification.
