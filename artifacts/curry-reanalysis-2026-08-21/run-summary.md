# Curry corrected pipeline reanalysis

## Re-run result

기존의 Curry front·side·oblique pose source에 현재의 release-pinned multi-signal frame matcher와 independent fixed-F gate를 다시 실행했다.

| Pair | Matched frames | Fixed-F inlier ratio | 72% gate | 3D reconstruction |
| --- | ---: | ---: | --- | --- |
| front ↔ side | 8 | 21.591% | fail | none |
| front ↔ oblique | 1 | 63.636% | fail | none |
| side ↔ oblique | 3 | 20.202% | fail | none |

따라서 이 source pair에서 actual 또는 calibrated Curry 3D를 만들 수 없다. 다만 front source의 기존 audit timestamp와 x/y pose를 보존하고, legacy relative z만 작게 제한한 `curry-front-constrained-analysis-01`을 Motion Studio에 **video-based depth-limited estimate**로 표시한다.

## Visual verification

2026-08-21 mobile web render에서 Motion Studio는 아래 순서를 유지했다.

1. Curry·Paul George 실제 video 2D source skeleton
2. Curry `VIDEO ANALYSIS` constrained-depth display viewer
3. CMU `MOTION 01` approved optical 3D viewer

Curry analysis card에는 실제 측정 3D·recommendation 사용 불가라는 경계 문구와 depth 제한 사유가 함께 표시된다.

팔로우스루 phase button을 선택해 `CURRY · VIDEO ANALYSIS · 팔로우스루`, `5/5`, `2422ms`로 전환되는 것을 확인했다. 같은 화면 아래에는 CMU `MOTION 01` actual optical 3D가 별도 card로 유지된다.
