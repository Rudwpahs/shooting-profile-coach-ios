# Paul George multi-view source intake

## Public candidate findings

| Candidate | Identity and motion | View coverage | Same-shot pair | Intake decision |
| --- | --- | --- | --- | --- |
| `BmUSFy9QWEo` — *Paul George Shooting Form Slow Motion* | #13 Paul George, multiple continuous game shots | low-angle and medium game angles | none observed | qualitative source only; no raw landmark input available |
| `hX0W_4hULK0` — *Paul George Slow Motion Shooting Compilation* | #24 Pacers Paul George, ten continuous shots | side-front, rear-side, front-side | none observed | semantic phase reference only; no calibrated reconstruction |
| Existing local All-Star capture | visual audit identifies #13 Paul George; 31 extracted frames, 0.837 mean visibility | side/front-side screen capture | one view only | usable for source-faithful 2D and single-view display analysis |

Browser access to the first public YouTube candidate was blocked by automated-traffic protection. Independent video analysis was used to classify content only. It does not create a raw video asset or a landmark sequence.

## Admission

No public candidate supplies the same physical shot from synchronized calibrated front and side cameras. The public candidates remain **qualitative evidence**. The local All-Star sequence can support an analysis-only, non-metric single-view Paul George viewer, but not actual 3D or recommendation input.

## Local source phase audit

The local All-Star source passes the extracted landmark quality gate at 31/31 detected frames and mean visibility 0.837. A five-phase audit sheet records `0`, `355`, `516`, `645`, and `742 ms` for preparation, dip, rise, release, and follow-through respectively. Independent visual analysis identifies Paul George in a correctly oriented East #13 jersey and verifies a **right-handed** release. The landmark wrist-height heuristic selected the guide hand, so the product source record uses an explicit `video_audit_override` for the right shooting hand rather than silently trusting that heuristic.

## Viewer verification

Motion Studio renders `PAUL GEORGE · AUTO-CORRECTED ANALYSIS` with the five source timestamps, conservative correction statement, five-phase source check, right shooting-arm chain, wrist-above-shoulder follow-through proxy, and unavailable ball/rim/finger/exact-angle items. The card explicitly remains `not actual 3D` and `not used for recommendation`; the approved optical section remains separate.

## Final phase and viewer correction

The initial automatic phase picker selected the guide-hand peak for the dip. A source measurement audit instead selected the video-audited right shooting hand and explicit source indexes `0, 2, 11, 20, 23`: `0`, `65`, `355`, `645`, and `742 ms`. The preparation and dip frames retain head visibility of `0.995817` and `0.995659`; the dip keeps the right wrist `0.129940` image units below the right shoulder before the rise. Motion Studio now displays final analysis viewers only, draws a visible head cue, and emphasizes the verified shooting shoulder–elbow–wrist chain in orange while neutralizing the non-shooting side.

## 2026 re-correction

The retained 31-frame landmark evidence was audited again with the current right-hand measurement rule. The regenerated source anchors are `0`, `97`, `355`, `645`, and `806 ms` for preparation, dip, rise, release, and follow-through. The `97 ms` dip preserves the lowest pre-release right hand in the saved sequence. The `806 ms` frame preserves the extended right wrist after release. No raw video was reintroduced into the product repository; regeneration uses retained landmark provenance only.

Paul George’s own heavy-ball training explanation supports a repeated one-motion shot powered from the legs. The implementation uses that information only as a form-match review for phase order and visible lower-body sequence. It does not replace the observed video, estimate force, or alter the original shot direction.
