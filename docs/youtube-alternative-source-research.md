# YouTube 대체 공개 source·dataset 조사

## 결론

공개 source는 **실제 슈팅 motion을 product 3D로 바로 쓸 수 있는가**, **다중 view/camera geometry를 제공하는가**, **상업 제품에서 사용할 수 있는가**를 분리해 판단해야 한다. 현재 확인된 후보 중에는 CMU Trial 15가 실제 marker 기반 농구 슈팅이라는 점에서 가장 직접적이다. SportCenter는 실제 농구 multi-camera geometry 검증용이고, BASKET-Multiview는 synthetic algorithm benchmark이며, SportsPose는 basketball 전용도 상업 사용 가능도 아니다.

| 후보 | 실제 인체·농구 슛 | 3D/camera | license·도입 판단 |
| --- | --- | --- | --- |
| CMU Graphics Lab Subject 6 Trial 15 | 실제 optical-marker basketball shooting | C3D marker 3D, 120 fps | 현재 `cmu-shoot-01`의 source. product admission의 유일한 직접 actual-3D route. [1] |
| CMU Subject 86 Trial 14 | 실제 marker basketball bouncing/shooting/dribble sequence | C3D marker 3D, 120 fps | source description은 shooting을 포함하지만 prior quality audit에서 release/follow-through gate 미달; 재승인 전 product 제외. [1] |
| SportCenter | 실제 amateur basketball match; official description은 running/walking/standing 중심이라 shooting은 보장되지 않음 | 8 fixed, synchronized, calibrated camera; subset 2D/3D pose | research-purpose free source. fixed-F/calibration algorithm test에는 적합하지만 product player motion source는 별도 permission 필요. [2] |
| BASKET-Multiview | synthetic basketball plays, 실제 선수 아님 | 89 camera views, calibration, depth, animation, SMPL | reconstruction algorithm regression·calibration test용. asset license restrictions가 있어 product content source로 바로 사용하지 않음. [3] |
| DeepSportRadar calibration challenge | 실제 basketball game imagery, single instant | per-image calibration data; temporal same-shot multi-view sequence 아님 | court-camera calibration prior 학습·검증용. skeleton motion reconstruction source 아님. dataset access/terms 별도 확인. [4] |
| SportsPose | actual sports 3D지만 basketball shooting 전용이 아님 | 7 views, 176k 3D poses | custom academic-only license로 상업 product asset 후보에서 제외. [5] [6] |

## 실제 실행 우선순위

첫째, CMU approved optical motion을 추가 trial 탐색으로 확장한다. 둘째, SportCenter/BASKET-Multiview로 camera calibration·synchronization·triangulation code를 regression-test한다. 셋째, 상업 product에서 실제 개인 skeleton을 늘리는 경로는 선수 영상 추측이 아니라 동의받은 2-camera capture와 calibrated admission pipeline이다.

| 우선순위 | 도입 경로 | Curry·Paul George 목표와의 관계 | product 사용 |
| --- | --- | --- | --- |
| 1 | CMU approved optical basketball trial 확장 | 실제 named player model은 아니지만, 현재 3D viewer의 truthful skeleton library를 늘림 | 가능; 기존 provenance/license gate 유지 |
| 2 | SportCenter fixed-camera basketball footage | fixed-F, calibration, camera-pose code를 named-player source와 분리해 검증 | research/algorithm validation only |
| 3 | BASKET-Multiview synthetic benchmark | known calibration·depth로 multi-view reconstruction code의 regression fixture 생성 | algorithm test only; player/product skeleton 아님 |
| 4 | user-consented dual-camera capture | named player mimicry가 아닌 실제 user skeleton의 calibrated 3D 생성 | capture consent와 admission 통과 후 가능 |

공개 dataset만으로 **Curry 또는 Paul George 본인의 calibrated 3D**를 합법적·검증 가능하게 생성할 수 있는 source는 이번 조사에서 확인되지 않았다. 따라서 이 둘은 현재 UI의 actual-source 2D review를 유지하고, player-name 3D를 만들어야 한다는 요구는 source-level multi-view proof가 확보될 때만 다시 실행한다.

> SportCenter는 8개의 fixed, synchronized, calibrated camera로 amateur basketball match를 제공하지만, 공식 설명의 제공 3D pose는 subset이고 주 동작은 running, walking, standing이다. 따라서 multi-view geometry 검증에는 유용해도 Curry·Paul George의 shooting model source를 대체하지는 않는다. [2]

## References

[1] [CMU Graphics Lab Motion Capture Database, Subject 86](http://mocap.cs.cmu.edu/search.php?subjectnumber=86)

[2] [EPFL CVLAB SportCenter Dataset](https://www.epfl.ch/labs/cvlab/data/sportcenter-dataset/)

[3] [BASKET-Multiview Dataset](https://humansensinglab.github.io/basket-multiview/data.html)

[4] [DeepSportRadar Camera Calibration Challenge](https://github.com/DeepSportradar/camera-calibration-challenge)

[5] [SportsPose Dataset Record](https://data.dtu.dk/articles/dataset/The_SportsPose_dataset/29382803)

[6] [SportsPose License](https://christianingwersen.github.io/SportsPose/download.html)
