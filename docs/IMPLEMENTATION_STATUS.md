# FormPath 구현 현황과 다음 계획

기준일: 2026-09-02

## 한 줄 상태

정면과 슈팅 측면을 **서로 다른 슛으로 촬영**해 101개 정규화 위상으로 맞추고, 두 시점의 2D 뼈 방향을 결합해 비공개 대표 4D 스켈레톤을 만드는 V2 코드 경로는 구현되어 있습니다. 다만 결과는 동시 촬영·카메라 보정·삼각측량으로 얻은 실제 계측 3D가 아니며, 실사용 활성화에 필요한 Firebase Emulator, Xcode, 모델 번들, 실제 iPhone, 실험 데이터 검증은 아직 통과하지 않았습니다. 세 V2 플래그는 계속 기본 OFF입니다.

## 지금까지 구현한 흐름

1. **제품 경계 고정:** 출력 경계를 `representative_phase_fused_4d_estimate_not_actual_3d`로 고정해 실제 3D 및 추천용 optical-mocap 데이터와 분리했습니다.
2. **촬영 프로토콜:** Basic은 정면 1회 + 슈팅 측면 1회, High는 각 시점 3회씩 수집하며 각 클립을 독립 분석합니다.
3. **기기 내 영상 분석:** V2 Expo/Swift 모듈 계약, 사람 중심 ROI, 원본 좌표 복원, 실제 presentation timestamp, 진행·취소·품질 실패 경로를 구현했습니다.
4. **위상 정렬:** 각 슛에서 `ready → deepestDip → rise → releaseProxy → followThrough`를 찾고 정확히 101개 위상으로 재표본화합니다. 서로 다른 영상의 원본 시간을 같은 순간으로 취급하지 않습니다.
5. **방향 및 스켈레톤 생성:** 정면/측면 투영 각을 이용해 뼈의 3D 방향을 복원하고, 수평 근처의 `tan` 특이점을 피하는 SVD 제약 풀이를 사용합니다. 고정된 성인 표시 템플릿 길이로 forward kinematics를 수행하며 단위는 개인의 실제 신체 치수가 아닌 `template_shoulder_breadths`입니다.
6. **반복 슛 합의:** High 모드는 각 시점에서 전체 궤적이 일치하는 최소 2개 슛을 먼저 선택한 뒤 결합합니다. Basic 신뢰도는 최대 0.65이며, 임계 품질을 넘지 못하면 그럴듯한 대체 스켈레톤 대신 재촬영을 요구합니다.
7. **비공개 저장:** 원본 영상·URI·파일명·얼굴/머리 관절·native z는 클라우드 저장 대상이 아닙니다. 12개 허용 관절만 고정소수점 payload로 저장합니다.
8. **압축된 Firestore 계약:** Basic 5문서, High 9문서만 기록하고 head를 마지막에 발행합니다. 관찰 payload는 14,544바이트, 대표 sequence는 48,480바이트이며 viewer는 head + revision 두 번만 읽습니다.
9. **복구 및 삭제:** 한 요청당 한 문서만 변경하고, 모호한 쓰기는 정확한 불변 필드와 bytes를 다시 읽어 확인합니다. 삭제는 revision → capture → observations → head 순서로 재개할 수 있습니다.
10. **프로필 UI:** 로그인한 소유자만 V2 프로필 목록, 101위상 viewer, 삭제 상태를 사용할 수 있도록 연결했습니다.

## 현재 구현 범위

