# Representative 4D validation protocol

## Status and claim boundary

This is the required pre-release protocol for `representative_phase_fused_4d_estimate_not_actual_3d`. The algorithm fuses separately recorded front and shooting-side attempts by normalized shot phase. It is not synchronized/camera-calibrated triangulation, metric anatomy, medical analysis, or an actual 3D measurement. Current thresholds and `heuristic_v1` uncertainty are unvalidated engineering defaults. All V2 flags remain off until the release owner records every required result and approves the target thresholds.

## Frozen algorithm under test

- exactly 101 public samples at phase `index / 100`;
- 12 persisted joints: bilateral shoulders, elbows, wrists, hips, knees, and ankles;
- Basic: one front plus one shooting-side attempt, confidence capped at `0.65`;
- High: three attempts per view, one deterministic whole-trajectory agreeing subset of at least two per view;
- no cross-attempt frame mixing and no source-timestamp pairing between views;
- no native MediaPipe z in reconstruction or cloud observation data;
- fixed adult joint-center template in shoulder-breadth units; root translation unavailable;
- failed shot admission, consensus, conditioning, uncertainty, or skeleton closure returns recapture without partial profile frames.

Any algorithm, model, landmark layout, coordinate transform, template ratio, smoothing, threshold, codec, or native detector change creates a new validation version and requires rerunning affected sections.

## Datasets and minimum sample sizes

| Set | Minimum | Required coverage | Purpose |
| --- | ---: | --- | --- |
| Synthetic known geometry | 200 generated sessions | left/right hand, portrait/landscape/square, noise, occlusion, phase shift, sign and collapse cases | deterministic math, rejection, PSD, aspect invariance |
| Bench/calibration motion | 30 paired sessions | measured articulated rig or optical-marker skeleton, known camera orientations | 3D joint-angle error against ground truth |
| Repeatability and valid-shot admission users | 60 adults × 10 independently labeled valid attempted shots per view | at least 30 left-hand; broad height/arm-span/body-size range; varied skin tone/clothing; retain every product rejection and reason | within-user repeatability, subset stability, and unbiased valid-shot false-reject rate |
| Negative/non-shot clips | 300 clips | stationary, walking, dribble, pass, partial body, second person, severe occlusion | false-accept rate |
| Device matrix | 5 supported iPhone models × 12 clip modes | portrait/landscape, HEVC, VFR, slow motion, 2 s and 20 s, bright/dim | native decoding, ROI, timestamps, performance |

Real-user collection requires informed consent, a documented retention period, withdrawal/deletion verification, and no player-name labeling. A blinded human protocol labels shot validity before product output is revealed. Every independently valid attempt remains in the false-reject denominator even when phase detection, ROI, consensus, uncertainty, or closure rejects it. Training/tuning subjects and held-out validation subjects must be disjoint.

## Ground truth and alignment

The primary quantitative reference is synchronized optical motion capture or a measured articulated rig with joint-center mapping documented before analysis. Consumer front/side clips are recorded separately as the product requires; the ground-truth sequence is reduced to the same shot-phase definition without using product output to choose correspondences. Report both phase-anchor timing error and joint-angle error at all 101 phases. Do not use a manually selected best frame after seeing the product result.

For each retained bone pair, compute angular error with a numerically stable dot/cross formulation. Report shoulder, elbow, hip, knee, and whole-body aggregates separately. Template-length error is not interpreted as personal anatomy because output lengths are fixed by design.

## Prespecified acceptance targets

These are product targets, not current measured performance:

- median 3D joint-angle absolute error ≤ 8° and 90th percentile ≤ 15° on held-out accepted sessions;
- left/right-hand subgroup median difference ≤ 3°;
- portrait/landscape and smallest/largest body-size subgroup median difference ≤ 3°;
- repeated-session median joint-angle deviation ≤ 6° and 90th percentile ≤ 12°;
- High subset selection identical under every input permutation and stable in at least 95% of repeat captures without introduced outliers;
- non-shot false-accept rate ≤ 1%; valid-shot false-reject rate ≤ 10% overall and ≤ 15% in every prespecified subgroup;
- no accepted sample with nonfinite output, non-PSD covariance, missing phase/joint, raw-z dependence, or shoulder-closure breach;
- Basic confidence never exceeds 0.65.

If a target fails, keep flags off. Do not tune on the held-out set; revise on training data, version the change, and rerun held-out validation.

## Uncertainty validation

`heuristic_v1` is currently a deterministic sensitivity score. It must not be labeled “95%”, probability, confidence interval, or calibrated coverage. To make a statistical coverage claim, freeze a proposed interval definition before evaluation and demonstrate its nominal coverage on a separate held-out set, overall and by hand, body-size, device, orientation, lighting, and clothing subgroup. Report calibration curves, undercoverage, and interval width; a single average correlation is insufficient.

Until then, UI copy may only say that larger cones/covariance indicate greater engineering sensitivity and may request recapture.

## Native, privacy, persistence, and UX gates

- clean TypeScript, Vitest, lint, Expo export, CocoaPods, Xcode, and physical-device runs;
- exact model resource SHA-256/license record and built-bundle verification;
- actual decoded/detected presentation timestamps, 80% final detection, critical-joint coverage, and ≤150 ms release-proxy detection gap;
- robust one-person ROI under edge entry, camera motion, outlier landmarks, and a second person;
- airplane-mode local detection, cancellation, background interruption, retake, and 101-phase playback;
- Firebase Rules compiler/emulator owner allow/cross-owner deny tests, strict readback, missing/duplicate/extra document rejection, deletion resumption, and ambiguous network outcomes;
- explicit Camera and Photos permission denial/recovery, Basic 1+1 and High 3+3, left/right hand, portrait/landscape, HEVC/VFR/slow motion, 2-second/20-second clips, progress/cancellation, background interruption, retake, 101-phase playback, airplane-mode local processing, force-quit/reopen, other-account denial, deletion, and deletion resumption;
- Basic and High save latency on Wi-Fi/cellular. The current High plan has 720 staging writes at one mutation per request; unacceptable duration, timeout, battery, or retry behavior blocks rollout;
- raw video, filename, URI, EXIF, thumbnail, source timestamp, nonallowlisted joints, and native z absent from every cloud document and log.

## Release record

Record commit SHA, app/build versions, MediaPipe/model versions and checksum, threshold/config version, dataset IDs and consent basis, exclusion counts/reasons, every aggregate and subgroup result with confidence bounds, failing cases, device/network measurements, Firebase emulator output, Xcode/device evidence, reviewer names, and UTC approval date. Production flags may be enabled only by a separate reviewed rollout change after this record passes.
