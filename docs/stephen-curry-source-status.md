# Stephen Curry 실제 슈팅 source 상태

## 확인된 영상 후보

`https://www.youtube.com/watch?v=Z7afVQ7C8e8`는 실제 Stephen Curry 경기 슈팅을 포함한 공개 영상 후보로 검토했다. 비파괴 분석에서 2:33–2:55 구간은 측면 전신 슈팅이 연속적으로 보이고, 0:05·0:24·0:55에도 후방 사선·전방 사선·측면 후보 구간이 확인되었다.

| 항목 | 현재 상태 | 제품 승인 의미 |
| --- | --- | --- |
| 실제 Curry 장면 후보 | 확인됨 | 선수명 source 조사 단계만 통과 |
| 로컬 원본 media | 없음 | frame hash·재현 가능한 pose 추출 불가 |
| 33-landmark single-view candidate | 없음 | `monocular_relative_pose_not_metric_3d`도 아직 생성 불가 |
| calibrated multi-view 3D | 없음 | 실제 3D reference로 절대 승인 불가 |
| Curry 제품 모델 | 미승인 | 앱에 이름·모션을 표시하지 않음 |

> 현재 CMU `cmu-shoot-01`은 익명 optical-marker data이고 Stephen Curry 모델이 아니다. Stephen Curry 이름은 실제 영상 source가 로컬에서 재현 가능하게 추출·기록되고 해당 후보의 경계가 검증될 때까지 제품 UI에 다시 표시하지 않는다.

## 다음 승인 조건

법적으로 사용 가능한 로컬 원본 media를 확보한 뒤 `extract-relative-pose-candidate.py`로 전신·33-landmark·5단계 후보를 생성한다. 이 결과는 한 camera 영상이면 `monocular_relative_pose_not_metric_3d`로만 보관한다. 특정 선수의 실제 3D reference로 승격하려면 물리적으로 분리된 동기화 두 camera, 보정 행렬, media hash, 재투영 검증을 추가로 통과해야 한다.
