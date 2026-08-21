# Curry Image-to-3D Lifting Decision

## Selection

The app will use a **temporal 2D-to-3D pose-lifting architecture** as the product category, but not call its output actual or calibrated 3D. VideoPose3D is the canonical temporal-lifting baseline: it estimates a 3D pose sequence from 2D keypoint trajectories, but its repository is licensed CC BY-NC and therefore cannot be packaged into this commercial product. [1] [2]

MotionBERT is Apache-2.0 and documents a 17-keypoint 2D pose input for 3D pose estimation. [3] The official H36M fine-tuned checkpoint was executed on CPU during this build. The retained Curry source is mapped from MediaPipe’s 33 landmarks to a 17-joint H36M-style input contract, then reconstructed to the app’s 16-joint display schema. The checkpoint SHA-256 is stored in the generated asset for provenance. Any result remains camera-relative, scale-normalized, and analysis-only because there is no camera calibration or synchronized multi-view evidence.

| Component | Decision | Boundary |
| --- | --- | --- |
| Input | Five retained Curry 2D source phases, mapped to a 17-joint H36M-style contract | Source evidence is 2D only. |
| Lifting family | Official MotionBERT H36M fine-tuned temporal 2D-to-3D checkpoint, CPU executed | A model estimate, not a measurement. |
| Output | `image_lifted_pose_estimate_not_actual_3d` with five source timestamps | Never `actual_optical_mocap_3d` or `calibrated_multi_view_3d`. |
| Product role | Motion Studio display analysis | Excluded from recommendations and actual-3D library. |

> A learned image-to-3D lifting model can estimate a plausible depth arrangement from 2D motion context, but it does not supply the same-shot calibrated-camera evidence required to elevate Curry to actual 3D.

## References

[1] [Pavllo et al., *3D Human Pose Estimation in Video with Temporal Convolutions and Semi-Supervised Training*](https://research.facebook.com/publications/3d-human-pose-estimation-in-video-with-temporal-convolutions-and-semi-supervised-training/)

[2] [facebookresearch/VideoPose3D repository and license](https://github.com/facebookresearch/VideoPose3D)

[3] [Walter0807/MotionBERT repository](https://github.com/Walter0807/MotionBERT)
