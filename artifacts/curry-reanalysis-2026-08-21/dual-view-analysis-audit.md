# Curry front + side display analysis audit

## Why this exists

`fixed-F` 21.591%은 **슛폼 유사도**가 아니라 두 input이 같은 한 번의 슛을 고정된 두 camera로 찍은 raw pair인지 검사하는 geometry score다. 72% admission gate에는 미달하므로 metric·actual 3D는 만들지 않는다.

이 analysis는 user-facing form inspection을 위해 아래 두 source의 같은 이름 shot phase를 결합한다.

| Phase | Front source timestamp | Side source timestamp |
| --- | ---: | ---: |
| 준비 | 0ms | 0ms |
| 딥 | 1002ms | 504ms |
| 상승 | 1503ms | 1297ms |
| 릴리스 | 2088ms | 2162ms |
| 팔로우스루 | 2422ms | 2738ms |

## Blend rule

정면 source가 x/y body shape를 제공하고, 좌우 반전한 측면 source의 horizontal joint offset이 제한된 display depth를 제공한다. 이는 phase-aligned visual blend이며, synchronized triangulation·physical measurement·실제 Curry 3D가 아니다.

## Viewer verification

Motion Studio에서 `CURRY · FRONT + SIDE ANALYSIS` card가 single-view analysis 아래, CMU approved optical motion 위에 분리 표시된다. 팔로우스루 선택 시 `5/5`와 `2422ms` front source timestamp로 전환되는 것을 확인했다. card에는 actual 3D 및 recommendation 사용 불가 문구가 표시된다.
