# Uncalibrated Multi-view Reconstruction Algorithm

## 목적과 output boundary

이 pipeline은 같은 슛의 두 물리 camera view에서 2D landmark correspondence가 하나의 fixed epipolar geometry를 지지할 때만 **projective 3D review candidate**를 생성한다. Intrinsic, distortion, relative R/t가 없는 상태에서는 metric xyz·실제 bone length·임의 camera rotation을 주장하지 않는다.

| Output state | 의미 | 3D viewer / recommendation |
| --- | --- | --- |
| `rejected` | correspondence 또는 fixed-F gate 미달 | 금지 |
| `review_only_projective_3d` | fixed-F를 통과한 canonical projective reconstruction | 금지 |
| `calibrated_multi_view_3d` | 별도 calibrated pipeline에서 K/distortion/R/t/sync/reprojection을 통과 | approval 후 허용 |

## 입력 schema

두 input은 각각 `monocular_relative_pose_not_metric_3d` boundary와 passing single-view quality를 가진 33-landmark sequence다. 두 clip은 동일 선수·동일 physical shot이어야 하며, 후보 pair를 하나씩 실행한다.

| Input | 필수 조건 |
| --- | --- |
| View A, View B pose JSON | 5개 이상 complete 33-landmark frame, quality passed |
| Shooting hand | release anchor를 고정할 right 또는 left wrist |
| Pair ID | source audit과 output을 연결하는 stable identifier |

## 단일 algorithm

1. **Release-pinned multi-signal correspondence.** 각 view에서 shooting wrist의 image-y 최저점을 release anchor로 선택하고 anchor pair는 절대 바꾸지 않는다. pre/post release는 visibility-weighted wrist·elbow·hip motion signature로 monotonic one-to-one path를 구하고, provisional fixed-F의 Sampson residual을 반복 cost로 반영한다.
2. **Global fixed-F gate.** multi-signal path의 모든 `(frame, joint)` correspondence를 하나의 RANSAC fundamental matrix `F`에 fit한다. 한 frame마다 다른 `F`를 추정하지 않는다.
3. **Pair admission.** `F` global inlier ratio가 0.72 이상이고, 5개 이상 frame에서 20개 이상 joint inlier가 있어야 한다. 이 조건을 만족하지 않으면 즉시 `rejected` output을 생성하고 triangulation하지 않는다.
4. **Canonical projective reconstruction.** 통과 pair만 `P₁=[I|0]`, `P₂=[[e′]×F|e′]` canonical camera pair에서 inlier point를 DLT triangulate한다. 이 결과는 projective gauge에 있으므로 metric world coordinate가 아니다.
5. **Review quality.** inlier observation의 canonical reprojection median과 valid-frame ratio를 기록한다. frame 간 projective joint displacement는 temporal outlier detector일 뿐 bone length 검증이 아니다.
6. **Product admission.** `review_only_projective_3d`는 data review artifact에만 남긴다. product motion·viewer·recommendation은 physical calibration을 가진 `calibrated_multi_view_3d`만 받는다.

## Quality thresholds

| Gate | Threshold | 실패 시 |
| --- | ---: | --- |
| Global F inlier ratio | ≥ 0.72 | `fixed_f_inlier_ratio_below_threshold` |
| Frame landmark inliers | ≥ 20 / 33 | 해당 frame 제외 |
| Valid reconstructed frame ratio | ≥ 0.72 | `insufficient_projective_frames` |
| Valid reconstructed frames | ≥ 5 | `too_few_projective_frames` |
| Median canonical reprojection error | ≤ 0.02 normalized units | `canonical_reprojection_exceeded` |

## Deliberate non-features

MediaPipe image landmark `z`는 second camera observation을 대체하지 않으며, two-view input에서 임의 z를 채우는 데 사용하지 않는다. 또한 uncalibrated projective transform 아래 bone length는 보존되지 않으므로, projective candidate에 “bone consistency passed”라고 표기하지 않는다. Bone-length quality gate는 calibrated metric 3D stage에서만 적용한다.

## Existing scripts after consolidation

`synchronize-pose-pair-multisignal.py`가 admissible correspondence entrypoint이며, `run-uncalibrated-multiview-pipeline.py --alignment`가 independent fixed-F/reprojection admission을 수행한다. 기존 `align-*`, `debug-*` script는 historical diagnosis 또는 audit comparison에만 남고, player candidate admission을 직접 결정하지 않는다.

## 2026-08-21 Curry·Paul George re-run

The unified entrypoint was run on every available Curry landmark pair. `front-side`, `front-oblique`, and `side-oblique` produced global F inlier ratios of 0.10833, 0.15427, and 0.06962, respectively. None reached the 0.72 threshold, so the pipeline correctly stopped before projective triangulation and emitted zero candidate frames. The submitted Paul George clips remain pre-pipeline rejected because they are distinct Pacers and All-Star events. See [`../artifacts/unified-uncalibrated-run/run-summary.json`](../artifacts/unified-uncalibrated-run/run-summary.json).

## 2026-08-21 Multi-signal synchronization re-run

Release-pinned multi-signal matching changed the correspondence hypotheses before fixed-F admission. Curry `front-side`, `front-oblique`, and `side-oblique` then produced independent fixed-F inlier ratios of 0.21591, 0.63636, and 0.20202. The best pair remained below 0.72 and had only one temporal match, so all three were correctly rejected before projective triangulation. See [`../artifacts/multisignal-sync/run-summary.md`](../artifacts/multisignal-sync/run-summary.md).
