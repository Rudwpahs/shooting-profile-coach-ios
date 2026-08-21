# 무구매 실제 3D 슈팅 모션 캡처 키트

> 이 절차는 유료 asset, 선수 영상 재활용, 생성형 관절 추정을 사용하지 않는다. 본인이 촬영하거나 명시적으로 사용 허가를 받은 사람의 물리적으로 분리된 두 카메라 영상만 허용한다.

현재의 상업 사용 가능 공개 source 검토에서는 CMU Trial 15 한 건만 제품 품질 gate를 통과했다. 추가 모델은 수를 채우기 위해 같은 슛을 복제하지 않고, 아래의 capture packet을 통과한 서로 다른 실제 슈팅 시퀀스만 추가한다.

| 준비물 | 최소 조건 | 허용하지 않는 대체물 |
| --- | --- | --- |
| 촬영 장치 | 물리적으로 분리된 휴대전화 또는 카메라 2대 | 한 대의 360도 카메라를 crop한 두 view |
| 장면 | 전신·발·공이 보이는 1회 이상의 완결 슛 | 상체만 보이는 highlight·편집 montage |
| 동기화 | 시작 시 **공유 flash/LED**를 두 camera에 보이게 하고 flash spike로 두 video 간 34 ms 이내 frame 정렬 검증 | 추정된 timestamp·수동 임의 정렬 |
| 보정 | 두 fixed camera가 동시에 본 checkerboard image pair에서 intrinsic·distortion·relative R/t·3×4 projection matrix 산출 | 보정 없이 두 2D pose를 결합 |
| 동의 | 촬영자·피사체의 사용 동의 기록 ID | 선수 이름·초상·외부 영상 URL만 보관 |

## 현장 절차

촬영 전 front camera는 슈터 정면, side camera는 슈팅 팔 쪽의 정확한 측면에 각각 고정한다. 두 camera 모두 프레임 전체에 발부터 손목·공의 팔로우스루까지 들어오게 한 뒤, 녹화 시작 직후 손뼉이나 화면 flash를 한 번 남긴다. 촬영은 준비 자세, 딥, 상승, 릴리스, 팔로우스루가 끊기지 않는 한 번의 완결 슛을 포함해야 한다.

원본 media는 제품 서버나 Firebase에 올리지 않는다. 검증을 수행하는 로컬 워크스테이션에서만 보관하고, 아래 provenance manifest에는 해시와 동의 기록 ID만 남긴다.

```bash
python3 scripts/init-authorized-multiview-capture.py \
  --front /absolute/path/front.mp4 \
  --side /absolute/path/side.mp4 \
  --consent-record local-consent-20260821-001 \
  --output artifacts/capture/provenance.json
```

그 다음 **카메라 위치를 바꾸기 전에** checkerboard를 두 camera에 동시에 보이게 하며 8개 이상 image pair를 촬영한다. 이 단계가 각 camera의 intrinsic·lens distortion·relative pose를 실제로 계산한다.

```bash
python3 scripts/calibrate-dual-camera.py \
  --front-dir /absolute/path/calibration/front \
  --side-dir /absolute/path/calibration/side \
  --columns 9 --rows 6 --square-size-m 0.024 \
  --output artifacts/capture/calibration.json
```

shared flash를 분석해 side timestamp를 front timeline으로 변환한다. flash spike를 검출하지 못하면 추정 정렬 대신 실패로 처리한다.

```bash
python3 scripts/synchronize-dual-camera-flash.py \
  --front-video /absolute/path/front.mp4 \
  --side-video /absolute/path/side.mp4 \
  --output artifacts/capture/sync.json
```

이제 각 view를 별도의 single-view candidate로 추출한 뒤, undistorted 2D landmark와 normalized projection matrix를 사용해 xyz를 triangulate한다.

```bash
python3 scripts/extract-relative-pose-candidate.py --video /absolute/path/front.mp4 --model modules/formpath-pose/ios/Resources/pose_landmarker_full.task --output artifacts/capture/front-relative.json
python3 scripts/extract-relative-pose-candidate.py --video /absolute/path/side.mp4 --model modules/formpath-pose/ios/Resources/pose_landmarker_full.task --output artifacts/capture/side-relative.json
python3 scripts/validate-multiview-pose-candidate.py \
  --view front=/absolute/path/artifacts/capture/front-relative.json \
  --view side=/absolute/path/artifacts/capture/side-relative.json \
  --calibration /absolute/path/artifacts/capture/calibration.json \
  --sync /absolute/path/artifacts/capture/sync.json \
  --provenance /absolute/path/artifacts/capture/provenance.json \
  --output artifacts/capture/calibrated-multiview-pose.json
```

마지막으로 통과한 calibrated sequence만 16-joint·5-phase product candidate로 변환한다. 이 converter는 single-view JSON이나 failed triangulation을 입력으로 허용하지 않는다.

```bash
python3 scripts/convert-calibrated-pose-to-product-motion.py \
  --candidate artifacts/capture/calibrated-multiview-pose.json \
  --id capture-candidate-01 --hand right \
  --output artifacts/capture/calibrated-product-motion.json
```

`calibrated-multiview-pose.json`이 `approved_private`가 되어도 곧바로 공개 reference library에 추가하지 않는다. provenance·reprojection error·release/팔로우스루·joint continuity를 재감사하고, 원본 사용 동의 범위와 익명화 여부를 검토한 뒤에만 새 모델로 승격한다.
