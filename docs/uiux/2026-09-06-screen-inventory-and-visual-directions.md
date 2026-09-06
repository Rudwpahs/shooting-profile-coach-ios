# Hoop Hub UI/UX 개편 — Phase 0 화면 감사 · Phase 1 시각 방향 3안

작성일 2026-09-06 · 기준 `main` `075efaa860c6d0aadb403b697abdec2f5a94c5b6` (원격 HEAD 재확인 완료, 핸드오프
기준 SHA와 동일) · 브랜치 `feat/uiux-skeleton-social-redesign`.

핸드오프 패키지 `HoopHub_UIUX_Claude_Handoff_2026-09-06.zip` 14개 파일의 SHA-256을 전부 확인했다.
이 문서는 코드를 바꾸기 전 단계의 산출물이다: 실제 소스 기준의 화면 인벤토리, 세 가지 시각 방향, 공통
디자인 시스템 규칙, 추천안. **팔레트는 소유자가 방향을 고르기 전까지 코드에 적용하지 않는다.**

제품 한 줄 정의(핸드오프): *"사람의 얼굴이 아니라 슛폼 skeleton이 identity가 되는 농구 소셜 코칭 앱."*

## 0. 건드리지 않는 것

- `lib/shooting-profile/*`, `lib/firebase-*`, `firestore.rules`, native pose module, feature flag 의미,
  two-view / representative 4D / phase / alignment / uncertainty 계약, 경계 문자열
  `representative_phase_fused_4d_estimate_not_actual_3d`.
- `app/(tabs)/profile.tsx`의 owner-bound async·auth·V1/V2·delete/recovery 로직. 시각 컴포넌트를
  바깥으로 뽑되 상태·연산은 그대로 둔다. 시각 리팩터와 동작 리팩터는 커밋을 분리한다.
- Expo Router 라우트 이름, iOS safe area, 기존 접근성 label/role/live region/reduced-motion 처리.
- PR #4(`feat/p1-real-video-validation`, 미병합)와 겹치는 파일: `app.config.ts`, `profile.tsx`(2줄),
  `capture-session.tsx`, `capture-slot-card.tsx`, `profile-list.tsx`, `quality-summary.tsx`,
  `capture-mode-picker.tsx`, `private-pose-capture.tsx`. PR #4가 먼저 병합되면 이 브랜치를 rebase한다.
  PR #4는 `userInterfaceStyle`을 `automatic`→`light`로 바꿨다(하드코딩된 light 화면 위에 iOS가
  dark 시스템 표면을 그리던 문제). 어두운 방향(A/B)을 고르면 이 결정을 다시 봐야 한다.

## 1. Phase 0 — 화면 인벤토리 (코드 기준)

### 1.1 라우트

