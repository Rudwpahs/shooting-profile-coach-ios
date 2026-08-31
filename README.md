# FormPath Basketball

FormPath Basketball은 iPhone 우선 농구 슈팅 분석 prototype입니다. 앱은 사용자 목표와 슈팅 특성을 분석하고, 사용자 영상·선수 영상 기반 분석 모션과 검증된 actual 3D reference를 **서로 다른 데이터 등급으로 명확히 분리**해 표시합니다.

## Start here

| 목적 | 문서 |
| --- | --- |
| 현재 구현 상태·수정 내역·다음 계획 | [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) |
| 현재 product·data boundary | [`docs/PROJECT_MAP.md`](docs/PROJECT_MAP.md) |
| 단계별 개발·test·checkpoint 규칙 | [`docs/DEVELOPMENT_WORKFLOW.md`](docs/DEVELOPMENT_WORKFLOW.md) |
| 3D source admission과 capture 절차 | [`docs/authorized-multiview-capture-kit.md`](docs/authorized-multiview-capture-kit.md) |
| uncalibrated two-view review algorithm | [`docs/UNCALIBRATED_RECONSTRUCTION_ALGORITHM.md`](docs/UNCALIBRATED_RECONSTRUCTION_ALGORITHM.md) |
| 3D reconstruction script 단계 | [`scripts/README.md`](scripts/README.md) |
| Superpowers 적용 검토 | [`docs/superpowers-integration-review.md`](docs/superpowers-integration-review.md) |
| separate-shot representative 4D 검증 계획 | [`docs/representative-4d-validation-protocol.md`](docs/representative-4d-validation-protocol.md) |
| active work history | [`todo.md`](todo.md) |

## Non-negotiable data boundary

| Data class | Product motion viewer | Recommendation | Status / storage |
| --- | --- | --- | --- |
| `actual_optical_mocap_3d` | Allowed after audit | Allowed after audit | approved reference in `lib/motions/` |
| `calibrated_multi_view_3d` | Allowed only after sync/calibration/reprojection/audit | Allowed only after product approval | candidate artifact, then `lib/motions/` |
| learned image-to-3D / monocular 3D estimate | **Display-only analysis allowed with explicit estimate labeling** | Never | analysis asset / audit record |
| source-faithful 2D or corrected relative player analysis | Display-only analysis allowed | Never as actual 3D evidence | analysis asset / audit record |
| separate-shot representative phase-fused 4D | Private display only after V2 gates | Not reference-grade; coaching rollout pending validation | owner-private derived data, flags default off |
| qualitative video breakdown | Explanation only | Explanation only | `docs/` / `artifacts/` |

A learned or monocular 3D estimate must never be relabeled as calibrated, metric, optical-mocap, or otherwise “actual” 3D. Display availability does not imply admission into the recommendation reference set.

정면과 슈팅 측면을 따로 촬영하는 personal V2는 두 영상에서 사람을 안정적으로 crop하고, 각 슛을 101개의 정규화 단계로 맞춘 뒤, 같은 단계의 2D 방향 증거를 결합해 12관절의 대표 `(x, y, z, phase)` 스켈레톤을 만든다. 동시 촬영·카메라 calibration·triangulation이 없으므로 결과는 `representative_phase_fused_4d_estimate_not_actual_3d`이며 실제 계측 3D가 아니다. Basic은 1+1 촬영과 신뢰도 상한 0.65, High는 3+3 촬영과 최소 2개 일치 subset을 사용한다. 모든 V2 플래그는 검증 전 기본 OFF다.

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
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test:unit
pnpm exec expo export --platform web --output-dir web-dist
```

For local dual-camera capture reconstruction, follow the exact command sequence in [`docs/authorized-multiview-capture-kit.md`](docs/authorized-multiview-capture-kit.md). Public edited videos must not be treated as a substitute for synchronized, calibrated camera inputs when claiming actual 3D.
