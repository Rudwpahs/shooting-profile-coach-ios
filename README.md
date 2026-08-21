# FormPath Basketball

FormPath Basketball은 iPhone 우선 농구 슈팅 분석 prototype입니다. 앱은 사용자 목표와 익명 슈팅 특성을 비교하며, 3D motion은 **검증 가능한 actual optical-mocap 또는 calibrated multi-view data만** 표시합니다.

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

| Data class | Product 3D viewer | Recommendation | Storage location |
| --- | --- | --- | --- |
| `actual_optical_mocap_3d` | Allowed after audit | Allowed after audit | `lib/motions/` |
| `calibrated_multi_view_3d` | Allowed only after sync/calibration/reprojection/audit | Allowed only after product approval | candidate artifact, then `lib/motions/` |
| `monocular_relative_pose_not_metric_3d` | Never | Never | audit record only |
| qualitative video breakdown | Never | Explanation only | `docs/` / `artifacts/` |

## Current approved motion

`cmu-shoot-01` is the single approved actual optical-mocap reference. Curry and Paul George public/player-video records are not rendered as 3D; they remain review evidence until a valid calibrated capture passes the pipeline.

## Development commands

```bash
pnpm test
pnpm check
pnpm exec expo export --platform web --output-dir web-dist
```

For local dual-camera capture reconstruction, follow the exact command sequence in [`docs/authorized-multiview-capture-kit.md`](docs/authorized-multiview-capture-kit.md). Do not use public edited videos as a substitute for synchronized, calibrated camera inputs.
