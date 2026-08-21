# FormPath Basketball 프로젝트 맵

이 프로젝트는 **제품 runtime**, **검증된 motion asset**, **검토 evidence**, **재현 도구**를 서로 다르게 취급한다. 이 구분이 무너지면 검토용 single-view pose가 제품 3D처럼 보이는 문제가 다시 발생한다.

| 구역 | 경로 | 역할 | 제품 실행 포함 여부 |
| --- | --- | --- | --- |
| App UI | `app/`, `components/` | iPhone·web 화면과 interaction | 포함 |
| Product domain | `lib/` | 타입, recommendation, Firebase, approved registry | 포함 |
| Approved motion asset | `lib/motions/` | quality gate를 통과한 3D motion만 보관 | 포함 |
| Pipeline tools | `scripts/` | source inspection, pose extraction, calibration, triangulation, conversion | 미포함 |
| Evidence archive | `artifacts/` | source hash, quality report, audit sheet, rejection record | 미포함 |
| Decision records | `docs/` | source admission·UI boundary·운영 절차 | 미포함 |
| Regression | `tests/` | product boundary와 data contract 검증 | 미포함 |

## 현재 motion 상태

| ID / evidence | 상태 | 3D viewer | recommendation |
| --- | --- | --- | --- |
| `cmu-shoot-01` | approved `actual_optical_mocap_3d` | 허용 | 허용 |
| Curry 정면·사선 single-view records | withdrawn `monocular_relative_pose_not_metric_3d` | 금지 | 금지 |
| Paul George 제공 clip | gate 미달 audit record | 금지 | 금지 |
| Shooting Analysis Center Curry series | qualitative mechanism evidence | 금지 | trait 설명만 허용 |
| Future synchronized dual-camera capture | pending `calibrated_multi_view_3d` pipeline | validation 후 결정 | approval 후 결정 |

## Evidence archive 인덱스

artifact는 runtime에 import하지 않는다. 파일 이동은 기존 source citation을 깨뜨릴 수 있으므로, 다음 prefix를 current archive index로 사용한다.

| Prefix / 파일군 | 분류 |
| --- | --- |
| `cmu-*`, `reaudit-cmu-*` | approved source 또는 approved-source comparison audit |
| `curry-*`, `additional-curry-*` | withdrawn single-view review evidence |
| `paul-george-*` | failed/gated player-video evidence |
| `youtube-*`, `shooting-analysis-center-*` | public qualitative source analysis |
| `initial_roster-*` | legacy roster source audit |

새 artifact는 filename 앞에 `approved-`, `review-`, `rejected-`, `qualitative-`, `capture-` 중 하나를 붙이고, 해당 decision record를 `docs/`에 함께 남긴다.
