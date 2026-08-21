# 다중 시점 landmark 3D 알고리즘 코드 감사

## 결론

사용자가 말한 경로는 **같은 시간의 정면·측면 2D landmark 대응점 → calibration된 두 projection matrix → triangulation으로 xyz 추정 → reprojection error 검증**이다. 현재 project는 마지막 두 단계의 일부만 갖고 있고, 실제 입력 영상에서 동기화와 camera calibration을 산출하는 단계가 구현되어 있지 않다.

| 단계 | 현재 구현 | 판정 |
| --- | --- | --- |
| 2D landmark 추출 | `extract-relative-pose-candidate.py`가 MediaPipe 33 landmark를 frame별로 저장 | 구현됨. 다만 `pose_landmarks` image-normalized output만 저장하고 world landmark·camera parameters를 저장하지 않음. |
| 두 video pair 기록 | `init-relative-pose-pair.py`가 hash와 release-event normalization만 기록 | 구현됨. script 자체가 `timestampSynchronized: false`, `triangulationEligible: false`를 명시. |
| 동기화 추정 | shared flash/audio/action event를 이용해 두 camera frame을 같은 timestamp로 맞추는 routine | **미구현.** |
| camera calibration | checkerboard/ChArUco/court geometry로 intrinsic, distortion, relative R/t를 추정해 P=K[R|t] 생성 | **미구현.** `init-authorized-multiview-capture.py`는 hash·consent manifest만 생성. |
| triangulation | `validate-multiview-pose-candidate.py`가 SVD DLT로 2D 대응점을 triangulate하고 reprojection error 검사 | 부분 구현됨. 이미 계산된 3×4 projection matrix와 synchronized pose JSON을 필수 입력으로 요구함. |
| product motion 변환 | calibrated 33-point output을 16-joint five-phase product motion으로 바꾸는 admission path | **미구현.** validator output은 private calibrated frame record까지만 생성. |

## 현재 Curry가 이상했던 직접 원인

현재 single-view extractor의 `landmarks[*].z`를 `build-relative-pose-motion.py`가 shoulder-width로 나누어 `PoseMotion.z`로 저장했고, viewer가 그 값을 camera yaw·perspective 회전에 사용했다. 이 값은 calibrated dual-view triangulation으로 얻은 person-specific metric depth가 아니므로, 3D skeletal proportion과 rotation이 왜곡됐다.

즉, 현재 code에는 **triangulation kernel은 있지만, 실제 video pair를 user 알고리즘의 valid input으로 만드는 synchronization·calibration 및 product conversion code가 빠져 있다.** 따라서 두 영상만 제공되면 자동으로 `x,y,z`를 복구한다고 볼 수 없었다.

## 수정 방향

1. synchronized capture에서 shared flash/audio spike 또는 explicit timecode로 frame alignment를 계산한다.
2. calibration board 또는 충분한 고정 court geometry에서 K, distortion, R/t와 3×4 P matrices를 계산한다.
3. 33 joint별 triangulation 뒤 reprojection error·bone-length temporal consistency를 gate로 사용한다.
4. 통과한 sequence만 new `calibrated_multi_view_3d` admission converter로 16-joint five-phase asset으로 만든다.
