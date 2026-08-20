# FormPath Basketball — iPhone Interface Design

## 제품 원칙

FormPath Basketball은 특정 선수의 이름이나 초상을 노출하지 않고, 검증된 익명 실제 모션과 사용자의 개인 스켈레톤을 분리해 다룬다. 새 인터페이스는 **iPhone 세로 9:16**, 한 손 조작, Apple Human Interface Guidelines의 명확한 계층을 전제로 하며, Instagram의 직관적인 3개 목적지 구조를 농구 분석 제품에 맞춰 재해석한다. 하단 탐색은 iOS 26에서 native liquid glass를 사용하고, 다른 iOS 버전과 웹에서는 동일한 외형의 반투명 glass fallback을 제공한다.

## 화면 목록

| 탭 | 화면 | 주요 콘텐츠 | 핵심 기능 |
| --- | --- | --- | --- |
| 왼쪽 | **홈** | 오늘의 연습 목표, 최신 분석 상태, 승인 실제 모션 수, 짧은 코칭 카드 | 목표 선택, 최근 분석 재개, 촬영 시작 |
| 중앙 | **모션 스튜디오** | 실제 optical-mocap 익명 3D 스켈레톤, phase scrubber, 다중 각도, source boundary | 재생·회전·확대, 승인 모델 확인, 개인 비교 진입 |
| 오른쪽 | **프로필** | Firebase 계정 상태, 개인 스켈레톤 보관함, 분석 이력, 계정 메뉴 | 이메일 로그인/회원가입, 개인 pose 저장·삭제, 로그아웃 |
| 시트 | **인증 시트** | 이메일, 비밀번호, 로그인/회원가입 전환, 오류·진행 상태 | Firebase Authentication 가입·로그인 |
| 시트 | **업로드·분석 시트** | Side/Front/Oblique 영상 입력, pose 검출 상태, 개인 저장 동의 | 개인 후보 생성과 Firestore 저장 |

## 핵심 사용자 흐름

사용자는 하단의 왼쪽 **홈** 탭에서 오늘의 목표와 검증된 실제 모션 상태를 확인한다. 중앙 **모션 스튜디오**는 앱의 기본 목적지이며, 처음 열었을 때 승인된 익명 optical-mocap 모션을 정면·사선·측면으로 조작할 수 있다. 사용자는 팔로우스루와 릴리스 단계를 직접 scrub해 확인하며, 이 모션이 특정 선수 모델이 아니라 출처가 기록된 익명 실제 3D 데이터임을 알 수 있다.

오른쪽 **프로필**은 계정과 개인 데이터를 한 화면에 모은다. 로그인하지 않은 사용자는 이메일 가입 또는 로그인을 요청받고, 로그인 후에는 본인의 display name, 저장된 개인 스켈레톤, 분석 기록만 보인다. 개인 pose JSON과 metadata는 Firebase Authentication의 UID 아래 Cloud Firestore에 저장하며, Firestore 규칙은 해당 UID의 소유자만 읽기·쓰기·삭제하도록 제한한다.

## 레이아웃 및 상호작용

모든 기본 화면은 콘텐츠가 하단 capsule menu와 겹치지 않도록 넉넉한 bottom inset을 둔다. 하단 메뉴는 화면 폭에서 16pt씩 inset된 떠 있는 pill이며, 세 탭은 **집**, **3D figure**, **프로필** SF Symbol로 표시한다. 중앙 모션 탭은 오렌지 outer ring과 작은 `LIVE MOTION` indicator로 강조한다. 탭 전환은 180–240ms의 작은 scale/opacity 전환으로 제한하고, 선택된 탭은 가벼운 haptic feedback을 준다.

홈은 세로 피드처럼 구성하되 SNS 게시물을 흉내 내지 않는다. 첫 카드에는 오늘의 목표와 즉시 실행 가능한 CTA를, 다음 카드에는 검증 상태와 가장 최근 분석을 배치한다. 모션 스튜디오는 3D 뷰어를 화면 중심에 두고 phase control을 thumb-reach 영역에 배치한다. 프로필은 원형 initials avatar, 계정 상태, private pose collection을 순서대로 보이며, 빈 상태에서는 개인정보·보안 원칙과 첫 분석 CTA를 명확히 제공한다.

## 색상 및 브랜드

| 역할 | 색상 | 사용처 |
| --- | --- | --- |
| Court Navy | `#102C46` | 텍스트·3D stage border·glass outline |
| Mist Background | `#EEF4F8` | 전체 background |
| Arc Orange | `#F97316` | 중앙 모션 탭·주요 CTA·활성 phase |
| Signal Green | `#16A34A` | source 승인·저장 완료 상태 |
| Ice Glass | `rgba(255,255,255,0.72)` | 웹/구형 iOS의 glass fallback |
| Glass Stroke | `rgba(255,255,255,0.92)` | floating menu·card highlight |
| Slate | `#61738A` | 설명·보조 텍스트 |

Liquid glass는 단순한 장식이 아니라 화면 위에 떠 있는 전역 탐색의 깊이를 전달한다. 대비가 필요한 텍스트와 아이콘은 navy 또는 orange를 사용하고, glass container의 alpha는 native effect를 깨뜨리지 않도록 1로 유지한다. 웹과 미지원 OS에서는 blur가 아닌 반투명 흰 surface, 얇은 white stroke, 부드러운 shadow로 동일한 정보 위계를 유지한다.

## Firebase 데이터 모델과 권한 경계

| 경로 | 문서 | 소유자 | 저장 내용 |
| --- | --- | --- | --- |
| `users/{uid}` | 사용자 프로필 | Firebase Auth UID | display name, creation/update time, product preference |
| `users/{uid}/poses/{poseId}` | 개인 스켈레톤 | Firebase Auth UID | private pose JSON, quality JSON, source label, created time |
| `users/{uid}/analyses/{analysisId}` | 개인 분석 이력 | Firebase Auth UID | goal, status, pose reference, created time |
| 앱 번들 | 승인 reference motion | 제품 배포물 | 익명 optical-mocap 모션과 provenance summary; 개인 DB에 저장하지 않음 |

Firebase client configuration은 앱 공개 식별자만 환경 변수로 읽고, privileged service credential은 클라이언트나 repository에 넣지 않는다. Cloud Firestore Rules는 `request.auth.uid == userId`일 때만 해당 UID 경로 접근을 허용하며, 분석 결과와 pose JSON의 크기·필수 field를 검증한다.
