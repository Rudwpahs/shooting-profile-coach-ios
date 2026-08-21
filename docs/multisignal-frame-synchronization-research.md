# Multi-signal Frame Synchronization Research Notes

## 적용할 원칙

두 view의 동일 순간은 single release anchor만으로 확정하지 않는다. landmark visibility를 가중치로 쓰고, release-pinned motion signature와 global epipolar residual을 함께 최소화하는 monotonic frame path를 찾는다. 선택된 path는 reconstruction input이 아니라 **fixed-F 재검증 전 correspondence hypothesis**다.

| 근거 | 적용 결정 |
| --- | --- |
| Zhang et al.은 pose estimator output으로 camera pair의 epipolar-distance energy를 최소화해 temporal displacement를 찾고, pose confidence를 energy에 반영한다. | 33 landmark의 visibility를 weight로 써 low-confidence joint를 matcher cost에서 약화한다. |
| Takahashi et al.은 unsynchronized·uncalibrated multi-view에서 human joint projection을 common reference point로 사용하되, noisy detection이 camera estimation을 불안정하게 만들 수 있음을 지적한다. | matching path가 있어도 global fixed-F 및 downstream reprojection gate가 통과하기 전에는 3D candidate를 생성하지 않는다. |
| 두 연구 모두 temporal alignment와 camera geometry를 연계하지만, synchronized same-event observation이 geometry의 전제다. | 다른 game/event인 Paul George clips는 matcher를 실행하지 않고 pre-pair reject로 유지한다. |

## 구현할 cost

`cost(i,j) = motionSignatureDistance(i,j) + λ · confidenceWeightedEpipolarResidual(i,j)`으로 계산한다. motion signature는 source-view dependent 2D 좌표 자체가 아니라 wrist/elbow/hip의 phase-normalized speed·elbow extension·ball-near-wrist proxy를 사용한다. epipolar residual은 provisional F를 반복적으로 robust fitting하여 계산한다. release pair는 hard anchor로 고정하고 DTW path는 monotonic one-to-one correspondence만 허용한다.

## Sources

1. Zhang Z, Wang C, Qin W. [Semantically Synchronizing Multiple-Camera Systems with Human Pose Estimation](https://pmc.ncbi.nlm.nih.gov/articles/PMC8038137/). *Sensors*. 2021;21(7):2464. https://doi.org/10.3390/s21072464
2. Takahashi K, Mikami D, Isogawa M, Kimata M. [Human Pose as Calibration Pattern; 3D Human Pose Estimation with Multiple Unsynchronized and Uncalibrated Cameras](https://openaccess.thecvf.com/content_cvpr_2018_workshops/papers/w34/Takahashi_Human_Pose_As_CVPR_2018_paper.pdf). CVPR Workshops, 2018.
