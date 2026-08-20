# 실제 선수 pose 후보 승격 파이프라인

## 제품의 현재 경계

실제 선수의 실명·초상·퍼포먼스 수치를 앱에서 노출하지 않는다. 단일 카메라 동영상의 MediaPipe 결과는 **`monocular_relative_pose_not_metric_3d`** 후보일 뿐이고, 특정 선수의 3D 복제나 보정된 계측값이 아니다.

## 재현 가능한 처리 단계

| 단계 | 구현물 | 통과 조건 | 미통과 시 |
| --- | --- | --- | --- |
| 1. 소스 선별 | 연속 전신 슛 동영상, 로컬 파일만 입력 | 12개 이상 표본 프레임 | 분석 중단 |
| 2. 2D landmark | `extract-relative-pose-candidate.py` + MediaPipe 33 landmark | 전신 landmark frame ratio ≥ 0.72 | `rejected` |
| 3. 상대 pose | 어깨 폭 기준 정규화·5단계 압축 | mean visibility ≥ 0.55 | 개인 후보로 저장 금지 |
| 4. 실제 3D 승격 | 두 대 이상 동기화된 카메라, 내부·외부 보정, 삼각측량 | 재투영 오차·관절 연속성·릴리스 이벤트 검증 | `candidate_multi_view_pose` 유지 |
| 5. 익명 참조화 | 승인된 다중 시점 시퀀스의 특성만 추출 | 법적 소스 범위·익명화·품질 문서화 | 제품 라이브러리 미포함 |

## 로컬 실행

```bash
python3 scripts/extract-relative-pose-candidate.py \
  --video /absolute/path/to/full-body-shot.mp4 \
  --model modules/formpath-pose/ios/Resources/pose_landmarker_full.task \
  --output artifacts/relative-pose-candidate.json
```

이 명령은 원본 동영상이나 이름을 출력 JSON에 넣지 않는다. JSON은 33개 landmark 후보와 품질 보고서만 포함한다. 실제 선수 모델 승격은 동기화·보정·삼각측량이 검증되기 전에는 수행하지 않는다.

다중 시점 데이터가 준비되면 다음 검증기로만 `calibrated_multi_view_3d`를 생성할 수 있다. `projectionMatrices`는 각 카메라의 **동일한 normalized-image 좌표계**를 월드 좌표로 연결하는 3×4 행렬이어야 하며, 도구는 동기화 프레임 비율·프레임 수·모든 33개 관절의 재투영 오차를 함께 검사한다.

```bash
python3 scripts/validate-multiview-pose-candidate.py \
  --view side=/absolute/path/side-relative.json \
  --view front=/absolute/path/front-relative.json \
  --calibration /absolute/path/calibrated-projection-matrices.json \
  --output artifacts/calibrated-multiview-pose.json
```

## 실행 검증

2026-08-20에 로컬 전신 동작 smoke-test 영상을 위 명령으로 실행했다. MediaPipe full task model은 **16/16 샘플 프레임**에서 33-landmark 후보를 만들었고, landmark frame ratio **1.000**, mean visibility **0.654**로 단일 시점 relative pose 후보 품질 게이트를 통과했다. 이 결과는 파이프라인의 파일 입력·프레임 추출·landmark·품질 검사 연결을 검증하며, 실제 선수의 계측 3D 또는 익명 참조 라이브러리 승격을 뜻하지 않는다.
