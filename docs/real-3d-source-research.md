# 실제 3D 슈팅 데이터 사전조사

> 이 문서는 모델을 승인하는 기록이 아니다. 소스의 실제 인체 여부·관절 데이터·라이선스·슛 단계가 모두 확인된 뒤에만 별도 승인 레지스트리로 이동한다.

## 1차 확인: CMU Graphics Lab Motion Capture Database

CMU 공개 모션캡처 데이터베이스의 Subject 86, Trial 14는 `bouncing basketball, shooting basketball, dribble basketball, two handed dribble`을 명시하며, **120 fps**의 실제 사람 모션을 `C3D`와 `AMC` 형식으로 제공한다.[1] 이는 기존 YouTube 단일 시점 추정과 달리 카메라 삼각측량 없이도 3D 관절 시간열을 시작점으로 쓸 수 있는 첫 번째 유효 후보다.

| 검증 항목 | 현재 확인 | 다음 판정 |
| --- | --- | --- |
| 실제 인체 3D | 광학 모션캡처 데이터베이스의 실제 subject | 후보 유지 |
| 농구 슈팅 언급 | Trial 14에 명시 | 클립 내부에 준비→릴리스→팔로우스루가 실제로 있는지 별도 확인 필요 |
| 관절 형식 | C3D marker / AMC skeleton, 120 fps | 33-landmark 제품 스키마 변환 가능성 검토 |
| 선수 실명 | subject 번호만 제공 | 제품 익명화와 양립 가능 |
| 라이선스·상업 사용 | 공식 사이트는 연구용·상업 판매 제품 포함을 허용하되, 데이터 자체 또는 변환본의 직접 재판매를 금지 | 제품 저장 형식·attribution을 반영해 승인 검토 |

CMU 공식 안내는 같은 subject가 여러 subject 번호에 나타날 수 있고, 손·발가락 joint는 noisy할 수 있으며 손가락·엄지 joint는 편집 편의를 위해 추가된 것이므로 실제 capture로 다루지 말라고 명시한다.[1] 따라서 제품 변환은 33-landmark로 매핑할 때 noisy hand·toe와 비측정 finger joint를 별도 평활화·제외 규칙으로 관리해야 한다.

CMU source가 슈팅 구간과 사용 범위를 모두 통과하면, 첫 실제 모션의 실험적 source가 될 수 있다. 다만 특정 NBA 선수의 개인 슛폼 모델은 아니며, 제품에서는 `실제 mocap 기반 익명 슈팅 모션`으로만 다뤄야 한다.

## 초기 소스 분류

| 등급 | 정의 | 현재 후보 |
| --- | --- | --- |
| M1 | 실제 사람 3D 관절 time-series + basketball shooting + 사용 조건 확인 | CMU Subject 86 Trial 14 — 라이선스·클립 검토 대기 |
| M2 | 실제 사람 다중 시점·보정 camera + shooting segment | 아직 승인 후보 없음 |
| M3 | 진정한 360도 또는 고해상도 단일 시점 | 실제 영상 조사 기록에 보관, metric 3D 모델 불가 |

## 2차 확인: University of Kansas free-throw markerless study

Kansas 연구팀의 공개 논문은 실제 농구 경험자를 대상으로 한 자유투 동작을 **9대의 HD camera, 120 Hz** markerless motion capture system으로 분석했음을 설명한다.[2] 34명이 각각 10회의 자유투를 수행했으므로, 실제 사람·고속·다중 camera의 좋은 연구 설계 사례다. 그러나 공개 논문은 집계된 biomechanical 결과를 제공할 뿐 raw 3D joint time-series 또는 raw camera files의 공개 다운로드를 제공하지 않는다.

| 항목 | 판정 |
| --- | --- |
| 실제 인체·자유투 연속 동작 | 확인 |
| 다중 camera·120 Hz capture protocol | 확인 |
| raw pose sequence 공개 | 미확인 |
| 제품용 3D source 승인 | 불가; 논문은 품질 기준 참고용 |

이 결과는 OCW·대학 자료가 캡처 **방법론**에는 유용하지만, 논문만으로 실제 모션 파일을 생성하면 안 된다는 경계를 확인한다.

## CMU Trial 실제 marker 감사

### Subject 86 Trial 14 — 유지 보류

공식 C3D 원본을 내려받아 SHA-256 `dc4fb916…f22c80a0`으로 기록하고, 43개 marker·6,539 frame·120 fps·54.492초의 실제 optical marker time-series임을 확인했다. 연속 marker 조건을 통과한 C3D이므로 M1 후보 상태를 유지한다.

