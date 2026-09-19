# FormPath Basketball

FormPath Basketball은 iPhone을 먼저 생각하고 만든 농구 슈팅 분석 prototype입니다. 영상을 멋있게 3D로 보이게 만드는 것보다, **어떤 데이터가 실제 측정이고 어떤 데이터가 추정인지 구분하는 것**을 더 중요하게 두고 있습니다.

그래서 화면에 3D skeleton이 보인다고 해서 전부 `actual 3D`라고 부르지 않습니다.

## 먼저 볼 문서

| 목적 | 문서 |
|---|---|
| 현재 구현 상태 | `docs/IMPLEMENTATION_STATUS.md` |
| product / data boundary | `docs/PROJECT_MAP.md` |
| 개발·test·checkpoint 규칙 | `docs/DEVELOPMENT_WORKFLOW.md` |
| multi-view capture | `docs/authorized-multiview-capture-kit.md` |
| uncalibrated reconstruction | `docs/UNCALIBRATED_RECONSTRUCTION_ALGORITHM.md` |
| 3D reconstruction script | `scripts/README.md` |
| representative 4D 검증 | `docs/representative-4d-validation-protocol.md` |
| 진행 기록 | `todo.md` |

## 데이터 등급

| Data class | 화면 표시 | 추천 근거 |
|---|---|---|
| `actual_optical_mocap_3d` | audit 후 가능 | audit 후 가능 |
| `calibrated_multi_view_3d` | calibration·sync·reprojection 검증 후 가능 | product 승인 후 가능 |
| learned / monocular 3D estimate | **estimate 표시를 붙여서만 가능** | 사용 안 함 |
| source-faithful 2D / corrected relative analysis | 분석용 표시 가능 | actual 3D 근거로 사용 안 함 |
| separate-shot representative phase-fused 4D | private 검증 단계에서만 | reference-grade로 사용 안 함 |

learned 3D나 monocular estimate를 calibrated, metric, optical-mocap 또는 `actual 3D`로 다시 이름 붙이지 않습니다.

## Personal V2 알고리즘

정면 영상과 슈팅 측면 영상을 동시에 찍지 못하는 상황을 가정한 분석입니다. 이 조건에서는 triangulation으로 실제 3D를 복원했다고 말할 수 없습니다.

```text
front shot + side shot
        ↓
각 영상에서 shooter crop
        ↓
2D joint trajectory 추출
        ↓
각 슛을 catch→follow-through 101 phase로 정규화
        ↓
같은 phase의 front / side 방향 증거 결합
        ↓
12관절 대표 (x, y, z, phase) skeleton 생성
        ↓
confidence / consistency 검사
        ↓
representative_phase_fused_4d_estimate 로 저장
```

Basic 모드는 1+1 촬영을 사용하고 confidence 상한을 0.65로 둡니다. High 모드는 3+3 촬영에서 서로 일치하는 subset을 찾아 대표 motion을 만드는 방식입니다.

이 결과는 **서로 다른 슛을 phase 기준으로 합친 representative estimate**이며 synchronized calibrated 3D가 아닙니다. 검증이 끝나기 전까지 관련 feature flag는 기본 OFF입니다.

## 실제 3D admission 알고리즘

실제 3D reference로 들어가려면 출처 이름만 보고 승인하지 않습니다.

```text
candidate 3D asset
   ↓
source provenance 확인
   ↓
synchronization 확인
   ↓
camera calibration 확인
   ↓
triangulation / coordinate reconstruction
   ↓
reprojection error 검사
   ↓
anatomy / motion audit
   ↓
통과 → actual 3D reference set
실패 → analysis asset 또는 reject
```

현재 `cmu-shoot-01`은 승인된 optical-mocap shooting reference입니다.

Curry의 retained motion은 MotionBERT를 이용한 **learned image-to-3D display estimate**이며 actual calibrated 3D가 아닙니다. Paul George 데이터도 player-video-derived analysis motion으로 남아 있으며 actual 3D recommendation evidence에서 제외합니다.

## 개발 명령

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test:unit
pnpm exec expo export --platform web --output-dir web-dist
```

multi-camera reconstruction을 직접 확인하려면 `docs/authorized-multiview-capture-kit.md`의 촬영·검증 순서를 따릅니다.

## 가장 중요한 원칙

```text
보기 좋은 3D ≠ 실제 측정된 3D
```

FormPath에서는 **표시 가능 여부와 추천 근거로 사용할 수 있는지를 별도 기준으로 판단**합니다.
