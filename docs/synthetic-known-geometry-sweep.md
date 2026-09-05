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
mismatch fails the run. `unspecified` records the outcome without judging it — used where the
pipeline makes no promise today.

## 2026-09-05 result (200 sessions)

| Measure | Value |
| --- | --- |
| complete / recapture | 196 / 4 |
| recapture reasons | `phase_detection_failed` ×3, `cross_view_phase_mismatch` ×1 |
| expectation violations | **0** |
| invariant violations | **0** |
| worst bone-length drift | 4.44e-16 against a 1e-5 tolerance |
| maximum directional cone | 21.93° against the 25° admission gate |
| confidence range | 0.65 (Basic cap) … 0.793 (High) |
| determinism recheck | reproduced |
| runtime | 37.1 s total, 64 ms median session |

**Aspect invariance holds.** Landscape (64/64) and square (63/63) sessions complete at the same rate
as portrait, so the isotropic source-height conversion is not distorted by the aspect ratio. This was
previously untested — every earlier fixture was 1080×1920.

## Open gap this sweep exposes

`assessCrossViewGeometry` — which refuses two views that are the same projection — is wired into the
**private evaluation path only** (`buildRealVideoEvaluation`). The profile-building path that the
product actually uses does not call it, so `duplicate_view` and `mirrored_view` sessions **complete**
and would produce a confident, geometrically wrong saved profile from two clips filmed at the same
angle. Those two scenarios are therefore marked `unspecified` rather than `rejects`: the pipeline
makes no such promise today, and the sweep records the fact instead of asserting a contract that does
not exist.

Closing it means calling the gate inside `buildTwoViewRepresentativeProfile` and turning those
sessions into a typed recapture. That changes product admission behaviour — some sessions that save
today would ask for a retake — so it is a deliberate decision, not a silent fix.

## Known coverage limits

- Occlusion is modelled as one uniform visibility value per session, not as individual landmarks
  dropping out; only one scenario sits below the consensus floor.
- Rotation, lens distortion, and rolling-shutter effects are not modelled.
- The generator emits a closed template-length skeleton, so this sweep proves internal consistency
  and rejection behaviour. It says nothing about accuracy against a real body, which needs the
  rig/optical-mocap dataset in the validation protocol.
