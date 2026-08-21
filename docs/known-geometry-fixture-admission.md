# Known-geometry multi-view fixture — access 및 product admission 판정

## 확인 범위

FormPath Basketball은 상업 목적의 product library에 실제 사람이 수행한 검증 3D motion만 넣는다. 따라서 알고리즘 검증용 fixture도 **소스 파일의 제공 조건**과 **product asset 사용 가능성**을 별도로 판정한다. 2026-08-21에 SportCenter와 BASKET-Multiview의 공식 access 페이지·license를 재확인했다.

| Dataset | 공식 제공 내용 | 공식 access 조건 | 상업 product asset | 현 단계 pipeline 역할 |
| --- | --- | --- | --- | --- |
| SportCenter Multi-View Human Pose | 실제 amateur basketball 경기, 8 fixed·synchronized·calibrated camera, 약 370,000 images 및 일부 2D/3D pose | Google Drive download가 제공되나, 공식 page는 **research purposes**에 한해 free use라고 명시 | 불가 — 별도 commercial permission 없이는 player motion·image·annotation을 product에 포함하지 않음 | commercial license 또는 written permission 전까지 local fixture download·execution 보류 |
| BASKET-Multiview | Unreal Engine 기반 synthetic basketball scenes, 89 views, camera parameters, depth, mask, animation·SMPL annotations | institutional/company email registration과 license agreement 필요 | 불가 — official license는 **CC BY-NC 4.0** | commercial pipeline regression·product test data로도 자동 도입하지 않음; commercial permission이 있어야 실행 재개 |

## 결정

SportCenter는 geometry 조건 자체는 현재 pipeline 검증에 유용하지만, 공개 상태가 상업 product use permission을 뜻하지 않는다. BASKET-Multiview는 known calibration과 depth ground truth가 특히 유용하나, **NonCommercial** license를 확인했으므로 FormPath의 상업화 실행 경로에서 제외한다. 양 dataset은 product asset과 training material에 포함하지 않으며, 파일을 다운로드·cache·redistribute하지 않는다.

따라서 known-geometry regression의 상업 안전 경로는 다음으로 한정한다.

1. 해당 dataset 권리자에게 별도 상업 permission을 받아 license record로 등록한다.
2. 또는 동의받은 참가자의 fixed, synchronized, calibrated 2-camera capture에서 동일한 geometry regression fixture를 생성한다.
3. 실제 product 3D library admission은 CMU처럼 documented commercial-use 조건을 만족하는 raw marker motion 또는 위 자체 capture의 admission을 통과한 sequence에만 허용한다.

## Sources

1. [EPFL CVLAB — SportCenter Dataset](https://www.epfl.ch/labs/cvlab/data/sportcenter-dataset/), accessed 2026-08-21.
2. [BASKET-Multiview Dataset](https://humansensinglab.github.io/basket-multiview/data.html), accessed 2026-08-21.
3. [BASKET-Multiview License — CC BY-NC 4.0](https://humansensinglab.github.io/basket-multiview/static/docs/LICENSE.pdf), accessed 2026-08-21.
