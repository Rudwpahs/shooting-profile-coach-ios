# 16개 원본 슛폼 영상 재감사 기록

## 범위와 경계

이 기록은 런타임 익명 모델을 평가하기 위한 내부 감사 자료다. 앱에는 선수 이름·원본 URL·실명 식별자를 노출하지 않는다. 모든 원본은 **metric 3D 또는 개인별 3D 시퀀스**로 승인되지 않았다.

## 연속 전신 슛 시퀀스 재검토

| 익명 모션 | 재검토 결과 | 핵심 사유 |
| --- | --- | --- |
| motion-01 | 수동 클립 분리 필요 | 측면 전신 점프슛이 있으나 컷과 통행 인물 간섭이 있음 |
| motion-02 | 직접 시퀀스 사용 거절 | 공 비행 장면으로 잘려 연속 전신 시퀀스가 끊김 |
| motion-03 | 직접 시퀀스 사용 거절 | 릴리스 단계에서 카메라 컷 발생 |
| motion-04 | 수동 클립 분리 필요 | 복수 슬로모션 슛 클립을 개별 분리해야 함 |
| motion-05 | 수동 클립 분리 필요 | 비슛 장면이 섞인 복수 슬로모션 클립 |
| motion-06 | 직접 시퀀스 사용 거절 | 편집·각도 전환이 대부분의 슛을 분절 |
| motion-07 | 수동 클립 분리 필요 | 여러 각도의 고품질 전신 클립을 개별 분리해야 함 |
| motion-08 | 수동 클립 분리 필요 | 슬로모션 슛 컴필레이션으로 개별 분리 필요 |
| motion-09 | 직접 시퀀스 사용 거절 | 하이라이트·게임 엔진 장면과 잦은 컷이 혼재 |
| motion-10 | 수동 클립 분리 필요 | 고정 시점 슛은 있으나 전경 가림이 잦음 |
| motion-11 | 직접 시퀀스 사용 거절 | 자유투 중심이며 전신 점프슛 연속 시퀀스가 아님 |
| motion-12 | 수동 클립 분리 필요 | 연속 전신 슛은 있으나 컷·인트로·아웃트로가 존재 |
| motion-13 | 직접 시퀀스 사용 거절 | 미드슛 컷, 줌, 하체 가림이 반복됨 |
| motion-14 | 수동 클립 분리 필요 | 슬로모션 리플레이별 개별 분리가 필요 |
| motion-15 | 수동 클립 분리 필요 | 바스켓 클로즈업·비슛 장면이 혼재 |
| motion-16 | 수동 클립 분리 필요 | 컷·전환·시점 변경이 잦아 개별 연속 구간 분리가 필요 |

## 제품 결정

모든 모델은 원본 영상 프레임의 3D 복제가 아니라, 원본 영상의 집계 관절 지표를 보수적으로 압축한 **생체역학 참조 애니메이션**으로 전환한다. 직접 시퀀스 사용이 거절된 모델은 나중에 새로운 연속 전신 클립을 확보하기 전까지 원본 영상 기반의 움직임 모델로 승격하지 않는다.

## 생체역학 참조

고속 다중 카메라를 이용한 점프슛 연구는 촬영 동기화·시간 정규화·관절 연속 데이터가 필요함을 보여준다. 또한 장거리 슛에서는 준비 구간의 무릎·고관절 굴곡과 릴리스 변수가 달라질 수 있다. [1] [2] [3]

## 참고문헌

[1] [Li et al., *Arm Joint Coordination of Collegiate Basketball Athletes and Recreational Players when Shooting behind the 3-Point Line*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12121896/)

[2] [Cabarkapa et al., *Impact of Distance and Proficiency on Shooting Kinematics in Professional Male Basketball Players*](https://pmc.ncbi.nlm.nih.gov/articles/PMC9590067/)

[3] [Cabarkapa et al., *Kinematic Differences Based on Shooting Proficiency and Distance in Female Basketball Players*](https://www.mdpi.com/2411-5142/8/3/129)
