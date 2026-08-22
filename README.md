# FormPath Basketball

FormPath Basketball은 iPhone 우선 농구 슈팅 분석 prototype입니다. 앱은 사용자 목표와 슈팅 특성을 분석하고, 사용자 영상·선수 영상 기반 분석 모션과 검증된 actual 3D reference를 **서로 다른 데이터 등급으로 명확히 분리**해 표시합니다.

## Start here

| 목적 | 문서 |
| --- | --- |
| 현재 product·data boundary | [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) |
| 단계별 개발·test·checkpoint 규칙 | [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) |
| 3D source admission과 capture 절차 | [`docs/authorized-multiview-capture-kit.md`](docs/authorized-multiview-capture-kit.md) |
| uncalibrated two-view review algorithm | [`docs/UNCALIBRATED_RECONSTRUCTION_ALGORITHM.md`](docs/UNCALIBRATED_RECONSTRUCTION_ALGORITHM.md) |
| 3D reconstruction script 단계 | [`scripts/README.md`](scripts/README.md) |
| Superpowers 적용 검토 | [`docs/superpowers-integration-review.md`](docs/superpowers-integration-review.md) |
| active work history | [`todo.md`](todo.md) |

## Non-negotiable data boundary

| Data class | Product motion viewer | Recommendation | Status / storage |
| --- | --- | --- | --- |
| `actual_optical_mocap_3d` | Allowed after audit | Allowed after audit | approved reference in `lib/motions/` |
| `calibrated_multi_view_3d` | Allowed only after sync/calibration/reprojection/audit | Allowed only after product approval | candidate artifact, then `lib/motions/` |
| learned image-to-3D / monocular 3D estimate | **Display-only analysis allowed with explicit estimate labeling** | Never | analysis asset / audit record |
| source-faithful 2D or corrected relative player analysis | Display-only analysis allowed | Never as actual 3D evidence | analysis asset / audit record |
| qualitative video breakdown | Explanation only | Explanation only | `docs/` / `artifacts/` |

A learned or monocular 3D estimate must never be relabeled as calibrated, metric, optical-mocap, or otherwise “actual” 3D. Display availability does not imply admission into the recommendation reference set.

## Current motion status

### Approved actual 3D

`cmu-shoot-01` is currently the approved actual optical-mocap shooting reference. It is kept separate from player-video-derived analysis assets.

### Stephen Curry

Curry's retained player-video pose sequence is currently rendered in Motion Studio as a **MotionBERT learned image-to-3D display estimate**. The pipeline uses the retained 2D source trajectory and an official MotionBERT H36M fine-tuned checkpoint to estimate camera-relative depth for visualization.

This Curry asset is:

- allowed for Motion Studio visualization and form-analysis review,
- explicitly labeled as a learned/image-lifted estimate,
- **not** calibrated multi-view 3D,
- **not** metric actual 3D,
- excluded from actual-3D admission and recommendation reference scoring.

The independent calibrated multi-view admission gate for the available Curry sources has not passed, so no Curry asset is currently approved as actual 3D.

### Paul George

Paul George remains a player-video-derived, auto-corrected analysis motion. It can be shown for source-faithful form review, but it is not admitted as actual calibrated 3D and is excluded from actual-3D recommendation evidence.

## Development commands

```bash
pnpm test
pnpm check
pnpm exec expo export --platform web --output-dir web-dist
```

For local dual-camera capture reconstruction, follow the exact command sequence in [`docs/authorized-multiview-capture-kit.md`](docs/authorized-multiview-capture-kit.md). Public edited videos must not be treated as a substitute for synchronized, calibrated camera inputs when claiming actual 3D.