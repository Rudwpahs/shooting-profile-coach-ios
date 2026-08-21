# Curry Rebuild Audit

## Retained source evidence

The five-phase oblique source skeleton review shows a continuous, readable full-body shooting sequence: preparation at 0ms, dip at 1153ms, rise at 1657ms, release at 2162ms, and follow-through at 2738ms. The retained source poses show a left-hand shooting arm and a side/oblique silhouette in which some near/far joints naturally overlap.

## Rebuild attempt 1 — rejected as primary display

The initial source-faithful `z = 0` rebuild correctly retained the source phase timing and removed invented depth. However, the Motion Studio release capture still rendered the body too compact, with near/far arm and leg lines overlapping so strongly that it did not provide a readable primary Curry silhouette. It must not be treated as the completed visual rebuild.

The five-panel asset diagnostic confirmed the same issue outside the app preview: the source-derived tree retained phase order and the left-hand rise/release direction, but its side/oblique limb overlap made the torso and legs read as a compact cluster. The retained source-video overlay remains the truth layer; the compact source-derived 2D tree is not an acceptable primary product display.

## Next correction constraint

The replacement must preserve the audited source x/y parent-to-child directions and all five timestamps, but use a display-only camera-facing body layout that separates only coincident side-view limbs. It may not introduce metric depth, claim actual 3D, change the left shooting hand, alter release/follow-through elevation, or enter recommendations.

## Final accepted display rebuild

The final asset remains a `z = 0` source-derived analysis rather than a fabricated 3D reconstruction. The viewer now begins at the source-facing camera and applies only a display-scale fit to make the retained full-body silhouette readable. The final five-phase diagnostic shows a visible preparation lean, lower dip, rise, left-arm release, and continuous left-arm follow-through with both legs retained. The audit asset is `artifacts/curry-rebuild-diagnostic.png`.

## MotionBERT learned image-to-3D replacement

The source-faithful z=0 display was subsequently replaced with a CPU execution of the official MotionBERT H36M fine-tuned checkpoint. The model receives the full retained 59-frame source trajectory through a MediaPipe-33 to H36M-17 adapter; source x/y and five audited timestamps remain fixed in the product asset, while only camera-relative z is learned and bounded. The oblique five-phase diagnostic at `artifacts/curry-motionbert-lift-diagnostic.png` shows separable torso, arm, and leg depth without changing the retained left-hand release path. It remains a `monocular_relative_pose_not_metric_3d` display estimate, not actual or calibrated 3D.
