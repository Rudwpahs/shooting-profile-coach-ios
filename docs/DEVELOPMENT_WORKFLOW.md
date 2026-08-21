# FormPath 개발 운영 흐름

이 문서는 [Superpowers](https://github.com/obra/superpowers)의 plan-first, test-first, review-before-finish 원칙을 이 프로젝트에 맞게 적용한다. Superpowers plugin은 현재 environment에 plugin host CLI가 없으므로 앱 dependency로 설치하지 않는다. 대신 아래 workflow가 이 repository의 작업 순서다.

## Stage 0 — Problem statement

한 번에 하나의 문제만 정의한다. 예를 들어 “Curry 3D를 더 자연스럽게”가 아니라, “single-view candidate가 3D viewer에 공급되지 않도록 막고 calibrated capture admission path를 만든다”처럼 acceptance criterion을 쓴다.

## Stage 1 — Source and data admission

새 영상 또는 motion data는 runtime에 넣기 전에 `source`, `identity/consent`, `camera`, `sync`, `license`, `motion continuity`를 audit한다. 이 단계의 결과는 **approved**, **review-only**, **rejected** 중 하나다. Review-only와 rejected는 절대 `lib/motions/`에 넣지 않는다.

## Stage 2 — Design and small execution plan

변경 전 `docs/`의 decision record를 만들고, `todo.md`에 실행 가능한 checkbox를 추가한다. 각 task는 하나의 source boundary, 하나의 UI concern, 또는 하나의 conversion step만 변경한다.

## Stage 3 — Implement with gates

| 변경 영역 | 반드시 통과해야 하는 gate |
| --- | --- |
| UI | TypeScript, web export, mobile viewport inspection |
| Runtime motion | `validatePoseMotion`, provenance, source phase traceability |
| Player video | raw media outside product, state/boundary shown, recommendation exclusion |
| Multi-view 3D | shared-flash sync, checkerboard calibration, undistortion, triangulation, reprojection, visual audit |
| Firebase | UID-only rules and regression tests |

## Stage 4 — Review and checkpoint

수정 뒤 test·type check·필요 시 web export를 실행하고, `todo.md` 완료 상태를 읽어 확인한다. 성공한 변경만 checkpoint로 보존한다. 불확실한 motion은 checkpoint에 “approved”로 표시하지 않고 evidence record로만 남긴다.

## Current priority order

1. Approved actual 3D library를 CMU 또는 calibrated own-capture로 늘린다.
2. User video analysis의 iPhone end-to-end validation을 끝낸다.
3. 승인된 data가 늘어난 뒤에만 player-name prototype 또는 anonymous archetype UI를 확장한다.
