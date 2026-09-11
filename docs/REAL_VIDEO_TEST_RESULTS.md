# Real-video end-to-end test — two offline MP4 pairs

Date: 2026-09-11 · Branch: `work/claude-real-video-e2e` · Base: `feat/p1-real-video-validation` @ `aaee15c`

Two subjects, one front clip and one side clip each, were put through the existing production
path: MP4 → offline pose extraction → `LandmarkSequenceV2` → per-view validation → phase anchor
detection → cross-view alignment → representative reconstruction → quality gates → derived report.
The authoritative command for both subjects is `pnpm eval:two-view`; its two derived reports are
committed beside this file.

**No production threshold was changed.** Both subjects end at `recapture_required`, which is a valid
real-video outcome, and the reasons are footage problems rather than code defects. The one code
change is a regression test that pins the reason code both side clips produced.

## 1. Executive summary

| | Subject A (black) | Subject B (white) |
| --- | --- | --- |
| Reached | `MP4 → extraction → LandmarkSequenceV2 → per-view validation` | `MP4 → extraction → LandmarkSequenceV2 → per-view validation` |
| Final status | `recapture_required` | `recapture_required` |
| Final reason | `attempt_set_invalid` (side clip fails per-view quality) | `attempt_set_invalid` (side clip fails per-view quality) |
| Representative 4D generated | **NO** | **NO** |
| Front clip phase detection | failed `missing_follow_through` | failed `missing_rise` |
| Side clip phase detection | failed `invalid_phase_observation` | failed `invalid_phase_observation` |

Neither pair reached cross-view alignment or reconstruction. Both stopped earlier, at the per-view
gate, because the side clip's quality verdict is `low_critical_joint_coverage`.

## 2. Stage-by-stage

PASS/FAIL with the number that decided it.

| Stage | Subject A | Subject B |
| --- | --- | --- |
| Decode | PASS — front 106 frames / side 133, 30 fps CFR, 512×910, 3533 / 4433 ms | PASS — front 89 / side 103, 30 fps CFR, 512×910, 2967 / 3433 ms |
| Pose extraction | PASS — locator 53/53 and 67/67 detected (ratio 1.000); output 68/68 and 82/82 (ratio 1.000) | PASS — locator 45/45 and 52/52; output 60/60 and 67/67 (ratio 1.000) |
| `LandmarkSequenceV2` | PASS both clips — accepted by `parseLandmarkSequenceV2` including its recomputed quality verdict | PASS both clips |
| Per-view validation | front PASS; **side FAIL** `low_critical_joint_coverage` (landmark 16 coverage 0.183 vs 0.85 required) | front PASS; **side FAIL** `low_critical_joint_coverage` (landmark 16 coverage 0.612 vs 0.85 required) |
| Phase detection | front FAIL `missing_follow_through`; side FAIL `invalid_phase_observation` | front FAIL `missing_rise`; side FAIL `invalid_phase_observation` |
| Cross-view alignment | NOT REACHED | NOT REACHED |
| Reconstruction | NOT REACHED | NOT REACHED |
| Quality gate | FAIL — pipeline `attempt_set_invalid`, affected `shooting_side-0` | FAIL — pipeline `attempt_set_invalid`, affected `shooting_side-0` |
| Evaluation report | PASS — written and accepted by the raw-evidence guard | PASS — written and accepted by the raw-evidence guard |

## 3. Metrics

Values the pipeline never computed are `not reached`, not estimated.

| Metric | A front | A side | B front | B side |
| --- | --- | --- | --- | --- |
| Usable (detected) frames | 68 | 82 | 60 | 67 |
| Accepted-frame ratio | 1.000 | 1.000 | 1.000 | 1.000 |
| Median required-joint visibility | 0.9887 | 0.9860 | 0.9887 | 0.9906 |
| Lower-decile required-joint visibility | 0.8173 | 0.2619 | 0.8727 | 0.5305 |
| Worst critical-joint coverage | 1.000 (all ten) | **0.183** (landmark 16) | 1.000 (all ten) | **0.612** (landmark 16) |
| Person ROI (px) | 217×618 at (176,135) | 195×603 at (164,163) | 264×446 at (158,340) | 357×595 at (56,162) |
| Release proxy | 3333 ms | 3000 ms | 333 ms | 1133 ms |
| Phase anchors | none (4 of 5 found) | none | none (2 of 5 found) | none |
| Extraction time | 5622 ms | 5900 ms | 4371 ms | 4186 ms |

