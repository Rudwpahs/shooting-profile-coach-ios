# Current Motion Admission Matrix

This matrix describes the fixed model set during the non-expansion closeout. It does not add a player, a source sequence, or a recommendation model.

| Record | Evidence and quality status | Product boundary | Allowed product role | Explicit exclusion |
| --- | --- | --- | --- | --- |
| `cmu-shoot-01` | Licensed CMU optical-marker motion; validated 16-joint, five-phase segment | `actual_optical_mocap_3d` | The sole approved reference motion and eligible recommendation source | It does not represent a named player. |
| `curry-front-side-auto-corrected-analysis-01` | Retained front/side semantic phase evidence, pelvis-root and median bone-length display correction | `monocular_relative_pose_not_metric_3d` | Prototype Motion Studio analysis only | No metric depth, actual 3D claim, body measurement, or recommendation. |
| `paul-george-side-auto-corrected-analysis-01` | Retained 31-frame single-side evidence, right-hand audit, anchors 0·97·355·645·806ms | `monocular_relative_pose_not_metric_3d` | Prototype Motion Studio analysis only | No metric depth, actual 3D claim, body measurement, or recommendation. |
| User private upload | On-device landmark candidate passing frame/visibility gates, followed by conservative display correction | `monocular_relative_pose_not_metric_3d` | Owner-only fluid analysis record | No recommendation or actual 3D use; raw video is not saved. |

## Admission enforcement

The test suite verifies that only the CMU record carries an actual optical boundary, that only the two corrected player analyses remain in the player collection, that their five timestamps are strictly increasing, and that withdrawn analysis assets are absent. The product Library does not render intermediate 2D review or withdrawn-video records.

## Deferred without model expansion

New CMU segments, new player captures, public-source acquisition, new calibrated candidate creation, and any promotion of an additional asset remain intentionally deferred. Those actions would alter the model/source count and are outside the current request.