| 라우트 | 목적 | 주요 CTA | 데이터 소스 | 현재 시각 문제 | 새 제품에서의 역할 |
| --- | --- | --- | --- | --- | --- |
| `app/(tabs)/index.tsx` 홈 | 목표별 연습 포커스 + 이동 | "모션 분석 시작" → `/motion` | `useProfile().goal`, `getPracticeFocus`, `ANONYMOUS_POSE_LIBRARY_STATUS` | 텍스트 hero 카드, 비활성 KPI 3개("검증 모션 1개", "내 기록 비공개"), ActionRow 문구가 "Curry · Paul George", 브랜드 리터럴 22개 | **홈/탐색**: 지금 할 일 → 내 모션 변화 → skeleton 탐색 카드 → 비교 추천 → 훈련 인사이트 |
| `app/(tabs)/motion.tsx` 분석 | 선수 monocular 분석 + CMU 참조 뷰어 | chip 선택, "내 기록과 비교하기" | `PLAYER_MONOCULAR_3D_ANALYSES`(Curry/Paul George), `ANONYMOUS_POSE_REFERENCES[0]` | 탭 전체가 **유명 선수 이름** 콘텐츠이며 매 카드에 "분석용 · 추천 제외" 면책. 사용자의 실제 분석(`/private-analysis`)은 여기에 없음 | 탭에서 제거 → **탐색(Explore)**: 익명 skeleton 피드 + 참조 모션. 선수 분석은 audit 문서로만 |
| `app/(tabs)/profile.tsx` 내 기록 | 계정·V1 목록·V2 목록·촬영 진입·뷰어 | 로그인/회원가입, "정면·측면 슛폼 만들기", 열기/삭제 | `useFirebaseAuth`, `listFirebasePrivatePoses`, `listShootingProfilesV2`, `useProfile` | "FORMPATH / PRIVATE VAULT" 프레임, 이메일 첫 글자 아바타, 이메일 prefix가 이름, 이메일·비밀번호 폼이 탭 안에 상주, V1+V2+촬영 카드가 한 화면에 적층, 리터럴 30개 | **프로필(identity)**: skeleton hero → 핸들/목표/특성 → MOTIONS·PROGRESS·SAVED → 하단 "비공개 기록·계정" 분리 |
| `app/(tabs)/assessment.tsx` (숨김) | 목표 선택 | 목표 4개 중 1개 | `TRAINING_GOALS`, `applyGoalSelection` | 네 번째 팔레트(`formpath-ui palette`), 모서리 0, 대문자 제목 | 프로필 "목표" 편집 시트로 흡수 |
| `app/(tabs)/library.tsx` (숨김) | CMU 참조 모션 1개 | "추천 목표 선택" | `ANONYMOUS_POSE_REFERENCES` | 위와 같은 네 번째 팔레트 | 탐색의 "참조 모션" 섹션으로 흡수 |
| `app/(tabs)/settings.tsx` (숨김) | 참조 데이터 상태, 로컬 초기화 | "로컬 프로필 초기화" | `ANONYMOUS_POSE_LIBRARY_STATUS`, `clearProfile` | 위와 같음 | 프로필 하단 "계정·개인정보" 시트 |
| `app/private-capture.tsx` | 4단계 촬영 세션 | 모드 → 손 → 정면/측면 클립 → 리뷰·저장 | `useShootingProfileCapture`, `saveShootingProfileV2` | 흐름은 좋음. primary가 `#C24122`(다른 화면은 orange/teal), 리터럴 21개 | 탭바 중앙 **촬영** 액션의 목적지. 어두운 "stage" 표면 허용 |
| `app/private-analysis/[id].tsx` | 저장된 대표 슛폼 뷰어 | 재생·위상·시점 | `getShootingProfileV2` | 뷰어가 카드 안에 카드; 신뢰도는 텍스트 %만, 낮은 신뢰도가 시각적으로 구분되지 않음 | **분석 3층 구조**: 모션+핵심 발견+신뢰도 → 지표 설명·비교 → 위상/각도/증거 |
| `app/dev/theme-lab.tsx` | 토큰 확인 | scheme 토글 | `SchemeColors` | 개발용. 유일하게 토큰만 쓰는 화면 | 새 토큰의 검증 화면으로 유지 |
| `app/oauth/callback.tsx` | OAuth 콜백 | — | — | — | 변경 없음 |

### 1.2 공용 컴포넌트

