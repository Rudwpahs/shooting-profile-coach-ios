# 제공 Paul George clip 시각 감사

| Clip | contact sheet 관찰 | 독립 영상 분석 | 초기 판정 |
| --- | --- | --- | --- |
| `pg-clip-a` | 세로 화면의 free-throw형 전신 동작은 보이지만, 공개적으로 확인 가능한 jersey/name 식별 정보가 contact sheet에서 판독되지 않는다. | 자동 visual analysis는 Orlando Magic #20 Markelle Fultz라고 판정했다. | **Paul George candidate에서 제외.** 사용자 label과 식별 결과가 충돌하므로 PG로 귀속하지 않는다. |
| `pg-clip-b` | 1초 길이의 low-resolution sideline clip에서 white #13 uniform의 연속 점프슛 자세와 팔로우스루가 보인다. | 자동 visual analysis는 Paul George, East All-Star #13 jump shot이라고 판정했다. | 33-landmark extraction으로 추적 품질·phase 연속성을 추가 검증한다. |

두 clip 모두 단일 camera source이며 camera calibration·동기화된 보조 view가 없다. 따라서 어느 clip도 calibrated multi-view 3D 또는 추천 reference 후보가 될 수 없다.

## MediaPipe landmark 결과

| Clip | sampled/detected frame | landmark ratio | mean visibility | gate 결과 | 결정 |
| --- | ---: | ---: | ---: | --- | --- |
| `pg-clip-a` | 15 / 15 | 1.000 | 0.549 | `low_landmark_visibility` | PG identity 불일치와 visibility 미달로 제외 |
| `pg-clip-b` | 11 / 11 | 1.000 | 0.865 | `too_few_sampled_frames` | Paul George로 보이지만 1초 source의 최소 temporal sample 수 미달로 제외 |

`pg-clip-b`의 high visibility만으로는 five-phase motion candidate를 승인하지 않는다. 원본 31 frame·약 1초 clip에 대한 같은 frame 재사용 또는 synthetic interpolation은 sample count를 보완하는 방법으로 사용하지 않았다.
