# FormPath 개발 운영 흐름

이 문서는 FormPath의 기본 개발 절차다. 외부 agent tooling은 [`AGENTS.md`](../AGENTS.md)와 [`AGENT_TOOLCHAIN.md`](AGENT_TOOLCHAIN.md)의 baseline을 따른다.

현재 역할 분담은 다음과 같다.

- **Superpowers v6.3.0+**: 작업 분류, spec/plan 연결, 구현·검토·검증 절차
- **UI UX Pro Max v2.15.0+**: React Native 사용자 화면의 디자인 시스템, UX, 접근성, 인터랙션 품질 게이트
- **Graphify 0.5.0+**: 코드베이스 구조 파악, 모듈 간 관계·의존성 추적, 대규모 리팩터링 전 구조 확인

이 도구들은 개발 보조 도구이며 Expo 앱의 runtime dependency로 포함하지 않는다.

## Stage 0 — Problem statement

한 번에 하나의 문제만 정의한다. Superpowers 방식으로 작업을 작은 탐색(spike), 제한된 변경(bounded), 구조 변경(architectural) 중 하나로 보고 필요한 수준만큼 계획한다. 예를 들어 “Curry 3D를 더 자연스럽게”가 아니라, “single-view candidate가 3D viewer에 공급되지 않도록 막고 calibrated capture admission path를 만든다”처럼 acceptance criterion을 쓴다.

광범위하거나 낯선 영역의 작업은 기존 Graphify 결과(`GRAPH_REPORT.md`, `graphify-out/`)가 있다면 먼저 구조를 읽는다. 결과가 오래되었으면 가능한 환경에서 갱신한 뒤 실제 source와 대조한다. Graphify 결과만으로 구현 결정을 확정하지 않는다.

## Stage 1 — Source and data admission

새 영상 또는 motion data는 runtime에 넣기 전에 `source`, `identity/consent`, `camera`, `sync`, `license`, `motion continuity`를 audit한다. 이 단계의 결과는 **approved**, **review-only**, **rejected** 중 하나다. Review-only와 rejected는 절대 `lib/motions/`에 넣지 않는다.

## Stage 2 — Design and small execution plan

변경 전 필요한 경우 `docs/`의 decision record 또는 spec/plan을 만들고, `todo.md`에 실행 가능한 checkbox를 추가한다. 각 task는 하나의 source boundary, 하나의 UI concern, 또는 하나의 conversion step만 변경한다.

사용자에게 보이는 UI 변경은 구현 전에 UI UX Pro Max의 React Native 지침을 적용해 화면 수준의 디자인 시스템과 interaction state를 먼저 정한다. 단순히 기존 스타일 값을 임의로 복사하거나 web 전용 패턴을 React Native에 옮기지 않는다.

## Stage 3 — Implement with gates

| 변경 영역 | 반드시 통과해야 하는 gate |
| --- | --- |
| UI | TypeScript, mobile viewport inspection, UI UX Pro Max 기준의 hierarchy/spacing/typography/touch target/accessibility/loading-error-empty/reflow 검토 |
| Runtime motion | `validatePoseMotion`, provenance, source phase traceability |
| Player video | raw media outside product, state/boundary shown, recommendation exclusion |
| Multi-view 3D | shared-flash sync, checkerboard calibration, undistortion, triangulation, reprojection, visual audit |
| Separate-shot representative 4D | exact 101-phase grid, all-phase consensus, uncertainty/closure gates, explicit estimate label, flags default off |
| Firebase | UID-only rules and regression tests |
| Broad refactor | Graphify 또는 동등한 구조 분석으로 영향 범위 확인 후 source-level verification |

UI 작업은 컴파일 성공만으로 완료 처리하지 않는다. 최소한 small-screen reflow, touch target, text scaling, loading/error/empty state, contrast, reduced-motion 또는 해당 interaction의 접근성 상태를 확인한다.

## Stage 4 — Review and checkpoint

수정 뒤 test·type check·필요 시 web export를 실행하고, `todo.md` 완료 상태를 읽어 확인한다. Superpowers 방식으로 acceptance criterion과 실제 diff를 다시 대조하고, 성공한 변경만 checkpoint로 보존한다. 불확실한 motion은 checkpoint에 “approved”로 표시하지 않고 evidence record로만 남긴다.

V2 representative profile은 정면·슈팅 측면 영상을 동시에 촬영한 계측 3D가 아니다. 서로 다른 슛의 대응점을 `normalized_shot_phase`로 맞춘 뒤 방향을 결합한 추정치다. `EXPO_PUBLIC_FORMPATH_CAPTURE_V2`, `EXPO_PUBLIC_FORMPATH_PROFILE_V2`, `EXPO_PUBLIC_FORMPATH_REPRESENTATIVE_4D`는 각각 값이 정확히 `1`일 때만 활성화하며, 검증 프로토콜과 iPhone/Firebase 출시 gate가 끝나기 전에는 모두 비활성으로 유지한다.

## Current priority order

1. Approved actual 3D library를 CMU 또는 calibrated own-capture로 늘린다.
2. User video analysis의 iPhone end-to-end validation을 끝낸다.
3. 승인된 data가 늘어난 뒤에만 player-name prototype 또는 anonymous archetype UI를 확장한다.

Representative V2의 정량 검증 항목은 [`representative-4d-validation-protocol.md`](representative-4d-validation-protocol.md)를 따른다.
