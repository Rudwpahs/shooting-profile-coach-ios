# CMU Subject 86 Trial 14 — 추가 구간 재감사 판정

## Scope

기본 candidate detector를 Subject 86 Trial 14 원본 C3D에 재실행했다. 표준 기준인 **wrist lift ≥ 180 mm**와 **elbow extension ≥ 135°**에서는 candidate가 없었다. 기존 저임계(45 mm) 탐색에서 나온 두 right-arm extension peak만 visual audit 대상으로 유지했다. 이 문서는 candidate label을 product admission으로 해석하지 않는다.

| Peak frame | Measured wrist lift | Elbow angle | Visual audit sheet | 판정 |
| --- | ---: | ---: | --- | --- |
| 3364 | 95.93 mm | 135.24° | `cmu-86-14-candidate-3364.png` | 제외 |
| 3754 | 87.42 mm | 135.77° | `cmu-86-14-candidate-3754.png` | 제외 |

## Decision

두 구간은 arm extension은 보이지만, measured hand elevation이 동일한 source의 approved shooting release 기준에 크게 미달한다. 5-frame marker audit에서도 제품이 요구하는 release 이후의 높은 손목 위치와 안정된 shooting follow-through를 확인할 수 없다. 따라서 두 구간 모두 `actual_optical_mocap_3d`로 승격하지 않으며, `cmu-shoot-02` asset을 생성하지 않는다.

원본 C3D와 rerun candidate JSON은 provenance evidence로 보존한다. 다음 admission 후보는 새 CMU trial 또는 standard detector의 180 mm threshold를 충족하면서 visual release·follow-through gate를 함께 통과해야 한다.
