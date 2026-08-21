# Player and User Fluid Correction Intake

## Product-visible player set after cleanup

| Player analysis | Current input | Keep in Motion Studio | Boundary |
| --- | --- | --- | --- |
| Stephen Curry auto-corrected | User-provided front/side phase blend | Yes | Display-only estimate; not actual 3D or recommendation input |
| Paul George auto-corrected | User-provided All-Star side video | Yes | Display-only estimate; not actual 3D or recommendation input |
| Curry constrained and non-corrected dual-view variants | Earlier display paths | No | Removed from product collection |
| Raw 2D source reviews and withdrawn video cards | Audit evidence only | No | Retained in audit storage, not product UI |
| CMU optical motion | Licensed actual reference | Kept internally for recommendation integrity | Removed from primary player-motion surface |

## User upload path

The native detector stores a `PersonalPoseCandidate` with original video timestamps, MediaPipe landmarks, and tracking quality. The product conversion will:

1. Select five source phase anchors without modifying the candidate.
2. Recenter and median-bone-length stabilize the display motion.
3. Pass the corrected five anchors to the shared fluid viewer, where intermediate poses are display-only interpolation.
4. Keep the resulting private motion `monocular_relative_pose_not_metric_3d`, with no recommendation eligibility.

The current Expo JavaScript bridge remains dependent on a custom native MediaPipe development build for live video detection. The correction and fluid rendering stage can be applied deterministically whenever that bridge returns a complete candidate.