| 파일 | 역할 | 현재 문제 | 계획 |
| --- | --- | --- | --- |
| `theme.config.js` + `lib/_core/theme.ts` + `tailwind.config.js` + `lib/theme-provider.tsx` | 9개 토큰(light/dark) → nativewind vars | **정의만 있고 화면이 쓰지 않는다.** `ScreenContainer`의 `bg-background` 외에는 전부 리터럴. dark 값은 어느 화면에도 적용되지 않음 | 시맨틱 토큰으로 확장하고 화면이 토큰만 쓰도록 이동 |
| `components/formpath-ui.tsx` | ScreenTitle/SectionCard/Pill/Button + `palette` | 두 번째 팔레트(navy `#1E3A5F`, teal `#16A34A`, ink `#0F172A`), 모서리 0 | 토큰 기반 primitive로 교체 |
| `components/liquid-tab-bar.tsx` | 3탭 floating dock | `rgba(11,22,35,.96)` dock + orange capsule 하드코딩, 화면마다 `paddingBottom:116` 보정 | 컴팩트 소셜 바 + 중앙 촬영 액션. safe-area 내부 |
| `components/pose-motion-viewer.tsx` | V1/참조 `PoseMotion` 뷰어 (drag·pinch) | 스켈레톤 언어 1: orange 팔, cream 관절, navy 무대 | 공통 skeleton 규칙으로 통일 |
| `components/shooting-profile/sequence-viewer.tsx` | V2 101위상 뷰어 (reduced-motion, a11y 완비) | 스켈레톤 언어 2: off-white 뼈, navy 파생 관절, red stroke. 신뢰도 시각화 없음 | 동일 규칙 + 신뢰도 상태 시각화. 로직·a11y 보존 |
| `components/source-skeleton-reviewer.tsx` | 선수 2D landmark 리뷰 | 스켈레톤 언어 3, 선수 이름 | 제품 화면에서 제거(audit 전용) |
| `components/shooting-profile/profile-list.tsx` | V2 기록 목록 | 아이콘 행 목록, 신뢰도 텍스트 | skeleton 썸네일 카드 그리드 |
| `components/private-pose-capture.tsx` | V2 촬영 진입 / V1 legacy 선택 | 프로필 안의 세 번째 카드 | 진입은 탭바 중앙 액션으로; legacy는 기록 안에 축소 |

### 1.3 수치로 본 현재 상태

| 측정 | 값 |
| --- | --- |
| 브랜드 리터럴(`#F97316 #FB923C #0B1623 #F5F1E8 #132434 #102235`, rgba 변형) 하드코딩 | 18개 파일 153회 (profile 30, index 22, capture-session 21, sequence-viewer 14, motion 11) |
| 공존하는 팔레트 | 3개: `theme.config`(orange/navy/cream), `formpath-ui.palette`(navy/teal/ink/mist), 화면별 리터럴(`#9A3412 #C24122 #102C46 #1D9B77 #C74B11`) |
| `BarlowCondensed-Bold` 사용 | 118회 (제목·탭·버튼·캡션·마커까지) / `Barlow` 50 / `Barlow-SemiBold` 35 |
| 스켈레톤 렌더러 | 3개, 서로 다른 색 규칙 |
| dark scheme | 토큰은 있으나 화면 적용 0; PR #4에서 `light` 고정 |
| 접근성 | role/label/state, focus outline, live region, `reduceMotion` 처리 존재 → **보존 대상** |

### 1.4 콜드스타트에 실제로 쓸 수 있는 콘텐츠

- 사용자 본인의 V2 대표 슛폼(비공개, 101위상 12관절) — identity의 원천.
- 익명 참조 모션 1개(`ANONYMOUS_POSE_REFERENCES`, CMU optical mocap, `actual_optical_mocap_3d`).
- 목표 4종(일관성·거리·릴리스·리듬)과 목표별 연습 포커스 문구(`getPracticeFocus`).
- 선수 이름이 붙은 monocular 분석(`PLAYER_MONOCULAR_3D_ANALYSES`)은 **제품 콘텐츠에서 제외**한다
  (핸드오프 방향 4, `docs/real-video-source-admission.md`). `product-boundary-regression.test.ts`가 이미
  Library 화면에서 선수 리뷰 노출을 금지하고 있으므로 방향이 일치한다.
- 가짜 사용자·팔로워·활동 수치는 만들지 않는다. 다른 사용자의 skeleton 피드는 공개 opt-in 계약이 생기기
  전까지 "예시" 표기로만 mock한다.

## 2. 정보 구조 제안 (방향 A/B/C 공통)

```text
탭 4개: 홈 · 탐색 · [촬영] · 프로필
  홈     지금 할 일 → 내 모션 변화 → skeleton 탐색 카드 → 비교 추천 → 훈련 인사이트
  탐색   익명 skeleton 피드(예시) · 참조 모션(CMU) · 아키타입 · 드릴/챌린지
  촬영   /private-capture (중앙 액션, 로그인 필요)
  프로필 skeleton hero → 핸들·목표·특성 → MOTIONS | PROGRESS | SAVED → 비공개 기록 · 계정
분석   /private-analysis/[id] — 탭이 아니라 프로필/홈에서 drill-down
```

