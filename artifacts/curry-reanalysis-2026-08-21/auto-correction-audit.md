# Curry auto-correction and form-match audit

## Conservative correction

`CURRY · AUTO-CORRECTED ANALYSIS`는 dual-view semantic phase blend를 입력으로 받는다. 각 phase를 pelvis 기준으로 다시 놓고, shoulder–elbow–wrist와 lower-body chain을 포함한 visible bone의 median source length로만 scale을 정리한다. 따라서 동작 방향과 준비→딥→상승→릴리스→팔로우스루 순서는 유지한다.

원본 motion에서 관찰된 최대 bone-length spread는 `0.909416`이며, 보정 output의 각 target bone length spread는 `0`으로 고정된다. 이는 display skeleton 안정화 수치일 뿐 실제 신체 길이·camera depth·Curry의 측정 관절값이 아니다.

## Curry form-match result

| Rubric check | Result | Scope |
| --- | --- | --- |
| 다섯 슛 단계 순서 | 확인됨 | front·side source의 같은 이름 phase를 결합 |
| 오른팔 chain 연속성 | 확인됨 | source direction을 보존하며 median bone length 적용 |
| 팔로우스루 손목 높이 | 확인됨 | corrected front timestamp 2422ms에서 wrist y=1.931183, shoulder y=1.150952 |
| 공·림·손가락·정확한 각도 | 확인 불가 | source landmark에 ball/rim/camera calibration 없음 |

## Visual verification

Motion Studio에서 auto-corrected card, source-based form-match card, CMU optical actual-3D card가 분리되어 표시된다. form-match card는 실제 3D·추천 사용 불가 boundary를 유지한다.

## References

- [Curry shooting tips interview — Forbes](https://www.forbes.com/sites/hunteratkins/2014/08/26/shooting-tips-from-n-b-a-all-star-stephen-curry-2/)
- [Curry stance, alignment, and mechanics — MasterClass](https://www.masterclass.com/articles/how-to-shoot-a-basketball-with-steph-curry)
- [Coach analysis of Curry’s repeatable shot mechanics — The Guardian](https://www.theguardian.com/sport/article/2024/jul/24/midas-touch-how-to-shoot-like-steph-curry-paris-olympics-2024)
