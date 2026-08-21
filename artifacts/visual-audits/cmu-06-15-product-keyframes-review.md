# CMU Trial 15 제품 keyframe 시각 재감사

검토 일자: 2026-08-21  
원본: `data/cmu_mocap/06_15.c3d`  
제품 asset: `lib/motions/cmu-shoot-01.json`

| 제품 단계 | C3D frame | marker sheet 시각 판정 | 제품 반영 |
| --- | ---: | --- | --- |
| 준비 | 269 | 전신이 완결된 set position이며 무릎·몸통·양팔 marker가 연속적으로 관찰됨 | 통과 |
| 딥 | 317 | 골반·무릎이 하강하고 손목이 set position을 유지함 | 통과 |
| 상승 | 335 | 하체가 신전되며 슈팅 쪽 팔·손목 marker가 상승함 | 통과 |
| 릴리스 | 353 | 양 손목이 어깨·머리 높이를 넘고 팔이 위쪽으로 연장됨 | 통과 |
| 팔로우스루 | 385 | 릴리스 뒤 높은 손목과 연장된 팔의 연속성이 유지됨 | 통과 |

이 audit는 관절을 추정·보간하지 않은 원본 optical marker만 사용한다. 이전 audit PNG에 남아 있던 잘못된 subject/trial 표기는 사용하지 않으며, 현재 `cmu-06-15-product-keyframes.png`가 제품 asset의 `selectedPhaseFrames`와 동일한 source frame을 표시한다.
