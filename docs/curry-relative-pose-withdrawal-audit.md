# Curry relative-pose 3D 표시 철회 감사

## 확인한 데이터 경계

| 항목 | 현재 상태 | 결론 |
| --- | --- | --- |
| 정면·사선 source | 서로 다른 video hash이며 `timestampSynchronized: false` | 같은 순간의 joint correspondence가 아니다. |
| camera geometry | intrinsic·distortion·relative rotation/translation·projection matrix 없음 | 두 2D 관측점으로 triangulation할 수 없다. |
| pose extract 입력 | `result.pose_landmarks`의 image-normalized landmark만 저장 | source z는 camera-calibrated metric depth가 아니다. |
| viewer 표시 | normalized image landmark의 z를 물리 depth처럼 회전·perspective 투영 | visual 3D가 실제 Curry 인체 기하를 과장하고 관절을 왜곡한다. |

현재 Motion Studio screenshot에서도 전면 영상의 2D-derived z가 회전 가능한 3D skeleton로 표시되어, 사용자가 지적한 비정상적인 관절 비례·공간 형상이 재현되었다. 이 표시는 실제 3D motion representation으로 유지할 수 없으므로 철회한다.

## 정면과 측면으로 가능한 조건부 재구성

정면·측면에서 **같은 슛의 같은 시간 frame**마다 동일 joint를 대응시키고, 두 camera의 intrinsic·distortion 및 서로의 extrinsic pose로 projection matrix를 만든 뒤, reprojection error를 검증하면 triangulation이 가능하다. 그러나 현재 Curry clips는 두 조건을 만족하지 않아 z를 교정하는 방식으로 결합해서는 안 된다. OpenCV의 `calibrateCamera`는 calibration pattern의 여러 view로 camera parameter를 찾고, `triangulatePoints`는 두 camera projection matrix와 대응 image point를 요구한다.[1] MediaPipe Pose Landmarker는 단일 image/video에서 pose landmark를 산출하는 모델로, 현 프로젝트 extractor는 그중 image landmark output만 저장한다.[2]

## 결정

1. 두 Curry candidate를 3D viewer·Library의 `PoseMotion` 회전 표시에서 제거한다.
2. source hash·quality·5개 phase timestamp는 retained audit metadata로 보존한다.
3. future pair가 synchronized calibrated capture와 reprojection validation을 통과할 때만 `calibrated_multi_view_3d` asset을 별도 생성한다.

## Preview 재검증 상태

2026-08-21 초기 모바일 web screenshot은 기존 static preview bundle을 보여 `Curry 영상 후보`와 이전 rotatable skeleton이 남아 있었다. 이는 현재 TypeScript source가 아니라 stale preview artifact이므로, development service를 재시작하고 새 web export를 만든 뒤 실제 철회 화면을 다시 확인해야 한다.

재시작 후 `/motion` preview는 `검증된 3D 모션`과 `OPTICAL 3D` 상태를 표시하고, `MOTION 01`의 CMU source C3D frame을 viewer에 보여주었다. Curry video review 2개는 `3D 표시에서 철회됨` 안내로만 남아, 더 이상 viewer에 `Stephen Curry` 관절 asset을 공급하지 않는다.

`/library` preview도 `WITHDRAWN VIDEO REVIEWS · NO 3D MODEL` 아래에 Curry 정면·사선 source의 tracking/visibility와 철회 사유만 표시했다. 각 record에는 `PoseMotionViewer`가 없고, viewer는 CMU `MOTION 01` 실제 optical motion에만 연결되어 있다.

## References

[1]: https://docs.opencv.org/3.4.16/d9/d0c/group__calib3d.html "OpenCV Camera Calibration and 3D Reconstruction"
[2]: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker "MediaPipe Pose Landmarker guide"
