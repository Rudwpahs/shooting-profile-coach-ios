# Stephen Curry 사선 슬로모션 candidate 검토

| 항목 | 확인 결과 |
| --- | --- |
| 업로드 source hash | `643d60c19656a5d12e70e8d81f717333057d85133f9c8a57ed9fa37af8446c27` |
| 분석 대상 구간 | 원본 1.5–5.5초에서 분리한 4초 window |
| 실제 선수 식별 근거 | 영상 내 `Steph Curry` text, Warriors uniform, 실제 슈팅 동작 |
| camera view | handheld mobile **oblique** following shot |
| pose 품질 | 48/48 sampled frame, tracking ratio 1.000, mean landmark visibility 0.822 |
| five-phase event time | 2000·2667·2833·3000·3250ms (window-relative) |
| product boundary | `monocular_relative_pose_not_metric_3d` · candidate only · recommendation 제외 |

overlay audit에서는 준비→딥→상승→릴리스→팔로우스루가 순서대로 보이고, 초기 보행 구간은 phase selection에서 제외했다. 다만 handheld oblique video는 calibration·동기화된 두 camera view·projection matrix를 제공하지 않으므로 calibrated 3D triangulation에 사용하지 않는다.