| 영역 | 상태 | 실제 의미 |
| --- | --- | --- |
| Basic 1+1 / High 3+3 capture UI | 구현, 플래그 OFF | 화면·상태 전이·재촬영 경로가 코드와 테스트에 존재 |
| native V2 detector | 구현, 기기 검증 대기 | Swift/Expo 모듈과 모델 실행 경로는 있으나 Xcode/실기기 증거가 아직 없음 |
| crop 복원·101위상 정규화 | 구현 | 각 클립을 독립적인 normalized shot phase로 변환 |
| 두 시점 방향 복원·forward kinematics | 구현 | 대표 추정치이며 synchronized/metric/actual 3D가 아님 |
| High 반복 슛 합의·불확실성 gate | 구현 | 현재 임계값과 `heuristic_v1`은 공학 기본값, 통계 보정 전 |
| compact Firebase persistence | 구현 | Basic 5 / High 9 writes, two-read viewer, direct resumable deletion |
| Firestore 보안 규칙 | 정적 계약 구현, Emulator 대기 | owner/schema/크기/발행 순서 검증 코드는 있으나 실제 Rules Emulator 결과 필요 |
| 개인 V2 프로필 재생 | 구현, 플래그 OFF | 101개 저장 위상을 순서대로 재생 |
| 기존 CMU 익명 actual mocap 추천 | 기존 기능 유지 | 승인된 reference만 별도 legacy 추천에 사용 |
| 두 시점 위상 정렬 gate·불확실성 전파 | 구현 (PR #2 병합) | 정면·측면 위상 불일치가 recapture와 불확실성에 반영되며, 정렬이 나빠질수록 confidence가 낮아진다 |
| 원시 클립 → 저장 가능 프로필 단일 경계 | 구현 (PR #2 병합) | `buildTwoViewRepresentativeProfile`이 캡처 훅의 유일한 진입점 |
| 기기 내 파생 평가 리포트 | 구현, 플래그 OFF (PR #4, 미병합) | 개발 빌드 + `EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL=1`에서만 노출. 앱 내 직접 촬영 클립·명시적 동의·불투명 동의 기록 ID·cross-view geometry gate를 모두 통과해야 파생 지표 JSON을 만든다. 원본 영상·랜드마크는 기기 밖으로 나가지 않는다 |
| 실제 iPhone 실영상 E2E 스모크 | **미실행 (blocked)** | 물리 기기·macOS/Xcode·동의된 영상이 없어 `real_video_fixture_unavailable` 유지 |
| V2 개인 기록 간 정량 비교·코칭 | 미구현 | validation 이후 Project 2로 진행 |
| V2와 선수 스타일 데이터 비교 | 미구현 | source 권리·provenance·호환 metric 검증 이후 Project 3로 진행 |
| 사용자 간 공유·peer range | 미구현 | 동의·최소화·privacy threshold 설계 이후 Project 4로 진행 |

## 2026-08-31 저장소 동기화에서 고친 오류

- 손상된 로컬 `node_modules`를 pnpm 9.12.0 frozen lockfile 설치로 복구해 `react-native-css-interop/jsx-runtime` 해석 오류를 제거했습니다. 의존성 선언 결함이 아니어서 중복 direct dependency는 추가하지 않았습니다.
- 기존 generic/규격 불일치 플랫폼 이미지를 하나의 FormPath SVG 원본에서 만든 iOS icon, Android adaptive icon 3종, favicon, splash image로 교체하고 존재·PNG 형식·정확한 크기를 검사하는 회귀 테스트를 추가했습니다.
- 추적 중이던 로컬 Barlow TTF 직접 참조를 공식 Expo Google Fonts 패키지로 교체하고 더 이상 쓰지 않는 TTF 4개를 제거해, 의존성과 라이선스가 선언된 재현 가능한 폰트 로딩으로 바꿨습니다.
- `expo lint`가 비대화식 환경에서 의존성 재설치를 시도하던 문제를 제거하고, 고정 ESLint를 직접 실행하면서 `--max-warnings 0`을 강제했습니다.
- 이전에 추적되던 `web-dist/` 생성물을 저장소 트리에서 제거하고 다시 들어오지 않도록 제외했으며, pnpm workspace build 설정 위치, ESLint CommonJS 구성, 미사용 코드와 배열 타입 경고도 정리했습니다.
- 웹 정적 내보내기가 18개 라우트를 완성하도록 복구했습니다.

## 2026-09-02 P1.1 촬영 전 hardening

- 촬영 출처(camera/library)를 reducer 상태에 보존하고, 평가 증거는 앱 내 직접 촬영 클립만 인정한다.
  라이브러리 입력은 `library_source_not_admissible`로 제외된다.
- `consented_self_capture`는 명시적 동의 확인과 불투명 동의 기록 ID를 요구하며, 리포트 스키마가
  source class별로 그 존재/부재를 강제한다.
- cross-view geometry gate가 같은 각도를 재표기한 클립, 한쪽/양쪽 미러링, 사실상 동일한 두 투영을
  거부한다. 정상 정면/측면 쌍과의 거리 차이는 3배 이상이다.
- 리포트 스키마가 Basic/High 시도 수와 pipeline detail 코드를 고정하고, builder가 허용 목록 밖의
  detail을 버려 임의 문자열이 리포트에 들어가지 못한다.
- Expo Doctor 3건 중 3건 해결(직접 `expo-modules-core` 의존성 제거, `expo-asset` 추가, SDK 54 버전 정렬).
  남은 1건은 `git check-ignore`로 반증된 오탐이다.
- 작은 글자 muted 색상을 4.25:1에서 4.84:1로 올리고, 하드코딩된 light UI에 맞춰
  `userInterfaceStyle`을 `light`로 선언했다.

## 아직 통과해야 하는 외부 gate

- Firebase Security Rules compiler 및 Emulator의 실제 allow/deny·복구·삭제 테스트
- macOS의 clean prebuild, CocoaPods, Xcode compile 및 signing 확인
- detector model의 승인된 SHA-256, 라이선스/재배포 기록, 최종 앱 bundle 포함 여부
- 실제 iPhone에서 HEVC/VFR/slow-motion, 좌우 슈터, 권한 거부, background/cancel/retake, airplane mode, force-quit 복구 테스트
- synthetic 200 sessions, ground-truth rig/optical-mocap 30 sessions, 성인 60명 반복 슛, negative 300 clips를 포함한 held-out 검증
- 3D 관절각 오차, false accept/reject, subgroup 편향, High 반복 안정성, uncertainty coverage 목표 통과

이 gate들이 끝나기 전에는 “사용자 영상이 잘 나온다”, “정확한 3D”, “95% 신뢰구간”, “선수와 몇 % 일치”라고 출시 문구에 표시할 수 없습니다.

## 앞으로의 실행 순서

1. **P0 — 실행 가능성 증명:** Firebase Emulator → macOS/Xcode → 모델 checksum/bundle → 실제 iPhone smoke matrix 순서로 현재 V2 코드를 검증합니다.
2. **P1 — 과학적 정확도 검증:** frozen 알고리즘과 prespecified target으로 synthetic·rig/mocap·held-out user dataset을 평가합니다. 실패하면 플래그를 켜지 않고 알고리즘 버전을 올립니다.
3. **P2 — 개인 비교와 코칭:** 같은 사용자의 이전 세션과 현재 세션을 먼저 비교하고, 관측 가능한 위상·관절 metric에 근거한 개선 cue만 제공합니다.
4. **P3 — 선수 스타일 reference:** 라이선스/동의가 있고 출처가 검증된 데이터만 호환 가능한 derived metric으로 변환합니다. 한 선수의 가명 데이터는 “익명 집계”로 부르지 않습니다.
5. **P4 — 공유와 peer range:** 명시적 opt-in, 최소 필드, 철회/삭제, 최소 cohort 크기와 재식별 위험 검토를 통과한 뒤 구현합니다.
6. **마지막 rollout:** 모든 증거를 release record에 고정하고 별도 reviewed commit에서 세 플래그를 단계적으로 켭니다.

## 재현 명령

```sh
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test:unit
pnpm exec expo export --platform web --output-dir web-dist
```

Linux 명령의 성공은 native, Firebase, 실기기, 과학적 검증을 대신하지 않습니다.
