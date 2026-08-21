# Curry fixed-F pair gate summary

Release-pinned DTW로 모든 기존 Curry 33-landmark sequence 조합을 정렬한 뒤, 하나의 fixed fundamental matrix가 전체 temporal correspondence를 설명하는지 측정했다.

| Pair | Global F inlier ratio | Translation spread | Rotation spread | Gate |
| --- | ---: | ---: | ---: | --- |
| front ↔ side | 14.89% | 178.1418° | 99.7869° | Fail |
| front ↔ oblique | 12.62% | 171.1416° | 137.5875° | Fail |
| side ↔ oblique | 5.76% | 147.2256° | 177.2213° | Fail |

The gate requires a global F inlier ratio of at least 72% and a stable proxy fixed-camera pose (`translationDirectionSpreadDeg ≤ 5`, `rotationSpreadDeg ≤ 5`). No Curry pair passes. Paul George has no same-event landmark pair: the two submitted clips are Pacers and All-Star footage, respectively.

Therefore this screen produces **zero uncalibrated reconstruction candidates**. This is an intentional output: constructing a candidate from any failed pair would violate the gate requested for this stage.