탭이 3→4가 되는 이유는 "분석" 탭이 사용자의 분석이 아니라 선수 콘텐츠였기 때문이다. 탐색이 그 자리를
대신하고, 분석은 사용자의 기록에서 연다. 5탭은 만들지 않는다.

## 3. Phase 1 — 시각 방향 3안

동일한 Profile + Home mock에 세 팔레트를 얹은 비교 페이지를 별도 Artifact로 제공한다(실제 파이프라인이
합성 fixture로 만든 101위상 skeleton을 그대로 재생). 아래는 토큰 값과 트레이드오프의 기록이다.

### A. Graphite / Volt — "performance lab + basketball culture"

| 토큰 | 값 | | 토큰 | 값 |
| --- | --- | --- | --- | --- |
| background | `#0F1012` | | primary / primaryForeground | `#C9F24B` / `#0F1012` |
| surface / elevatedSurface | `#17191D` / `#20242A` | | skeletonPrimary / skeletonSecondary | `#F1F1EC` / `#C9F24B` |
| foreground / mutedForeground | `#F1F1EC` / `#A2A7AF` | | positive / warning / destructive | `#5FD3A0` / `#F2B950` / `#F0685A` |
| border | `#2B3037` | | analysisLow / analysisHigh | `#7C828B` / `#C9F24B` |

서체: display `Archivo` 800 (wide, 대문자 stat 라벨) · body system sans · stat tabular.
장점: skeleton 가시성 최고, 야간 체육관 촬영 맥락과 일치. 리스크: 게이밍/피트니스 트래커 인상, near-black +
acid green은 흔한 AI 생성 룩과 겹침, 앱 전체가 dark-first로 바뀌어 PR #4의 `light` 결정과 충돌, 밝은
코트에서 카메라 화면 전환 시 눈부심.

### B. Ink / Signal Blue — "precision · motion · technology"

| 토큰 | 값 | | 토큰 | 값 |
| --- | --- | --- | --- | --- |
| background | `#0E1219` | | primary / primaryForeground | `#4C9DFF` / `#0E1219` |
| surface / elevatedSurface | `#161C25` / `#1F2733` | | skeletonPrimary / skeletonSecondary | `#FFFFFF` / `#9ED4FF` |
| foreground / mutedForeground | `#EDF1F6` / `#9AA6B6` | | positive / warning / destructive | `#3FD39E` / `#FFB547` / `#FF6B6B` |
| border | `#27303D` | | analysisLow / analysisHigh | `#6F7B8C` / `#4C9DFF` |

서체: display `IBM Plex Sans Condensed` 700 · stat `IBM Plex Mono` · body system sans.
장점: 분석 신뢰감. 리스크: 가장 일반적인 tech 앱 인상 — 셋 중 차별성이 가장 약함. 현재 navy(`#0B1623`)와
가까워 "조금 바꾼" 느낌이 날 수 있음. dark-first 문제는 A와 같음.

### C. Editorial Court — "sports editorial + social product"

| 토큰 | 값 | | 토큰 | 값 |
| --- | --- | --- | --- | --- |
| background | `#F5F4F0` | | primary / primaryForeground | `#D8342A` / `#FFFFFF` |
| surface / elevatedSurface | `#FFFFFF` / `#FFFFFF` | | skeletonPrimary / skeletonSecondary | `#F1F0EB` / `#FF5A48` (어두운 stage 위) |
| foreground / mutedForeground | `#141414` / `#5F6166` | | positive / warning / destructive | `#1E8E5A` / `#B26B00` / `#C4261D` |
| border | `#E3E1DB` | | analysisLow / analysisHigh | `#9A9CA1` / `#D8342A` |
| stage (skeleton 표면) | `#17181B` | | | |

