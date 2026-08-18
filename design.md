# FormPath Basketball — iPhone Interface Design

## 제품 원칙

FormPath Basketball는 선수를 식별하거나 특정 선수의 폼을 복제하도록 권하지 않는다. 앱은 사용자의 촬영 조건, 현재 슛 특성, 원하는 변화와 연습 목표를 익명화된 reference archetype에 비교해 다음 연습을 추천한다. 모든 화면은 **iPhone 세로 9:16**, 한 손 조작, Apple Human Interface Guidelines의 계층형 탐색·large title·SF Symbol·명확한 상태 피드백을 기준으로 설계한다.

## 화면 목록

| 화면 | 주요 콘텐츠 | 핵심 기능 |
|---|---|---|
| 시작 / 홈 | 오늘의 목표, 현재 프로필 상태, 최신 추천, 다음 촬영 CTA | 분석 시작, 최근 결과 열기, 연습 시작 |
| 초기 설정 | 레벨, 주 목표, 선호 슛 유형, 촬영 환경 | 로컬 사용자 목표 프로필 생성 |
| 촬영 준비 | 전신·공·조명·고정 카메라 체크리스트, 단일/다중 시점 안내 | 촬영 조건 확인, 분석 방식 선택 |
| 특성 입력 / 평가 | 사용자 입력 또는 향후 영상 분석에서 얻을 release·arc·tempo·lower-body drive 특성 | 실명 없이 개인 슛 특성 기록 |
| 추천 결과 | 최우선 archetype, 적합도, 공통 특성, 개선 우선순위, 신뢰도 | 다음 연습 저장, 다른 목표로 재추천 |
| Archetype 라이브러리 | 예: Compact Set, High Release, Rhythm Drive, One-Motion Flow | 특성·적합 조건·주의점 열람; 선수 이름 노출 금지 |
| 연습 세션 | 1~3개 구체적인 drill, 세트·반복·체크 포인트 | 완료 기록, 다음 세션으로 이동 |
| 데이터 상태 | reference library 버전, 검증된 archetype 수, 로컬 데이터 안내 | 데이터 출처·품질 경계 확인 |
| 설정 | 목표 수정, 로컬 데이터 초기화, 개인정보 안내 | 사용자가 자신의 기기 데이터를 제어 |

## 핵심 사용자 흐름

사용자는 처음 실행할 때 레벨과 목표를 선택한다. 홈은 복잡한 대시보드 대신 오늘의 단일 다음 행동을 가장 위에 보여 준다. 사용자가 `내 특성 평가`를 탭하면 촬영 조건을 확인한 뒤, 초기 버전에서는 안전한 로컬 입력으로 현재 슛 특성을 기록한다. 이후 앱은 검증된 archetype에만 비교하여 최우선 reference와 보완할 특성을 설명하고, 바로 실행할 수 있는 연습 세션 하나를 제안한다.

사용자가 라이브러리에서 archetype을 선택하면 이름·체형·선수 비교가 아니라 release height, tempo, elbow extension, lower-body drive 같은 특성과 권장 대상·주의점을 확인한다. 데이터 상태 화면은 추천에 쓰인 reference가 검증된 데이터에 한정되는지와 분석 경계를 명시해 상업 제품에서 중요한 신뢰도를 유지한다.

## 레이아웃 및 상호작용

홈은 large title 아래에 오늘의 recommendation card를 배치하고, 손가락이 닿기 쉬운 하단 영역에 주 CTA를 둔다. 하단 탭은 `홈`, `평가`, `라이브러리`, `설정`의 네 개로 제한한다. 결과 화면은 상단에 하나의 recommendation score, 중간에는 2~3개의 특성 비교 bar, 하단에는 `연습 시작` 버튼을 둔다. 수치만으로 코칭하지 않고, 각 수치 아래에 그 의미와 행동 지시를 한 문장으로 표시한다.

버튼 탭에는 가벼운 haptic feedback을 사용하며, 추천이 완료되면 success notification feedback을 제공한다. 추천 데이터가 아직 충분히 검증되지 않았을 때는 추정 수치를 채워 넣지 않고, `아직 추천을 만들 만큼 검증된 reference가 없습니다`라는 명시적 상태와 다음 행동을 보여 준다.

## 색상 및 브랜드

| 역할 | 색상 | 사용처 |
|---|---|---|
| Court Navy | `#0B1F33` | 앱 배경, 최상위 navigation 영역 |
| Court Sand | `#F7F2E8` | 밝은 surface, 카드 배경 |
| Arc Orange | `#F05A28` | 주요 CTA, release·추천 강조 |
| Signal Teal | `#1F8A7A` | 검증 상태, 완료된 연습 |
| Steel Blue | `#54708C` | 보조 지표, 설명 텍스트 |
| Mist | `#D8E1E8` | 경계선과 비활성 요소 |

전체 표현은 코트의 절제된 네이비와 우드톤 surface를 기반으로 하며, 오렌지는 하나의 주요 행동 또는 핵심 변화만 강조하는 데 사용한다. SF Symbols는 `target`, `figure.basketball`, `chart.line.uptrend.xyaxis`, `book.closed`, `gearshape` 계열을 사용해 iOS의 익숙한 시각 언어를 유지한다.
