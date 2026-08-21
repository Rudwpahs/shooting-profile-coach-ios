# 두 번째 Curry candidate UI 검증

모바일 웹 390×844 viewport에서 Library와 Motion Studio를 확인했다.

| 화면 | 확인 결과 |
| --- | --- |
| Library | 승인된 CMU optical-mocap 모션은 `1 APPROVED ACTUAL 3D MODEL`로 독립 표기되고, player video candidate 영역은 추천 reference와 분리되어 있다. |
| Motion Studio | `정면 영상`과 `사선 영상` 탭이 viewer 위에 동일한 폭으로 표시된다. 기본 선택은 정면이며, 두 탭은 source-boundary가 동일한 candidate set을 전환한다. |
| 3D viewer | 준비 단계와 source timestamp/phase control이 표시되며, candidate는 calibrated 3D가 아님을 유지한다. |

검토는 화면 배치와 boundary copy에 한정하며, 영상 candidate를 product-approved 3D motion으로 승격하지 않는다.