서체: display `Instrument Sans` 700 · 아키타입 한 줄만 `Instrument Serif` italic · body system sans.
장점: content-first 소셜 구조와 가장 잘 맞음, iOS 기본 light·PR #4의 `light`와 일치, 현재 앱이 light라
이행 비용 최소. 리스크: skeleton 대비 — **모든 skeleton 표면은 어두운 stage 타일** 규칙으로 해결.
야간 촬영 화면은 stage 표면을 전면으로 쓰는 예외를 둔다. 붉은 신호색은 현재 orange와 계열이 달라야
하므로 채도 높은 true red(`#D8342A`)로 고정하고, terracotta·orange 계열은 쓰지 않는다.

### 트레이드오프 요약

| 기준 | A Graphite/Volt | B Ink/Signal | C Editorial Court |
| --- | --- | --- | --- |
| skeleton 가시성 | ◎ | ◎ | ○ (stage 규칙으로 ◎) |
| 소셜/피드 가독성 | ○ | ○ | ◎ |
| 현재 코드 대비 이행 비용 | 높음 (dark-first 전환) | 높음 | 낮음 |
| PR #4 `light` 결정과의 관계 | 되돌려야 함 | 되돌려야 함 | 일치 |
| 차별성 | ○ (흔한 dark+lime) | △ | ◎ |
| 카메라/야간 맥락 | ◎ | ◎ | ○ (stage 예외) |

### 추천: **C. Editorial Court + dark stage 규칙**

skeleton을 identity로 만드는 일은 "어두운 앱"이 아니라 "skeleton이 놓이는 표면"의 문제다. C는 피드·프로필·
홈을 밝고 읽기 쉽게 유지하면서 skeleton 표면만 어둡게 두어 A의 장점을 가져온다. 이행 비용이 가장 낮고
PR #4와 충돌하지 않으며, 셋 중 유일하게 "체육관 포스터"와 "피트니스 트래커" 양쪽을 피한다. 소유자가 더
어두운 lab 감각을 원하면 A가 2순위다. B는 권하지 않는다.

## 4. 공통 디자인 시스템 규칙 (방향과 무관)

### 4.1 토큰

`theme.config.js`를 시맨틱 토큰으로 확장: `background surface elevatedSurface foreground mutedForeground
border primary primaryForeground skeletonPrimary skeletonSecondary skeletonDerived stage positive warning
destructive analysisLowConfidence analysisHighConfidence focusRing`. light/dark 두 값을 유지하고, 화면은
`useColors()` 또는 nativewind 클래스만 쓴다. 리터럴 153회를 0으로 줄이는 것이 커밋 2의 완료 조건이다.

### 4.2 타이포그래피

| 역할 | 크기/행간 | 서체 |
| --- | --- | --- |
| display (화면 제목) | 32/38 | 방향별 display face, 700–800 |
| title (섹션) | 22/28 | display face |
| heading (카드 제목) | 17/22 | system sans 600 |
| body | 15/22 | system sans 400 |
| label (대문자 eyebrow) | 12/16, letter-spacing 0.08em | system sans 600 |
| caption | 11/16 | system sans 400 |
| stat | 26/30, tabular-nums | display 또는 mono |

Condensed 계열은 display/stat에만 남긴다. 탭·버튼·본문·설명은 system sans.

### 4.3 radius · spacing

radius `0 / 8 / 14 / 22 / pill`. 카드 14, 시트 22, 칩 pill. 4pt 그리드: 4 8 12 16 20 24 32. 화면 좌우 16,
카드 내부 14–16, 섹션 간격 24. 터치 타깃 최소 44.

### 4.4 skeleton 시각화 규칙

- 관측 관절 12개 = 채운 원 r5, 파생 4개(head·neck·spine·pelvis) = 빈 원 r4 + 가는 뼈. 얼굴·사진 없음.
- 슈팅 팔 3뼈 = `skeletonSecondary`(방향 accent), 나머지 = `skeletonPrimary`. 지면선은 점선.
- 모든 skeleton은 `stage` 표면 위에 그린다(C에서는 어두운 타일, A/B에서는 surface).
- 루프 = 저장된 101위상 40ms/frame(≈4s). `reduceMotion` 시 릴리스 추정 프레임에서 정지 + 수동 스크럽.
  기존 `sequence-viewer` lifecycle 로직을 그대로 쓴다.