frame 3364와 3754 주변의 measured-marker audit sheet를 재검토했다. 두 구간은 실제 전신에서 한쪽 팔이 머리 위로 움직이는 장면을 보이지만, marker 목록에는 공 marker가 없고, 수정된 prefix-agnostic wrist/shoulder event 검출에서는 손목이 어깨보다 높고 135° 이상 연장된 release 조건을 재현하지 못했다. 따라서 이 두 frame은 **슛폼으로 승인하지 않는다**. 상태는 `actual_optical_basketball_motion_candidate`이며, 라이브러리·추천에서 제외한다.

### Subject 6 Trial 14·15 — trial-level 설명 분리

Subject 6 Trial **14**는 `basketball - crossover dribble, shoot`, Trial **15**는 `basketball - dribble, shoot`로 명시되고 120 fps C3D를 제공한다.[1] Trial 14는 marker 연속성 검사를 통과했으나 손목 상승·팔 연장 release event가 0개이므로 `unapproved_no_measured_release_event`로 유지한다.

2026-08-21에는 Trial 14 전체에 대해 wrist-lift 기준을 10 mm까지 낮춰 재실행했지만 후보는 여전히 0개였다. frame 72–192 audit sheet는 드리블·이동 자세만 보이고, frame 228–372 sheet는 marker 가시성이 중간 이후 급격히 떨어져 준비→상승→릴리스→팔로우스루가 연속적으로 확인되지 않았다. 이 결과는 trial 설명의 `shoot` 단어만으로 motion을 승인할 수 없음을 재확인한다. Trial 14는 `unapproved_no_measured_release_event_and_incomplete_tracking`으로 유지한다.

2026-08-20 공식 Subject 6 trial table 재검토에서 1–13은 walk 또는 forward/backward/sideways/crossover/free-style dribble로만 명시되었고, shooting을 명시한 행은 14와 15뿐이었다. 따라서 Subject 6의 나머지 13개 trial은 슈팅 source 탐색·다운로드 대상에서 제외한다.

같은 날짜의 CMU 공식 `basketball` motion category 전체 목록도 Subject 6의 2–15번 trial만 반환했다. 즉 현재 CMU category에서 trial-level shooting을 명시한 추가 source는 Trial 14·15 외에는 확인되지 않았다. Trial 15의 단일 승인 모션을 복제해 여러 모델로 수를 채우지 않으며, 후속 제품 모델은 별도 source에서 provenance를 다시 확보해야 한다.

Trial 15는 SHA-256 `ebcec61b…cf842e5d5`, 255 marker, 545 frame의 원본을 통과했고, right wrist가 어깨보다 **249.97 mm** 높고 팔꿈치가 **139.63°** 연장된 frame 353 후보를 확인했다. 준비→딥→상승→릴리스→팔로우스루의 측정 marker keyframe(269, 317, 335, 353, 385)을 16관절 제품 schema로 정규화했다. source hash·marker 연속성·anonymous identity·release/follow-through gate를 모두 통과해 `approved_actual_optical_mocap_3d`로 최초 승인했다. 이 source는 특정 선수 모사나 이름 표시에 사용하지 않는다.

## 3차 확인: NPU RGB+D 및 공개 action datasets

NPU RGB+D 원 논문은 실제 농구 선수 10명이 다섯 camera position에서 수행한 action의 RGB+D·depth·**25개 3D joint coordinate**를 설명하며, shooting class를 포함한다고 명시한다.[3] 60 fps stereo source이므로 CMU marker data의 보조 후보가 될 잠재력은 있다. 그러나 논문에 연결된 공개 GitHub URL은 현재 404를 반환해 data file과 라이선스를 재현 가능한 방식으로 확인하지 못했다. 따라서 상태는 `lead_only_unavailable`이며 제품 source로 승인하지 않는다.

SpaceJam 기반 공개 GitHub 프로젝트는 `Shoot` action label과 joints `.npy`를 언급하지만, 3D CNN action classification용 영상·joint 데이터셋으로서 metric 3D joint provenance와 상업 사용 조건이 확인되지 않았다.[4] 그러므로 shooting event classifier 연구 참고 자료일 뿐 3D 모션 source가 아니다.

| 후보 | 실제 인체 | 3D joint | 현재 접근·라이선스 | 제품 상태 |
| --- | --- | --- | --- | --- |
| NPU RGB+D | 논문상 실제 선수 | 논문상 25 joint | 연결 저장소 404 | `lead_only_unavailable` |
| SpaceJam / action recognition | 실제 영상 | metric 3D 불명 | action dataset 조건 미확인 | `not_3d_motion_source` |

## 4차 확인: SportsPose

