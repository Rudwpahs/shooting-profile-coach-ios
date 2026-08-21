# Curry·Paul George 정면/측면 landmark triangulation 디버그

## 질문에 대한 직접 답

**그렇다.** 같은 순간을 고정된 정면·측면 camera가 보고 있고, 각 joint의 대응점과 두 camera의 projection matrix를 알거나 안정적으로 추정할 수 있다면, 두 view의 `(x, y)`로 `z`를 포함한 3D point를 triangulate할 수 있다. 이때 MediaPipe의 single-view `z`를 맞춰 쓰는 것이 아니라, 두 image-plane observation과 camera geometry로 xyz를 푼다.

그러나 현재 제공된 Curry와 Paul George 파일은 그 조건을 만족하는지 추측하지 않고 실제 landmark·frame·epipolar geometry를 계산했다.

## Curry 결과

| 검사 | 실제 결과 | 의미 |
| --- | --- | --- |
| 입력 | 4.273s/59 frame과 3.288s/40 frame 33-landmark sequence | 두 clip 모두 single-view tracking quality는 통과 |
| release anchor | A frame 30, B frame 25 | release anchor를 정확히 보존하고, clip length·slow-motion rate 차이는 pre/post release DTW로 정렬 |
| 2D skeleton affine residual | anchor-preserving window median **0.20007 body units** | 단순 crop/scale 동일 image plane으로 볼 수 없으나, 이것만으로 stereo calibration이 되지는 않음 |
| one fixed F global fit | release-pinned DTW 전체에서 **290 / 1,947 = 14.89%** inlier | fixed camera pair라면 같은 3D joint observation 전체가 하나의 epipolar geometry를 더 많이 공유해야 하나, 실제 matching은 이를 지지하지 않음 |
| proxy pose recovery | translation direction spread **178.1418°**, rotation spread **99.7869°** | frame마다 추정되는 camera relation이 크게 바뀌어, 하나의 고정 front/side rig로 설명되지 않음 |
| product decision | rejected from calibrated admission | no fixed K/distortion/R/t/sync, and observed correspondence is not stable enough to estimate them safely |

초기 debugger에는 release anchor 뒤에 넓은 frame shift를 허용한 결함이 있었고, 이를 수정했다. 수정 뒤 release A30–B25는 정확히 대응시켰고, DTW로 전체 temporal path도 재정렬했다. 그 뒤에도 global F inlier는 **14.89%**, translation direction spread는 **178.1418°**로 더 악화됐다. 이는 초기 결론을 약화시키는 것이 아니라, **frame alignment를 제대로 해도 fixed camera geometry가 성립하지 않는다**는 더 강한 결과다.

두 video는 visual audit상 모두 low-angle front-left 계열이다. feature correspondence도 median homography inlier ratio가 **2.75%**로, 동일 image plane crop이라고 확정할 수는 없었지만, “안정된 서로 다른 fixed stereo camera pair”도 landmark geometry로 지지되지 않았다. 즉, 현재 실패 원인은 MediaPipe가 landmark를 못 잡아서가 아니라 **same-time correspondence와 fixed camera geometry가 실제 data에서 성립하지 않는 것**이다.

## Paul George 결과

| Clip | 확인된 내용 | triangulation 결론 |
| --- | --- | --- |
| `pg-clip-a` | Pacers #13, baseline wide view, follow-through only | All-Star clip과 다른 uniform·court·event |
| `pg-clip-b` | East All-Star #13, side tracking view, release/descent 1s | Pacers clip과 같은 physical shot이 아님 |

Paul George 두 clip은 같은 event조차 아니므로 joint의 same-time correspondence가 정의되지 않는다. 서로 다른 슛의 right wrist 좌표를 묶는 것은 3D reconstruction이 아니라 서로 다른 신체 pose를 강제로 합성하는 것이며, 이전의 이상한 3D와 같은 오류를 만든다.

## 코드상 확정된 수정

1. `debug-pose-pair-geometry.py`는 release-based correspondence와 MediaPipe coordinate convention을 검사한다.
2. `debug-uncalibrated-pose-pair.py`는 전체 33-landmark·시간 window에서 one fixed F가 성립하는지와 proxy camera-pose stability를 측정한다.
3. `debug-video-pair-correspondence.py`는 raw image feature/homography로 same-footage·camera-view 진단을 보조한다.
4. `align-pose-pair-dtw.py`는 release anchor를 고정한 temporal dynamic time warping으로 slow-motion 속도 차이를 보정한다.
5. 이 진단을 통과하지 않으면 calibrated admission tool에 input을 전달하지 않는다.

## 핵심 구분

| 가능한 것 | 현재 Curry/PG input에서 가능한가 |
| --- | --- |
| 한 view의 2D form·timing 분석 | 가능 |
| 다른 view의 같은 release를 수동 후보로 찾기 | 제한적으로 가능 |
| 두 `(x, y)`와 **known fixed P matrices**로 xyz triangulation | 입력 조건이 없어서 불가 |
| uncalibrated self-calibration을 landmark만으로 시도 | 코드로 시도했으나 Curry global F 12.4%·pose direction spread 156°로 불안정; product 3D 불가 |

이 기록은 “두 view라서 안 된다”가 아니라, **현재 두 선수의 실제 frame correspondence와 camera geometry가 equation의 input으로 성립하지 않는다**는 디버그 결과다.