- 썸네일·카드 = 릴리스 추정 프레임 정지 이미지. hero만 루프.
- 시점 칩 정면/사선/슈팅 측면, 위상 마커 5개 유지.

### 4.5 선택 · 신뢰도 상태 규칙

- 선택 상태 = `primary` 테두리 2 + 체크, 색만으로 구분하지 않는다. focus ring = `focusRing` 3px outline.
- 신뢰도는 점수가 아니라 **밴드**로: Basic(상한 0.65) → "Basic 대표 스냅샷", High → "High 반복 일치".
  숫자 %는 분석 2층에서만.
- 낮은 신뢰도/재촬영 필요 = 뼈 점선 + 60% 불투명도 + `warning` 필 "재촬영 필요". 높은 신뢰도는 실선 +
  `analysisHighConfidence` 강조. 두 상태는 썸네일 크기에서도 구분돼야 한다.
- 경계 문구 "위상 결합 4D 추정 · 실측 3D 아님"은 분석 1층 하단에 항상 노출.

## 4.6 결정 (2026-09-06) — 방향 A + Instagram 밀도

소유자가 **A Graphite / Volt**를 선택했다. 동시에 비교 mock이 "글씨가 너무 많다"는 지적을 받았다:
처음부터 Instagram 같은 감각을 요구했는데 mock은 kicker·부제·설명문·라벨 칩으로 분석 대시보드처럼
읽혔다. 이 지적은 팔레트보다 우선하는 규칙이 된다.

**텍스트 예산 (홈·탐색·프로필 공통)**

- skeleton stage가 카드 폭을 채운다(정사각형 이상). 글은 stage 위가 아니라 아래 한 줄.
- 카드당 텍스트 최대 1줄. 숫자는 큰 숫자 + 아주 작은 라벨(세션·비교·저장), 문장 없음.
- eyebrow/kicker 줄, 부제, 설명 문단, "예시 · …" 같은 긴 캡션은 쓰지 않는다. 예시 표기는 한 단어.
- 탭바·액션 행은 아이콘만(비교 ⇄, 저장 북마크, 프로필). 라벨은 접근성 label로만 존재한다.
- 경계 문구("위상 결합 4D 추정 · 실측 3D 아님")와 개인정보 안내는 분석 화면 하단과 시트에만 둔다.
- 신뢰도 밴드는 작은 점/배지 하나로: High = volt 점, 재촬영 필요 = 점선 skeleton + warning 점.
- 설명이 필요하면 한 탭 아래(분석 2–3층, 시트)로 보낸다. 망설여지면 글자를 뺀다.

A는 dark-first다. `userInterfaceStyle`은 `dark`로 고정하고 ThemeProvider 기본 scheme도 dark로 둔다
(PR #4의 `light`는 rebase 시 이 결정으로 덮는다). light 토큰 세트는 theme-lab과 향후 확장을 위해
정의만 유지한다.

## 5. 다음 단계

1. ~~소유자가 A/B/C 중 하나를 고른다~~ → A 확정 (2026-09-06).
2. `refactor(ui): centralize visual tokens` — 토큰 확장 + 리터럴 제거, 화면 동작 변경 없음.
3. `feat(ui): redesign bottom navigation` — 4탭 + 중앙 촬영.
4. `feat(profile): make skeleton the profile identity` — 시각 컴포넌트 추출, 데이터 로직 보존.
5. `feat(home): restructure home around motion loop`.
6. `feat(analysis): simplify result hierarchy`.
7. `test(ui): preserve routes accessibility and states`.

각 단계는 iPhone portrait 기준 Expo web export + 렌더 테스트로 검토하고, light/dark·signed-out·empty·
loading/error·low-confidence 상태를 확인한다. 물리 iPhone 검증은 소유자 단계다.
