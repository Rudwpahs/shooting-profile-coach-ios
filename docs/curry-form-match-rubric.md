# Curry source-video form-match rubric

이 rubric은 Curry의 실제 source video에서 추출한 2D/추정 3D analysis를 **자동 보정하고 설명하는 기준**이다. 이는 일반 사용자에게 ‘Curry처럼 쏴야 한다’고 처방하는 코칭이 아니며, ball·rim·camera calibration이 없는 영상으로 성공률이나 실제 관절 각도를 진단하지 않는다.

| 분석 축 | Curry 관련 설명 | 화면에서 확인할 수 있는 proxy | 자동 보정에 쓰는 범위 |
| --- | --- | --- | --- |
| 균형·중심 | Curry는 어깨너비 발과 슈팅발의 작은 전진, 강한 base를 설명한다. | pelvis에서 neck까지의 중심선 흔들림, 발·무릎 좌우 균형 | pelvis를 기준점으로 두고 torso 중심 drift만 완화 |
| 정렬 | Curry는 팔꿈치를 옆으로 벌리지 않고, elbow·wrist가 바스켓 방향으로 이어지도록 설명한다. | shooting shoulder–elbow–wrist chain의 연속성 | shoulder line 재중심화와 elbow/wrist bone-length만 정규화 |
| 한 번의 상승 | Curry의 instruction은 다리·hip에서 힘을 올려 손까지 하나의 motion으로 연결한다고 설명한다. [2] | 딥→상승→릴리스의 오른손 높이 상승 순서 | phase 순서는 보존하고 phase 사이 손목 궤적의 급격한 꺾임만 제한 |
| 릴리스·팔로우스루 | Curry는 손가락으로 밀고 gooseneck 모양의 팔로우스루를 유지한다고 설명한다. [1] | 릴리스 후 right wrist가 right shoulder보다 높고 arm extension이 유지되는지 | release·follow-through에서 오른손/팔꿈치의 연속성만 보정; ball spin은 추정하지 않음 |
| 일관성 | Curry는 shot이 손을 떠나기 전 동작을 같은 방식으로 반복한다고 설명된다. | 두 source의 같은 named shot phase에서 관절 순서가 보존되는지 | front/side를 same-phase로만 결합; same-frame triangulation으로 오인하지 않음 |

## Form-match 설명의 제한

앱의 `form match`는 위 proxy와 source phase 순서의 일치 여부를 말한다. 실제 Curry의 exact 3D pose, ball trajectory, 손가락 접촉, shot make/miss, 부상 위험을 판단하지 않는다. fluid player의 intermediate pose는 source phase 사이의 display interpolation이다. fixed-F와 reprojection gate를 통과하지 않은 source는 optical/calibrated actual 3D 및 recommendation library에 들어갈 수 없다.

## References

[1] [Stephen Curry shooting tips interview — Forbes](https://www.forbes.com/sites/hunteratkins/2014/08/26/shooting-tips-from-n-b-a-all-star-stephen-curry-2/)

[2] [Stephen Curry’s stance, alignment, and mechanics — MasterClass](https://www.masterclass.com/articles/how-to-shoot-a-basketball-with-steph-curry)

[3] [Coach analysis of Curry’s repeatable shot mechanics — The Guardian](https://www.theguardian.com/sport/article/2024/jul/24/midas-touch-how-to-shoot-like-steph-curry-paris-olympics-2024)

[4] [Biomechanical adjustments of basketball jump shots — Journal of Human Kinetics](https://pmc.ncbi.nlm.nih.gov/articles/PMC9465762/)
