# Task 1B implementer report

Date: 2026-08-22  
Task: fail-closed representative profile codec  
Status: implementation and read-only static verification completed; executable verification intentionally not run

## Outcome

- Made `parseRepresentativePose4D` accept only completed profiles: `quality.passed` must be the literal `true`, and `quality.reasons` must be an array of length zero.
- Kept the existing strict object schemas and boundary/schema/mode/time-basis/units/joint allowlists while requiring exactly 101 frames and five canonical anchors (`ready`, `deepestDip`, `rise`, `releaseProxy`, `followThrough`) at phases `0`, `0.25`, `0.5`, `0.75`, and `1` in that order.
- Replaced merely monotonic frame-phase validation with the canonical `index / 100` grid at the existing narrow deterministic tolerance of `1e-12`.
- Added an explicit own-index scan before schema parsing. A length-101 array with any inherited or missing frame slot is rejected instead of being filled, synthesized, or accepted through sparse-array iteration behavior.
- Bounded every finite `directionalConeDegrees` value to the inclusive interval `[0, 180]`.
- Added a finite symmetric packed-covariance PSD check for `[xx, xy, xz, yy, yz, zz]`; it rejects negative diagonal variances, invalid 2x2 principal minors, and a materially negative 3x3 determinant without clamping or repairing values.

## PSD math review

The packed tuple represents:

```text
[ xx  xy  xz ]
[ xy  yy  yz ]
[ xz  yz  zz ]
```

The validator first requires `xx`, `yy`, and `zz` to be nonnegative. For positive variance pairs it normalizes each covariance to its correlation coefficient. The three checks `|rxy|`, `|rxz|`, and `|ryz| <= 1 + 1e-12` are the three 2x2 principal-minor conditions. A zero diagonal permits only exact zero covariance in its row, as required for a PSD matrix.

For positive diagonals, diagonal congruence reduces the final principal-minor condition to the correlation determinant:

```text
1 + 2*rxy*rxz*ryz - rxy^2 - rxz^2 - ryz^2 >= -1e-12
```

This normalized form avoids overflow-prone products of large finite covariance entries. If a diagonal is zero, the enforced zero row reduces PSD to the remaining 2x2 block, which the same correlation bounds already check.

The materially indefinite test tuple `[1, -0.9, -0.9, 1, -0.9, 1]` has nonnegative diagonals and all three 2x2 principal minors equal to `0.19`, but its determinant is `-2.888`; it therefore verifies the full 3x3 check rather than only diagonal or pair checks. The accepted correlated tuple `[4, 2, 1, 2, 0.75, 1.3125]` has 2x2 principal minors `4`, `4.25`, and `2.0625`, and determinant `4`.

## Test-first coverage authored

`tests/shooting-profile-contract.test.ts` was patched before the production codec. It now covers:

- `passed: false` and a nonempty quality-reasons array;
- 100-frame, 102-frame, and genuine sparse length-101 arrays;
- the strictly increasing shifted `0.001 ... 0.999` grid and a shifted interior phase;
- missing, wrong-ID, and wrong-phase canonical anchors;
- negative diagonal variance and determinant-specific materially indefinite covariance;
- a valid finite correlated PSD covariance;
- negative and greater-than-180 directional cones;
- the pre-existing valid profile, unknown-key, nonfinite-coordinate, boundary, phase-order, frame-count, feature-flag, and joint-allowlist behaviors.

The valid fixture was updated from three noncanonical legacy anchors to the five canonical anchors required by the representative sequence and persistence contracts.

## Verification boundary and evidence

The brief prohibits using the newly materialized `node_modules` and prohibits Vitest, TypeScript, ESLint, package-manager, installation, or other executable verification. I did not use those dependencies or commands, so no runtime, compile, lint, or RED/GREEN pass is claimed.

Fresh read-only source inspection verified:

- both numeric tolerances are `1e-12`;
- frame schema length is `101`, canonical anchor schema length is `5`, and the parse boundary contains the own-slot scan;
- frame phases compare against `index / 100`;
- quality uses `z.literal(true)` and a zero-length reasons array;
- covariance inputs remain six finite tuple members before PSD refinement;
- cone bounds are inclusive `min(0).max(180)`;
- tests contain the required 100/102/sparse, `0.001`/`0.999`, quality, covariance, cone, anchor, and correlated-PSD cases.

## Changed files

- `lib/shooting-profile/codec.ts`
- `tests/shooting-profile-contract.test.ts`
- `.superpowers/sdd/2026-08-22-representative-dual-view-4d-project-1/task-1b-implementer-report.md`

No dependency, type, reconstruction, persistence, UI, GitHub, commit, install, upload, or other file change was performed.