| Metric | Subject A | Subject B |
| --- | --- | --- |
| Cross-view anchor delta | not reached | not reached |
| Phase interval RMSE | not reached | not reached |
| Alignment confidence | not reached | not reached |
| Representative confidence | not reached | not reached |
| Bone-length drift | not reached | not reached |
| Discontinuity count | not reached | not reached |
| Downstream pipeline time | 2.96 ms | 4.79 ms |

## 4. Shooting hand — verified from the footage, not the filenames

**Both subjects shoot right-handed.** In each front clip the subject faces the camera, confirmed by
the right shoulder sitting at the smaller image x, so the extractor's anatomical left/right is
reliable there. Three independent signals agree:

| Signal (front clip, at peak wrist elevation) | Subject A | Subject B |
| --- | --- | --- |
| Held elevation after the peak (higher = shooting hand) | right 0.47 vs left 0.46 | right 0.89 vs left 0.77 |
| Wrist visibility across the clip | right 0.97 vs left 0.83 | right 0.98 vs left 0.83 |
| Wrist x relative to the shoulder midline | right −0.031 (right-shoulder side) | right −0.016 (right-shoulder side) |

The side clips cannot settle handedness on their own: in profile both arms project onto nearly the
same place (mean shoulder separation 0.032 and 0.045, against 0.127 and 0.086 in front), and the far
arm is occluded.

## 5. What actually broke

### 5.1 The side clips are filmed from the non-shooting side — data, not code

Both subjects shoot right-handed, but in both side clips the **left** arm is the near-camera arm
(wrist visibility median 0.982 and 0.986) and the **right** arm is occluded (median 0.271 and
0.590). The phase detector tracks the shooting-side wrist and elbow, so it stops on the first frame
whose shooting-side landmark is below the 0.5 observation floor:

| | frames below floor | landmark 16 (right wrist) | landmark 14 (right elbow) |
| --- | --- | --- | --- |
| A side | 76 of 82 | 67 frames | 9 frames |
| B side | 40 of 67 | 26 frames | 14 frames |

Evidence it is the footage: the same clips relabelled `shootingHand: left` clear the visibility gate
entirely and run on to later stages (A side reaches `missing_release_proxy`, B side reaches
`missing_dip`), which is only possible because the left arm is the visible one. Relabelling was a
diagnostic probe; it contradicts the handedness evidence in section 4 and was not used for any
reported result.

**Fix: refilm the side clip from the subject's right side.**

### 5.2 Subject B's front clip starts mid-shot — data, with a detector limitation behind it

Peak wrist elevation is at 433 ms of a 2967 ms clip, so the ready and dip phases happened before
recording started. The detector then takes the **global** deepest body-down excursion, which lands
at 2600 ms (frame 54 of 60) — a later, deeper crouch — leaving 5 frames and a best post-dip rise of
0.043 against the 0.10 required, hence `missing_rise`.

The footage is the proximate cause. The contributing design limitation is that the deepest-dip
search is global and does not require that a complete shot follow the dip it picks. Changing that
would alter detection behaviour on every clip, so it is recorded as a recommendation, not applied.

**Fix: refilm with roughly a second of set-up before the dip.**

### 5.3 Subject A's front clip has no held follow-through — data meeting an unvalidated default

The detector finds four of five anchors: ready 1267 ms, dip 1667 ms, rise 1933 ms, release 2200 ms
at 1.230 body scales/s. Follow-through needs a frame at least 120 ms after release whose wrist has
dropped no more than 0.15 body scales. The measured drop is 0.110 at 67 ms and 0.196 at 133 ms, so
the wrist crosses the 0.15 limit at about 98 ms — before the 120 ms minimum opens.

This is not a sampling artifact: the crossing is earlier than the minimum elapsed time, so no frame
rate would place a sample inside the window. The shooter's wrist descends immediately instead of
holding. `minimumPhaseFollowThroughElapsedMs` (120) and `maximumFollowThroughWristDropBodyScales`
(0.15) are declared unvalidated engineering defaults; whether a shot like this should be admitted is
an owner decision, and neither value was touched here.

### 5.4 The release proxy can land far from the real release — robustness observation

The release proxy is the timestamp of the strongest locator wrist/elbow motion. For A front it is
3333 ms while the real release is 2200 ms, 1.1 s late, because a post-shot tracking excursion
outranks the shot itself. The proxy centres the 30 fps dense sampling window, so that window was
spent on 2533–3533 ms and the real release was sampled at 15 fps.

It did not cause A's failure (5.3 fails at any frame rate), and it did not trip the
`critical_phase_gap` quality check, but a proxy that can miss by a second is worth hardening.

