# 3D Reconstruction Toolchain

아래 순서를 건너뛰지 않는다. `relative` 또는 `single-view` 파일은 검토 evidence일 뿐 product 3D motion이 아니다.

| Stage | Tools | Input | Output boundary |
| --- | --- | --- | --- |
| 1. Source audit | `inspect-cmu-c3d.py`, `find-cmu-shooting-segments.py` | C3D / local video evidence | audit only |
| 2. Single-view review | `extract-relative-pose-candidate.py`, `build-relative-pose-motion.py` | one camera video | `monocular_relative_pose_not_metric_3d` |
| 3. Capture provenance | `init-authorized-multiview-capture.py` | authorized front/side raw videos | pending capture record |
| 4. Geometry | `calibrate-dual-camera.py` | paired checkerboard images | fixed camera K, distortion, R/t, P |
| 5. Synchronization | `synchronize-dual-camera-flash.py` | shared-flash front/side raw videos | timestamp offset record |
| 6. 3D triangulation | `validate-multiview-pose-candidate.py` | 2D pose JSON, calibration, sync, provenance | `calibrated_multi_view_3d` or rejected |
| 7. Product candidate | `convert-calibrated-pose-to-product-motion.py` | passing calibrated record | 16-joint five-phase candidate |
| 8. Product admission | code review plus `validatePoseMotion` and visual audit | candidate + evidence | approved library asset or rejection |

The capture command sequence and thresholds are documented in [`../docs/authorized-multiview-capture-kit.md`](../docs/authorized-multiview-capture-kit.md).
