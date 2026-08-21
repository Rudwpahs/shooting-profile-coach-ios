# Multi-signal Frame Synchronization Run

## Algorithm

`synchronize-pose-pair-multisignal.py` uses a hard release anchor, visibility-weighted joint-motion signature, monotonic one-to-one sequence alignment, and iterative provisional-F Sampson residual. Its output is a correspondence hypothesis; it must pass the independent `run-uncalibrated-multiview-pipeline.py` fixed-F gate before it can produce review-only projective frames.

## Curry results

| Pair | Matched frames | Fixed-F inlier ratio | Gate | Reconstruction output |
| --- | ---: | ---: | --- | --- |
| front ↔ side | 8 | 21.591% | reject; threshold 72% | zero frames |
| front ↔ oblique | 1 | 63.636% | reject; threshold 72%, only one temporal match | zero frames |
| side ↔ oblique | 3 | 20.202% | reject; threshold 72% | zero frames |

The matcher improves the former front-side all-frame correspondence score from 14.89% to 21.59%, which confirms that temporal matching changed the selected frame pairs. It does **not** solve the fixed-camera geometry failure, so no 3D candidate was generated.

## Paul George result

The two available clips remain a Pacers event and a separate All-Star event. They do not represent the same physical shot, so frame synchronization would create false correspondence. The matcher is deliberately not run for that pair.

## Product boundary

All three Curry outputs have `state: rejected`, an empty `frames` array, and `productAdmission: forbidden_without_calibrated_multi_view_3d`. No data from this run is added to the 3D viewer, Library 3D reference, or recommendation engine.
