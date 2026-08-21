# Paul George source-video form-match rubric

이 rubric은 local All-Star source의 2D/화면용 추정 3D motion을 **설명하고 보정 상태를 검토**하기 위한 기준이다. 이 분석은 Paul George의 실제 3D 관절값, 경기력, 부상 위험을 판정하지 않으며, 한 camera source를 상용 recommendation input으로 승격하지 않는다.

| 분석 축 | Paul George 관련 근거 | local source에서 확인할 proxy | 현재 결과 |
| --- | --- | --- | --- |
| 한 번의 상승 | George는 range가 다르더라도 ‘same shot’과 `one motion`을 강조했다. [1] | 준비→딥→상승→릴리스→팔로우스루의 연속 순서 | 확인됨; 0·355·516·645·742ms 5단계 |
| 하체 기여 | George는 shot이 팔보다 다리에서 더 시작된다고 설명했다. [1] | dip에서 knee/hip loading 후 rise에서 extension | source phase 순서만 확인; force는 확인 불가 |
| 균형·착지 | Coach Nick 분석을 인용한 보도는 fluid sway, shoulder relaxation, balanced landing을 consistency 단서로 설명한다. [2] | pelvis·torso drift와 bilateral landing posture | source가 짧고 단일 side/front-side view라 제한적 검토 |
| 오른손 release | local source independent visual audit은 East #13 Paul George의 right-hand release를 확인했다. | release·follow-through의 right shoulder–elbow–wrist chain | video audit override로 right hand 적용 |
| 손목 높이 | 릴리스 후 wrist가 shoulder 위에 유지되는 것은 source에서 볼 수 있는 follow-through proxy다. | 742ms follow-through에서 right wrist versus shoulder y | 확인됨: wrist y=3.021002, shoulder y=1.754909 |

## 확인할 수 없는 항목

공의 정확한 trajectory, fingertip contact, rim alignment, metric joint angle, physical depth, landing force는 local landmark source에 없다. `unavailable`로 표시하며, 자동 보정으로 채우지 않는다.

## Boundary

이 output은 `monocular_relative_pose_not_metric_3d` 및 analysis-only state다. 공개 YouTube compilation들은 view 다양성의 qualitative evidence로만 기록됐고, raw frames·same-shot synchronized pair·camera calibration을 제공하지 않아 local source와 triangulate하지 않는다.

## References

[1] [Paul George’s shooting workout explanation, quoted from Podcast P — The Old Man Game Newsletter](https://omgnewsletter.substack.com/p/heres-how-paul-george-became-a-fantastic)

[2] [Paul George’s balance and follow-through consistency, citing Coach Nick analysis — 8 Points, 9 Seconds](https://8points9seconds.com/2014/04/01/paul-george-struggling/)
