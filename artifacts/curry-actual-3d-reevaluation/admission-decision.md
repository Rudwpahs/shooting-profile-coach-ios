# Curry Actual 3D Re-evaluation Decision

## Requested action

The retained Curry analysis was rechecked for promotion from analysis-only display motion to an actual 3D candidate. The product rule is strict: promotion requires the **same physical shot**, synchronized multi-view capture, fixed or calibrated cameras, a passing independent geometry/reprojection gate, a five-phase motion audit, and product-use permission.

## Fresh current-source result

| Gate | Result | Required result | Decision |
| --- | ---: | ---: | --- |
| Continuous five-phase source | Present | Present | Pass for analysis-only review. |
| Left-hand release-pinned matching | 13 strictly monotonic pairs | Credible same-shot correspondence | Insufficient on its own. |
| Global fixed-F RANSAC | 72 / 429 inliers = **16.783%** | At least **72%** | Fail. |
| Camera calibration manifest | None | Fixed/calibrated K, distortion, R/t and synchronization record | Fail. |
| Reprojection and calibrated triangulation | Not run after geometry failure | Passing calibrated reprojection | Not admissible. |

The fresh files are `front-side-left-alignment.json` and `front-side-admission.json`. The independent gate returned `rejected` with `fixed_f_inlier_ratio_below_threshold`. The required calibrated 3D converter was therefore not invoked.

## Admission decision

`analysis_only` — The Curry asset remains `monocular_relative_pose_not_metric_3d`, cannot enter the actual 3D library, and is excluded from recommendations. Changing this label without a synchronized calibrated capture would fabricate depth and violate the product’s evidence boundary.

## Exact path to actual 3D

Create one consented, raw same-shot capture from two stationary cameras, record a checkerboard calibration and a shared flash/timecode, retain five synchronized phase frames, then execute calibration → synchronization → calibrated triangulation → reprojection → motion audit. A passing result can be promoted as `calibrated_multi_view_3d`; this existing source cannot.
