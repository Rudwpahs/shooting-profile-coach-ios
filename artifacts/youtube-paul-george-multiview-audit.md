# YouTube Paul George 영상 다중 시점 적합성 감사

| Source | Visible subject and view | Same-shot / sync evidence | Calibration evidence | 3D admission decision |
| --- | --- | --- | --- | --- |
| `9GRZE4OlCcs` | narrator가 Paul George라고 밝힌 warm-up 영상. rear-quarter 중심의 mostly stationary single view와 여러 full-body shot sequence. | 다른 source와의 timecode·flash·clapboard·동일 frame 대응 정보 없음. | checkerboard/marker·camera intrinsics·lens distortion·extrinsics 없음. | triangulation 불가. 단일 영상 검토 source로만 취급. |
| `T0HOwSWGIPw` | Paul George #13, 2014 post-practice shooting. frontal/side, rear, panning side 등 여러 **순차 편집** shot. | 같은 동작을 두 camera가 동시 촬영했다는 증거 없음. | handheld pan/tilt, fixed geometry·camera metadata·calibration target 없음. | triangulation 불가. 단일 영상 검토 source로만 취급. |

두 링크는 **Curry가 아니라 Paul George** source이며, 서로 다른 production과 촬영 세션의 public video다. 그러므로 두 영상의 2D landmark를 같은 timestamp로 맞춰 z를 복원하는 것은 불가능하다. 표준 3D triangulation에는 같은 순간의 대응 관측점과 두 camera의 projection matrix가 필요하지만, 이 pair에는 `timestampSynchronized`, intrinsics, distortion, relative camera pose가 없다.[1]

Court line은 고정 geometry를 추정하는 보조 단서일 수 있으나, 단독으로 unknown handheld camera의 full 3D projection matrix·각 frame의 pan/tilt·두 source 사이의 time correspondence를 복구하지 않는다. 이 source들은 Paul George의 qualitative 2D form review를 위한 evidence로는 유용하지만, calibrated 3D player model이나 recommendation asset에는 사용하지 않는다.

## References

[1]: https://docs.opencv.org/3.4.16/d9/d0c/group__calib3d.html "OpenCV Camera Calibration and 3D Reconstruction"
