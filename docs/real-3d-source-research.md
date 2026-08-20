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

## CMU Trial 14 실제 marker 감사

공식 C3D 원본을 내려받아 SHA-256 `dc4fb916…f22c80a0`으로 기록하고, 43개 marker·6,539 frame·120 fps·54.492초의 실제 optical marker time-series임을 확인했다. 연속 marker 조건을 통과한 C3D이므로 M1 후보 상태를 유지한다.

손목이 어깨보다 45 mm 이상 높고 팔꿈치가 135° 이상 연장된 두 구간(frame 3364, 3754)을 **측정 marker만**으로 선별해 3D audit sheet로 검토했다. 두 구간 모두 한쪽 손이 머리 위로 상승하는 실제 전신 동작을 보여 주지만, C3D의 marker 목록에는 공 marker·명시적인 release event가 없다. 따라서 현재 상태는 `actual_optical_basketball_motion_candidate`이며, 아직 `approved_shooting_form`이 아니다. 다음 단계는 원 데이터베이스의 rendered animation 및 프레임 시퀀스에서 준비→공 release→팔로우스루를 수동 확인하는 것이다.

공식 subject 목록의 rendered animation 링크는 현재 브라우저 세션에서 직접 재생 페이지로 전환되지 않았다. 따라서 외부 rendered movie에 의존하지 않고, C3D marker 원본에서 만들어진 audit sheet·관절 궤적·명시적 source description을 함께 사용해 다음 품질 단계를 진행한다.

CMU Subject 6은 상위 subject 설명에 `dribble, shoot basketball`가 포함되지만, 확인된 Trial 5의 명시적 motion description은 `basketball - forward dribble`이다. 따라서 Subject 6 Trial 5는 슈팅 모델 source에서 제외하고, 드리블·전신 marker 검증용으로만 별도 보관한다. subject-level 키워드로 trial-level 슈팅을 가정하지 않는다.

CMU 전체 농구 목록을 다시 확인한 결과, Subject 6 Trial **14**는 `basketball - crossover dribble, shoot`, Trial **15**는 `basketball - dribble, shoot`로 명시된다. 두 trial은 실제 shoot 동작이 포함된 더 명확한 C3D 후보이며, 공식 목록상 120 fps다.[1] 다음 실제 데이터 검증은 Trial 14·15의 C3D 원본을 확보해 trial 14/15 각각의 marker 연속성·실제 release·팔로우스루를 분리 감사하는 방식으로 진행한다.

## 3차 확인: NPU RGB+D 및 공개 action datasets

NPU RGB+D 원 논문은 실제 농구 선수 10명이 다섯 camera position에서 수행한 action의 RGB+D·depth·**25개 3D joint coordinate**를 설명하며, shooting class를 포함한다고 명시한다.[3] 60 fps stereo source이므로 CMU marker data의 보조 후보가 될 잠재력은 있다. 그러나 논문에 연결된 공개 GitHub URL은 현재 404를 반환해 data file과 라이선스를 재현 가능한 방식으로 확인하지 못했다. 따라서 상태는 `lead_only_unavailable`이며 제품 source로 승인하지 않는다.

SpaceJam 기반 공개 GitHub 프로젝트는 `Shoot` action label과 joints `.npy`를 언급하지만, 3D CNN action classification용 영상·joint 데이터셋으로서 metric 3D joint provenance와 상업 사용 조건이 확인되지 않았다.[4] 그러므로 shooting event classifier 연구 참고 자료일 뿐 3D 모션 source가 아니다.

| 후보 | 실제 인체 | 3D joint | 현재 접근·라이선스 | 제품 상태 |
| --- | --- | --- | --- | --- |
| NPU RGB+D | 논문상 실제 선수 | 논문상 25 joint | 연결 저장소 404 | `lead_only_unavailable` |
| SpaceJam / action recognition | 실제 영상 | metric 3D 불명 | action dataset 조건 미확인 | `not_3d_motion_source` |

## References

[1] [CMU Graphics Lab Motion Capture Database — Subject 86](http://mocap.cs.cmu.edu/search.php?subjectnumber=86)

[2] [Cabarkapa et al., Biomechanical characteristics of proficient free-throw shooters](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2023.1208915/full)

[3] [NPU RGBD Dataset and a Feature-Enhanced LSTM-DGCN Method](https://www.mdpi.com/2076-3417/11/10/4426)

[4] [Basketball Action Recognition / SpaceJam usage](https://github.com/hkair/Basketball-Action-Recognition)
