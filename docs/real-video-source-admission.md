# 실제 선수 영상 소스 승인 기준

## 핵심 원칙

기존의 생성형 16개 모션은 **폐기**했다. 이제부터 실제 선수 모델 후보는 아래 요건을 통과한 로컬 영상 pose만으로 생성한다. 선수 이름·원본 URL은 운영 감사용 비공개 레지스트리에만 두고, 제품 화면에는 익명 모델 특성만 노출한다.

> **1080p 슬로모션**과 **진정한 360도 영상**은 좋은 2D pose 입력일 수 있지만, 단독으로 metric 3D를 만들지는 않는다. 단일 광학 중심의 360도 영상에서 만든 여러 가상 시점은 물리적 baseline이 없으므로 삼각측량 근거가 아니다.

| 등급 | 필요한 입력 | 허용 결과 | 금지되는 주장 |
| --- | --- | --- | --- |
| A: 실제 선수 단일 시점 pose | 실제 선수 확인, 원본 1080p 이상, 전신·공·릴리스 손이 준비부터 팔로우스루까지 연속 가시, 광학 60fps 이상 또는 고속 촬영 | `monocular_relative_pose_not_metric_3d` | 선수 3D 복제, metric 3D, 신체 수치 |
| B: 진정한 360도 pose | A 요건 + equirectangular 원본·카메라 모델·동일 슛의 연속 구간 | 전방향 2D 상대 pose, 가려짐 감소 | 가상 crop만으로 삼각측량·metric 3D |
| C: 승인 가능한 3D | A 요건 + 물리적으로 분리된 2대 이상 카메라, 동기화, intrinsic/extrinsic calibration, 33개 관절 재투영 오차·연속성 통과 | `calibrated_multi_view_3d` 익명 모델 후보 | 선수 실명 노출, 원본 영상 공개 |

## 선수별 소스 조사 체크리스트

| 검사 | 통과 기준 | 실패 처리 |
| --- | --- | --- |
| 실제 인물·실제 슛 | 영상 소유자 또는 신뢰 가능한 공개 기록과 선수·슛 동작 교차 확인 | 후보 폐기 |
| 프레임 품질 | 원본 1080p 이상, 과도한 업스케일·편집 슬로우 제외 | 2D 분석 미실행 |
| 전신 연속성 | 발·골반·어깨·팔꿈치·손목·공이 12개 이상 표본 프레임에 가시 | candidate 거부 |
| 릴리스·팔로우스루 | 슈팅 손목이 어깨선 위에서 전방으로 유지되는 실제 프레임 확인 | candidate 거부 |
| 시간·카메라 | C 등급은 같은 슛의 타임코드 동기화와 물리 baseline 증빙 | A/B까지만 허용 |
| 법적·제품 경계 | 원본 사용 허용 범위와 비공개 provenance 레지스트리 기록 | 제품 라이브러리 미포함 |

## 현재 상태

초기 16개 YouTube 후보는 모두 기존 단일 시점 또는 **여러 장면의 비동기 컴필레이션**이었다. 그러므로 현재 승인된 실제 선수 3D 모델 수는 **0개**다. 슬로모션 breakdown 영상은 새 A 등급 후보 조사에 사용하되, C 등급 조건을 충족하기 전에는 익명 3D 라이브러리·추천·비교 화면에 들어가지 않는다.

## 공개 다중 시점 데이터 조사

| 데이터 | 가치 | 제품 모델 소스로서의 결론 |
| --- | --- | --- |
| BASKET-Multiview | 89개 camera view, calibration·depth·animation을 제공하는 1080p/4K 합성 농구 4D 벤치마크 | 실제 선수가 아닌 합성 장면이므로 실제 선수 모델 라이브러리에는 사용하지 않음; 검증기 테스트용으로만 검토 가능 [3] |
| SportCenter Multi-View | 실제 아마추어 농구 경기를 8개 동기화·보정 카메라로 촬영하고 일부 2D/3D pose를 제공 | 실제 다중 시점 검증기 연구 입력으로는 적합하지만 공개 설명상 달리기·걷기·서기 중심이라 슈팅 모델 source로 자동 채택하지 않음; 이용은 연구 목적 조건 확인 필요 [4] |
| NBA Player Shooting Motions | 실제 NBA 선수별 다수 3점슛에서 유도된 3차원 공 궤적·선수 단위 shooting metrics 제공 | 전신 관절 skeleton이 아니라 공의 typical trajectory 데이터이므로 release event 보조 연구용으로만 검토; 3D 사람 모델 생성에는 사용하지 않음 [5] |

## 참고 자료

[1] [MediaPipe Pose Landmarker – video landmark workflow](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)

[2] [MediaPipe iOS Pose Landmarker sample](https://github.com/google-ai-edge/mediapipe-samples/tree/main/examples/pose_landmarker/ios)

[3] [BASKET-Multiview Dataset](https://humansensinglab.github.io/basket-multiview/data.html)

[4] [SportCenter Dataset](https://www.epfl.ch/labs/cvlab/data/sportcenter-dataset/)

[5] [NBA Player Shooting Motions dataset](https://www.kaggle.com/datasets/paultimothymooney/nba-player-shooting-motions)
