# Curry relative pose 후보 시각 검토

## 입력 camera 식별

| 업로드 보존 파일 | 실제로 확인된 view | 기존 자동 산출물 | 판정 |
| --- | --- | --- | --- |
| `curry-front-slowmo.mp4` | 좌측/후방에 가까운 **측면** 전신 shot | `curry-front-relative-motion.json` | file stem과 실제 view가 다름. 후속 산출물에서는 `side`로 재기록 필요 |
| `curry-side-slowmo.mp4` | **정면** 전신 shot | `curry-side-relative-motion.json` | file stem과 실제 view가 다름. 후속 산출물에서는 `front`로 재기록 필요 |

두 영상 모두 실제 Stephen Curry의 전신 슈팅, 준비·딥·상승·릴리스·팔로우스루를 보이며 MediaPipe 33-landmark overlay는 전신을 일관되게 따른다. 정면 후보는 UI overlay가 오른쪽에 있고, 측면 후보는 세로 video의 여백·경기장 배경이 있지만, 두 경우 모두 릴리스 전후 팔과 다리가 view 안에 남아 있다.

## 승인 경계

두 업로드는 각각 다른 원본 duration·frame cadence를 가진 느린 영상이다. 릴리스 event를 맞춘 **두 개의 independent monocular relative pose candidate**로만 보관한다. 물리적 동기화·camera calibration·projection matrix가 없으므로 이를 calibrated multi-view 3D로 합치거나 triangulate하지 않는다. 자동 shooting-hand 추정이 view마다 서로 달랐으므로 hand identity는 단일 view 자동 결과로 승인하지 않는다.
