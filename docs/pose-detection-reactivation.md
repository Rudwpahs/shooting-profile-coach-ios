# Pose Detection 재활성화 조사

## 현재 코드 감사

원본 Python 분석기는 MediaPipe Pose Landmarker로 영상 프레임에서 33개 관절의 이미지 좌표와 world landmark를 추출하도록 작성되어 있다. 그러나 현재 복사본에는 필수 `pose_landmarker_full.task` 모델 파일, `motion.py`, `similarity.py`, 기본 `requirements.txt`가 없어 즉시 실행할 수 없다. 따라서 이 구현을 그대로 모바일 앱에 연결하는 것은 불가능하다.

| 경로 | 역할 | 현재 상태 |
| --- | --- | --- |
| `app/pose.py` | MediaPipe Tasks / Solutions detector adapter | Python 라이브러리는 설치되어 있으나 task 모델 자산 없음 |
| `app/analyze.py` | 프레임 순회, 관절각·shot span·timeline 생성 | `motion` 모듈 누락으로 실행 불가 |
| `app/server.py` | 영상 업로드·분석 API | `similarity` 모듈 누락, Mobile Expo 앱과 미연결 |
| Expo iPhone 앱 | 영상 선택·참조 애니메이션 표시 | 실제 pose detection 미구현 |

## 구현 경로

MediaPipe Pose Landmarker는 단일 이미지·동영상에서 33개 신체 landmark를 출력하며 이미지 좌표와 3차원 world 좌표를 모두 제공한다. 다만 단일 시점 world landmark는 개인별 보정 3D가 아니므로, 앱에서는 `monocular_relative_pose`로만 저장하고 실제 선수 모델 승격에는 사용하지 않는다. [1]

공식 iOS 구현은 `MediaPipeTasksVision` CocoaPods 의존성과 pose landmarker 모델 파일을 요구한다. 즉 Expo Go 범위만으로는 네이티브 iOS 동영상 추론을 바로 활성화할 수 없고, **Expo native module + development build** 또는 **서버 측 분석 서비스**가 필요하다. 공식 예제는 라이브 카메라뿐 아니라 기기 갤러리 동영상 분석도 지원한다. [2]

공식 iOS 샘플은 `AVAssetImageGenerator`로 선택된 동영상의 일정 간격 프레임을 생성하고, 각 프레임을 `MPImage`로 변환해 `PoseLandmarker.detect(videoFrame:timestampInMilliseconds:)`에 전달한다. 이 경로는 앱에 추가할 Expo native module의 구현 기준이다. [3]

| 단계 | iPhone·웹 개인 분석 | 실제 선수 모델 승격 |
| --- | --- | --- |
| 입력 | 사용자 선택 동영상 1개 이상 | 연속 전신 슛 클립 2개 이상 |
| 추론 | MediaPipe 33-landmark 2D + relative world pose | 각 카메라별 2D pose와 ball/release event |
| 저장 상태 | `monocular_relative_pose_candidate` | `candidate_multi_view_pose` |
| 승인 기준 | 사람 추적·가시성·슛 단계·연속성 통과 | 동기화·카메라 보정·삼각측량·재투영 오차 통과 |
| 공개 상태 | 개인 비공개 프로필에서만 | 별도 품질 승인 후에만 익명 참조로 전환 |

## 참조문헌

[1] [Google AI Edge, Pose landmark detection guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker)

[2] [Google AI Edge, Pose landmark detection guide for iOS](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/ios)

[3] [MediaPipe iOS PoseLandmarkerService sample](https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/pose_landmarker/ios/PoseLandmarker/Services/PoseLandmarkerService.swift)

## 2026-08-20 구현 검증 기록

웹 미리보기에서 Side·Front·Oblique 영상 선택 블록과 개인 프로필 진입점을 확인했다. Side 선택은 브라우저의 단일 `video/*` 파일 입력으로 연결되어 있으며, 웹 detector는 선택한 로컬 파일만 대상으로 MediaPipe Tasks Vision을 지연 로드한다. 선택된 영상은 서버로 자동 전송되지 않으며, 33개 landmark 품질 게이트가 통과한 압축 pose 후보만 로그인한 계정에 저장하도록 구현했다.

임시 전신 슈팅 smoke-test 영상으로 실제 브라우저 업로드 경로를 검증했다. UI는 Side 파일을 선택한 뒤 나란히 비교 카드와 `POSE DETECTION 실행` 제어를 표시했고, MediaPipe가 **16개 프레임의 33-landmark pose 후보**를 검출했다. 비로그인 상태에서는 저장을 차단하고 개인 프로필 로그인 안내를 표시했다. 이 smoke test는 detector·품질 게이트·저장 전 경계를 검증한 것이며, 실제 사용자 슛 품질을 평가하거나 계측 3D를 주장하지 않는다.
