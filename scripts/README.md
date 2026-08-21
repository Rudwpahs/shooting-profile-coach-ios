# 3D Reconstruction Toolchain

아래 순서를 건너뛰지 않는다. `relative` 또는 `single-view` 파일은 검토 evidence일 뿐 product 3D motion이 아니다.

| Stage | Tools | Input | Output boundary |
| --- | --- | --- | --- |
| 0. Fixture license gate | `select-commercial-known-geometry-fixture.py` | external dataset policy manifest | eligible fixture source or explicit commercial block |
| 1. Source audit | `inspect-cmu-c3d.py`, `find-cmu-shooting-segments.py` | C3D / local video evidence | audit only |
| 2. Single-view review | `extract-relative-pose-candidate.py`, `build-relative-pose-motion.py` | one camera video | `monocular_relative_pose_not_metric_3d` |
| 3. Capture provenance | `init-authorized-multiview-capture.py` | authorized front/side raw videos | pending capture record |
| 4. Geometry | `calibrate-dual-camera.py` | paired checkerboard images | fixed camera K, distortion, R/t, P |
| 5. Synchronization | `synchronize-dual-camera-flash.py` | shared-flash front/side raw videos | timestamp offset record |
| 6. 3D triangulation | `validate-multiview-pose-candidate.py` | 2D pose JSON, calibration, sync, provenance | `calibrated_multi_view_3d` or rejected |
| 7. Product candidate | `convert-calibrated-pose-to-product-motion.py` | passing calibrated record | 16-joint five-phase candidate |
| 8. Product admission | code review plus `validatePoseMotion` and visual audit | candidate + evidence | approved library asset or rejection |

## Uncalibrated review-only path

`synchronize-pose-pair-multisignal.py` creates the sole admissible correspondence hypothesis for non-metric two-view review candidates. `run-uncalibrated-multiview-pipeline.py --alignment <hypothesis>` independently applies global fixed-F gating, canonical projective triangulation, canonical reprojection checking, and the explicit review-only boundary. The older individual `align-*` and `debug-*` scripts remain diagnostic tools and do not admit a candidate.

## Pair debugging before calibration

| Tool | Checks | Use |
| --- | --- | --- |
| `debug-pose-pair-geometry.py` | release correspondence, coordinate convention, per-frame affine residual | player video pair intake |
| `debug-uncalibrated-pose-pair.py` | global fixed-F fit and camera-pose proxy stability | determine whether a pair plausibly comes from one fixed rig before calibration admission |
| `debug-video-pair-correspondence.py` | raw image feature/homography overlap | determine whether clips are same/near-identical footage or distinct image planes |
| `align-pose-pair-dtw.py` | release-pinned dynamic time warping | remove different clip starts and slow-motion rate variation before fixed-F diagnostic |
| `synchronize-pose-pair-multisignal.py` | release-pinned visibility-weighted motion signature plus iterative Sampson residual | produce a strict one-to-one correspondence hypothesis before fixed-F admission |

The capture command sequence and thresholds are documented in [`../docs/authorized-multiview-capture-kit.md`](../docs/authorized-multiview-capture-kit.md).

Known-geometry benchmarks cannot bypass commercial source policy. Before any external fixture is downloaded or used in a product-adjacent regression run, execute `select-commercial-known-geometry-fixture.py` against [`../data/known_geometry_fixture_manifest.json`](../data/known_geometry_fixture_manifest.json). A `blocked_no_commercial_fixture` result is the expected safe state until a rightsholder permission record or authorized self-capture input is available.