SportsPose는 24명의 subject·5종 sport activity에서 176,000개 이상 3D pose를 제공하며 marker-based system과 비교한 평균 오차 34.5 mm를 보고하는 공개 연구 데이터셋이다.[5] 따라서 동적 실제 인체 3D pose source로서는 유력한 연구 후보이다. 그러나 공식 프로젝트 페이지와 repository README에는 basketball shooting activity의 포함 여부, sequence별 움직임 설명, product redistribution·commercial-use license가 명시되지 않았다. repository 자체에도 `LICENSE` 파일이 확인되지 않았다.

| 검증 항목 | 판정 |
| --- | --- |
| 실제 인체 3D pose·다중 view 연구 데이터 | 확인 |
| basketball shooting 연속 구간 | 미확인 |
| raw sequence 이용 조건·상업 제품 조건 | 미확인 |
| 제품용 3D source 승인 | `unapproved_license_and_activity_gap` |

## 5차 확인: MLSE SPL Open Data Basketball Free Throw

MLSE Sport Performance Lab의 공개 repository는 비전 기반 markerless motion-capture로 수집한 농구 자유투 raw JSON을 제공한다. 2026년 3월 기준 농구 자유투 데이터는 5명의 익명 participant, 583 trial이며, session에 따라 30 fps 또는 60 fps다. 각 trial은 69개 pose keypoint와 ball의 court-coordinate xyz를 포함하므로 실제 연속 슈팅·3D 관절 time-series·명시적인 shooting event라는 점에서는 강한 후보이다.[6]

그러나 repository license는 **CC BY-NC-SA 4.0**으로 명시되어 있고, 이는 상업 제품 사용을 허용하지 않는다.[6] 따라서 raw JSON을 내려받거나 제품 PoseMotion으로 변환하지 않으며, 이 source는 `noncommercial_license_excluded`로 보류한다. 데이터 품질은 승인 조건을 상당 부분 충족하더라도 라이선스가 상업화 목적과 맞지 않으면 제품 라이브러리에 추가하지 않는다.

## 6차 확인: 상업 라이선스 Basketball FBX mocap pack

Animo의 `Mocap Basic Basketball` pack은 167개의 humanoid-based 실제 mocap animation을 FBX로 제공하며, free throw, jump shot, pull-up jump shot, catch-and-shot, fade-away 등 좌·우 슈팅 clip을 명시한다. 판매 페이지에는 extended use license로 상업·비상업 application 사용을 허용한다고 표시되어 있다.[7] 따라서 해당 clip은 실존 선수명과 연결하지 않는 `licensed_humanoid_mocap_3d` source로는 후보가 될 수 있다.

다만 이 pack은 유료 디지털 asset이며 현 시점에는 구매·다운로드하지 않았다. 구매 또는 사용 허가 없이 preview·clip name·판매 페이지로 관절 데이터를 재생성하지 않으며, 상태는 `commercial_candidate_pending_license_purchase`로 유지한다. 구매가 승인되면 원본 FBX의 skeleton mapping, frame rate, full release·follow-through, source license text를 audit한 뒤에만 product PoseMotion 후보로 변환한다.

## 7차 확인: BASKET-Multiview

BASKET-Multiview는 calibrated camera, depth, SMPL mesh와 animation annotation을 제공하지만 Unreal Engine 5와 EasySynth로 생성한 **synthetic basketball benchmark**다. 실제 촬영된 사람의 슈팅 motion이 아니므로, 다중 시점 검증 도구의 test fixture 또는 UI performance test에는 적합할 수 있어도 실제 선수 기반 3D 모델 라이브러리 source에는 사용할 수 없다.[8] 상태는 `synthetic_not_player_motion_source`다.

## References

[1] [CMU Graphics Lab Motion Capture Database — Subject 86](http://mocap.cs.cmu.edu/search.php?subjectnumber=86)

[2] [Cabarkapa et al., Biomechanical characteristics of proficient free-throw shooters](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full)

[3] [NPU RGBD Dataset and a Feature-Enhanced LSTM-DGCN Method](https://www.mdpi.com/2076-3417/11/10/4426)

[4] [Basketball Action Recognition / SpaceJam usage](https://github.com/hkair/Basketball-Action-Recognition)

[5] [SportsPose project page](https://christianingwersen.github.io/SportsPose/) and [repository](https://github.com/ChristianIngwersen/SportsPose)

[6] [MLSE SPL Open Data repository](https://github.com/Sport-Performance-Lab/SPL-Open-Data) and [Basketball Free Throw dataset documentation](https://github.com/Sport-Performance-Lab/SPL-Open-Data/tree/main/basketball/freethrow)

[7] [Animo Mocap Basic Basketball — RenderHub](https://www.renderhub.com/animo/animo-mocap-basic-basketball)

[8] [BASKET-Multiview Dataset](https://humansensinglab.github.io/basket-multiview/data.html)
