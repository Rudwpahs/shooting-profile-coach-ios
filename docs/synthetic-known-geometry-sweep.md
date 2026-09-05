# Synthetic known-geometry sweep

The first dataset in [`representative-4d-validation-protocol.md`](representative-4d-validation-protocol.md)
("Synthetic known geometry — 200 generated sessions"). It runs generated front/side sessions through
the **real** two-view pipeline (`buildTwoViewRepresentativeProfile`) and writes a derived aggregate
report. Everything is synthetic, so the report contains no consent, media, or landmark data and is
safe to commit.

```bash
corepack pnpm sweep:synthetic -- --sessions 200 --output docs/evaluation/synthetic-known-geometry-sweep.json
```

Exit code is `0` only when there are no expectation violations, no invariant violations, and the
determinism recheck reproduces. The committed report is
[`docs/evaluation/synthetic-known-geometry-sweep.json`](evaluation/synthetic-known-geometry-sweep.json).

## What it varies

| Axis | Values |
| --- | --- |
| capture mode | Basic 1+1, High 3+3 |
| shooting hand | right, left |
| aspect ratio | portrait 1080×1920, landscape 1920×1080, square 1440×1440 |
| cross-view phase shift | 0, 0.02, 0.04 (clean) plus a 0.09 borderline case |
| observation noise | 2e-6 … 4e-5 source-height units |
| landmark visibility | 0.95, 0.85, 0.70, plus one below the consensus floor |
| degeneracy | duplicate view, mirrored view, slower first half, frozen shooting arm, stalled clip |

The plan is deterministic: `buildSyntheticSweepPlan(n)` always yields the same scenarios, the fixed
contract scenarios always lead it, and `buildSyntheticSweepPlan(40).slice(0, 12)` equals
`buildSyntheticSweepPlan(12)`.

## What it asserts

Every completed profile is checked against the frozen contract: the V2 codec accepts it (101-sample
grid, canonical anchors, PSD covariance), exactly the 12 persisted joints appear in every frame, all
coordinates are finite, forward-kinematic bone lengths stay inside
`templateBoneLengthTolerance`, the boundary literal is unchanged, and Basic confidence never exceeds
0.65.

Scenarios carry one of three expectations. `accepts` and `rejects` are contract promises and a
mismatch fails the run. `unspecified` records the outcome without judging it — used only for the
0.09 phase-shift borderline case, where the pipeline makes no promise on which side of the 0.10
limit detection lands.

## 2026-09-05 result (200 sessions, geometry gate in the product path)

| Measure | Value |
| --- | --- |
| complete / recapture | 194 / 6 |
| recapture reasons | `phase_detection_failed` ×3, `cross_view_phase_mismatch` ×1, `duplicate_view_projection` ×1, `mirrored_view_projection` ×1 |
| expectations | 199 satisfied, **0** violated, 1 unspecified (phase borderline) |
| invariant violations | **0** |
| worst bone-length drift | 4.44e-16 against a 1e-5 tolerance |
| maximum directional cone | 21.93° against the 25° admission gate |
| confidence range | 0.65 (Basic cap) … 0.793 (High) |
| determinism recheck | reproduced |
| runtime | 36.3 s total, 59 ms median session |

The first run of this sweep (same day, before the gate moved) completed 196 / 4 with the two
same-projection scenarios recorded as `unspecified`; the only difference between the two runs is
the two new recaptures.

**Aspect invariance holds.** Landscape (64/64) and square (63/63) sessions complete at the same rate
as portrait, so the isotropic source-height conversion is not distorted by the aspect ratio. This was
previously untested — every earlier fixture was 1080×1920.

## Gap this sweep exposed, and how it was closed

The first run showed that `assessCrossViewGeometry` — which refuses two views that are the same
projection — was wired into the **private evaluation path only**. The profile-building path the
product actually uses did not call it, so `duplicate_view` and `mirrored_view` sessions completed
and would have produced a confident, geometrically wrong saved profile from two clips filmed at the
same angle.

The gate now runs inside `buildTwoViewRepresentativeProfile`, on the attempts the pipeline has
already phase-normalized (`assessNormalizedCrossViewGeometry`, no second phase detection), after
phase normalization and before per-view consensus. A positively identified duplicate or mirror is a
typed recapture — `duplicate_view_projection` / `mirrored_view_projection` — with every attempt
listed and no partial output; when the gate cannot measure a view it defers, so
`phase_detection_failed` and the consensus reasons stay visible. The verdict, including the measured
minimum normalized view distance, is attached to every pipeline result and copied into the derived
evaluation report as `crossViewGeometry`, so the first real-video run will show where a genuine
pair lands relative to the provisional 0.04 limit. Both scenarios are now `rejects`.

This is a product admission tightening: a session made from two same-angle clips asks for a retake
instead of saving. No threshold, formula, phase grid, joint set, confidence cap, or flag changed.

## Known coverage limits

- Occlusion is modelled as one uniform visibility value per session, not as individual landmarks
  dropping out; only one scenario sits below the consensus floor.
- Rotation, lens distortion, and rolling-shutter effects are not modelled.
- The generator emits a closed template-length skeleton, so this sweep proves internal consistency
  and rejection behaviour. It says nothing about accuracy against a real body, which needs the
  rig/optical-mocap dataset in the validation protocol.
