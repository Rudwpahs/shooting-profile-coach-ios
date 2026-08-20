# 실제 선수 영상 재구축 조사 레지스트리

> 이 문서는 제품 화면에 포함하지 않는 내부 소스 조사 기록이다. 아래 선수명·링크는 pose 모델도, 추천 데이터도, 제품 노출 데이터도 아니다.

## 재감사 결론

기존 16개 후보는 단일 시점 또는 서로 다른 슛을 편집한 **비동기 컴필레이션**이다. 따라서 전부 `unapproved_for_3d`로 되돌렸다. 기존의 `ACCEPT` 표기는 실제 선수·슛 장면의 잠정 식별 기록일 뿐, calibrated 3D 승인이 아니다.

| 내부 키 | 기존 영상 후보 | 알려진 촬영 상태 | 새 상태 |
| --- | --- | --- | --- |
| stephen_curry | [slow motion](https://www.youtube.com/watch?v=fG0yA9oBOkg) | 단일 시점 | `unapproved_for_3d` |
| devin_booker | [slow motion 1080p](https://www.youtube.com/watch?v=JGRnvtZLTgQ) | 다중 장면·비동기 | `unapproved_for_3d` |
| kevin_durant | [slow motion](https://www.youtube.com/watch?v=Ug8quL88nRs) | 단일 시점 | `unapproved_for_3d` |
| donovan_mitchell | [slow motion 1080p](https://www.youtube.com/watch?v=FNl48HFXgLQ) | 다중 장면·비동기 | `unapproved_for_3d` |
| anthony_edwards | [slow motion 1080p](https://www.youtube.com/watch?v=AF2AlZ5HZzw) | 다중 장면·비동기 | `unapproved_for_3d` |
| tyrese_maxey | [shooting breakdown](https://www.youtube.com/watch?v=GPUtArsmlwk) | 다중 장면·비동기 | `unapproved_for_3d` |
| luka_doncic | [slow motion 1080p](https://www.youtube.com/watch?v=3sT9Xf_rsyM) | 다중 장면·비동기 | `unapproved_for_3d` |
| jamal_murray | [slow motion 1080p](https://www.youtube.com/watch?v=OhzAd-4ZE3M) | 다중 장면·비동기 | `unapproved_for_3d` |
| jalen_brunson | [form comparison](https://www.youtube.com/watch?v=mY-fwLGor1Y) | 편집 비교 | `unapproved_for_3d` |
| jaylen_brown | [practice shooting](https://www.youtube.com/watch?v=zk5j3ZvzjF4) | 단일 시점 | `unapproved_for_3d` |
| kawhi_leonard | [free throws](https://www.youtube.com/watch?v=e8bawfcsTx0) | 단일 시점 | `unapproved_for_3d` |
| norman_powell | [shooting breakdown](https://www.youtube.com/watch?v=VeNKn-X82hw) | 다중 장면·비동기 | `unapproved_for_3d` |
| deaaron_fox | [slow motion 1080p](https://www.youtube.com/watch?v=6E4tK2F-snI) | 다중 장면·비동기 | `unapproved_for_3d` |
| shai_gilgeous_alexander | [slow motion 1080p](https://www.youtube.com/watch?v=OCdzsQLHfXs) | 단일 시점 | `unapproved_for_3d` |
| lebron_james | [slow motion](https://www.youtube.com/watch?v=8Docgqljzso) | 단일 시점 | `unapproved_for_3d` |
| victor_wembanyama | [pregame routine](https://www.youtube.com/watch?v=-V6aCvcRfNA) | 다중 장면·비동기 | `unapproved_for_3d` |

## 새 소스 탐색 방식

`선수명 + shooting form breakdown`, `선수명 + shooting form slow motion 1080p`, `선수명 + 360 camera shooting`을 각각 조사한다. 조사 결과에서 **360도 덩크 회전**이나 편집된 다각도 컴필레이션은 진정한 360도 카메라·다중 시점 증거로 간주하지 않는다. 예를 들어 [Devin Booker 1080p slow motion](https://www.youtube.com/watch?v=JGRnvtZLTgQ)는 1080p 슬로모션 후보이지만, 공개 설명과 페이지 정보만으로 동기화·보정된 물리적 다중 카메라 촬영은 입증하지 못한다. 따라서 A 등급 단일 시점 상대 pose 후보까지만 가능하다.

새 후보가 보이면 먼저 소유자·해상도·fps·연속 전신 가시성·동일 슛의 camera baseline을 내부 레지스트리에 기록하고, `real-video-source-admission.md`의 C 등급을 통과하기 전에는 어떤 모델도 제품 라이브러리에 추가하지 않는다.

## 새 breakdown 후보 표본 감사

| 후보 | 시각 감사 결과 | 최고 허용 등급 | 제품 조치 |
| --- | --- | --- | --- |
| [Devin Booker Complete Shooting Form Breakdown](https://www.youtube.com/watch?v=I9zmzIx-JMI) | 연속 전신 슛 구간과 발·슈팅 손의 가시성은 확인됐으나, 편집된 컴필레이션이며 동일 슛의 동기화된 물리적 다중 카메라 또는 진정한 360도 원본은 확인되지 않음 | A: 단일 시점 relative pose 후보 | 새 로컬 클립 선별 후에만 개인 후보로 처리; 익명 3D 라이브러리 미포함 |
| [NBA 360 game day shooting footage](https://www.youtube.com/watch?v=Y7TW6XZ_h_0) | equirectangular 진정한 360도 영상이며 연속 전신 슛 구간을 제공하지만, 각 장면이 하나의 360 camera rig에서 촬영되어 물리적 camera baseline이 없음 | B: 전방향 2D relative pose 후보 | 가려짐 감소·프레임 선별에는 활용 가능; metric 3D·익명 3D 라이브러리 미포함 |

이 표본 감사는 새 검색 방식이 단순한 `1080p` 제목을 3D 근거로 오인하지 않도록 확인한 것이다. 현재 승인된 실제 선수 3D 모델 수는 계속 **0개**다.

## 재추출 실행 상태

표본 breakdown 후보의 원본 고해상도 스트림 형식을 조사했으나, 공개 스트리밍 서비스가 자동 원본 접근에 사람 확인을 요구해 로컬 프레임 파일을 합법적·재현 가능하게 확보하지 못했다. 이 상태에서 썸네일·요약·AI 시각 설명만으로 landmark 시퀀스를 만들거나 모델을 승인하지 않는다. 따라서 실제 프레임 pose 추출 단계는 **동기화된 원본 파일 또는 접근이 허가된 source media가 확보될 때까지 보류**한다.

기본 공개 클라이언트와 대체 공개 클라이언트 경로 모두 같은 사람 확인 제한으로 원본 format 목록을 제공하지 않았다. 로그인 쿠키·우회 수단을 사용하거나, 영상 플랫폼의 접근 통제를 회피하지 않는다.