### 5.5 The critical-joint gate demands both wrists in a view that occludes one

`CRITICAL_LANDMARK_INDICES` requires 85 % coverage on both wrists (15 and 16) for every view,
including `shooting_side`. A genuine side view occludes whichever arm is further from the camera.
Here the near wrist reached 1.000 coverage and the far wrist 0.183 and 0.612. Filming from the
correct side moves the problem to the other wrist rather than removing it, so a Basic 1+1 session
may fail this gate on well-shot footage. Flagged for the owner; not changed.

## 6. Extraction method and its known differences from the native path

Method: **`offline_adapter`**, not `native_production`. The iOS Expo module cannot run on this
Windows machine, so `scripts/extract-offline-landmark-sequence-v2.py` bridges MP4 into the frozen
contract and the existing production code does everything downstream.

The adapter deliberately mirrors `FormpathPoseModule.swift` and `PoseSamplingPolicy.swift`: it loads
**the same `modules/formpath-pose/ios/Resources/pose_landmarker_full.task` the app ships**, with the
same `numPoses = 1` and 0.55 / 0.55 / 0.50 confidences; it runs the same full-frame 15 fps locator
pass, the same stable-person-ROI derivation, the same release proxy, and the same merged 15 fps
coarse plus 30 fps dense output pass on the cropped ROI; and it reproduces the attempt bookkeeping,
duplicate-timestamp rejection, and quality-reason computation. That the production
`parseLandmarkSequenceV2` accepted all four sequences — including its independent recomputation of
`quality.passed` and `quality.reasons` — is the evidence that the contract is honoured.

Differences that must not be glossed over:

| | Native (iPhone) | This adapter |
| --- | --- | --- |
| Decoder | `AVAssetImageGenerator`, `appliesPreferredTrackTransform`, zero tolerance | OpenCV/FFmpeg full decode, frame at or before the requested time |
| Orientation | applies the track's preferred transform | the four clips report orientation 0, so no rotation was applied; a rotated clip would need handling |
| MediaPipe runtime | `MediaPipeTasksVision` 0.10.21 (iOS) | `mediapipe` 1.0.1 (Python), identical `.task` weights |
| Image path | `CGImage` → `UIImage` → `MPImage` | BGR frame → RGB `mp.Image` |

Coordinate meaning and joint mapping are unchanged: the 33-landmark MediaPipe topology with no
remapping, x/y normalized to the image actually submitted, image-relative z carried but never used
as depth, visibility in [0, 1]. Restoration from the crop to upright-source normalized coordinates
reproduces `restoreSourcePoint` for rotation 0, unmirrored, full content rect.

**This is local engineering evidence about the code path. It is not native-iPhone extraction
evidence, and external MP4 remains `library_source_not_admissible` for release provenance.**

## 7. Effect on the `real_video_fixture_unavailable` blocker

**Partially removed.** What is now demonstrated with real footage rather than synthetic fixtures:
decode, pose extraction, contract validation, per-view quality gating, and phase anchor detection
all execute on real shooting video and produce stable, specific reason codes. Cross-view alignment,
reconstruction, uncertainty and the representative 4D output are **still unexercised on real
footage**, because no pair got past the per-view gate.

The blocker stays in place for release purposes. Clearing it needs an app-internal iPhone capture
with a correctly-sided shooting-side clip, per `docs/real-video-validation-runbook.md`.

## 8. Next capture, to get further

1. Film the side clip from the subject's **right** side, framing the whole body.
2. Start recording about a second before the dip and keep recording about a second past the release.
3. Ask for a held follow-through.

With those three corrections the same commands re-run unchanged and the pipeline should reach
cross-view alignment, which is the next unexercised stage.

## 9. Reproducing

Raw media and raw landmarks stay outside the repository. The adapter writes its landmark JSON to a
path you choose; keep it in a private directory such as a gitignored `.private/`.

```bash
python scripts/extract-offline-landmark-sequence-v2.py \
  --video <private>/front.mp4 \
  --model modules/formpath-pose/ios/Resources/pose_landmarker_full.task \
  --view front --hand right --take-index 0 \
  --output <private>/front.json --diagnostics <private>/front-diagnostics.json
```

```bash
pnpm eval:two-view --mode basic_1_plus_1 --hand right --source internal_test_capture \
  --front <private>/front.json --side <private>/side.json \
  --output docs/evaluation/two-view-evaluation-report.offline-real-video-subject-a.json
```

Requires Python 3.11 with `mediapipe` and `opencv-python`. The CLI exits 3 on
`recapture_required`, which is the expected result for both bundled pairs.
