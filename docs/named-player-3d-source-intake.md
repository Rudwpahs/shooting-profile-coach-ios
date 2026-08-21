# Curry·Paul George 3D source intake 판정

## 3D로 만들 수 있는 최소 조건

두 선수의 실제 3D skeleton은 아래 네 조건을 **같이** 만족하는 source만 사용한다.

| 조건 | 필요한 이유 |
| --- | --- |
| 같은 한 번의 슛 | 서로 다른 슛을 합치면 관절 위치가 틀어짐 |
| 서로 다른 두 고정 camera | 깊이를 계산하려면 다른 각도가 필요함 |
| 두 camera의 시간 일치와 camera 정보 | 같은 순간인지 확인하고 정확한 3D를 계산하기 위해 필요함 |
| 재사용 허가 | 상용 앱에 source 또는 그 결과를 넣기 위해 필요함 |

## 현재 공개 source 판정

| 선수 | 확인한 source | 판정 | 이유 |
| --- | --- | --- | --- |
| Stephen Curry | Warriors의 MOCAP Analytics 소개 페이지 | 3D 입력 불가 | shot-data 시각화·소개 페이지이며 raw skeleton, 여러 camera video, camera 정보, 재사용 허가를 제공하지 않음 |
| Paul George | Clippers의 Phantom Cam 편집 영상 | 3D 입력 불가 | 한 편의 편집 영상일 뿐, 같은 슛의 동기화된 여러 camera 원본·camera 정보·상용 재사용 허가가 없음 |
| Curry·Paul George 기존 사용자 제공 영상 | 실제 영상에서 추출한 2D skeleton | 2D 검토로 유지 | 서로 같은 슛이 아니거나 camera 정보가 없어 3D로 합치면 안 됨 |

추가로 ‘every angle’, ‘second angle’, ‘phantom camera’로 공개된 Curry·Paul George 영상 후보를 확인했다. 이들은 여러 각도의 **편집된 재생 영상**일 수는 있지만, 3D 계산에 필요한 원본 camera 파일, 고정 camera 위치, 정확한 시간 일치 정보, 상용 재사용 허가를 제공하지 않는다. 따라서 후보 수는 **0개**다.

## 현재 결정

공개 영상이나 홍보 콘텐츠를 계속 모아도 위 네 조건을 충족하지 않으면 3D 모델로 바꾸지 않는다. 현재 앱에는 Curry·Paul George의 2D skeleton만 유지하고, 3D는 `같은 슛 + 두 고정 camera + 시간 일치 + 재사용 허가`가 확인된 자료가 생길 때만 시작한다.

## Sources

1. [Golden State Warriors — Stephen Curry Player Spotlight](https://www.nba.com/warriors/mocap/spotlight/stephencurry), accessed 2026-08-21.
2. [L.A. Clippers — Paul George Best of NBA's Phantom Cam](https://www.facebook.com/LAClippers/videos/paul-george-best-of-nbas-phantom-cam/836722466854580/), accessed 2026-08-21.
