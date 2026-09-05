# Two-view local evaluation tool

Privacy-safe, local-only evaluation of the representative two-view pipeline
(`lib/shooting-profile/two-view-pipeline.ts`). It runs the exact production
entry point on two (Basic) or six (High) locally stored `LandmarkSequenceV2`
JSON files and writes a report that contains **only derived metrics**.

The output of the pipeline is `representative_phase_fused_4d_estimate_not_actual_3d`:
separately recorded, non-simultaneous clips fused on the normalized shot-phase
grid. The report never upgrades that claim.

## What may and may not leave the workstation

| Stays local, never committed, never uploaded | May be shared |
| --- | --- |
| raw front/side videos | the JSON report written by the tool |
| landmark JSON exported from the device (33 landmarks, native `z`, frame timestamps, face indices) | `HANDOFF.md` summaries of the report |
| file names, paths, URIs, EXIF, consent documents | an opaque consent record id |

`assertReportContainsNoRawEvidence` refuses to write a report whose JSON contains
`file://`, `.mp4`/`.mov`, `filename`, a standalone `uri`, `sourceLandmarks`,
`timestampMs`, `exif`, `nose`, or a raw `"z":` field. The zod schema in
`lib/shooting-profile/evaluation-report.ts` is strict, so unknown keys are rejected
and the `privacy` block must be all-`false` literals.

## Input

Each input file is one `LandmarkSequenceV2` object exactly as the on-device
detector emits it (`transformConvention: "upright_source_top_left_v1"`, validated
by `parseLandmarkSequenceV2`). Lawful sources are limited to self-captured or
explicitly consented footage; see `docs/real-video-source-admission.md` and
`docs/authorized-multiview-capture-kit.md`. Player footage with unclear rights is
not an input.

## Run

```bash
corepack pnpm eval:two-view --mode basic_1_plus_1 --hand right --front /abs/local/front.json --side /abs/local/side.json --source consented_self_capture --consent-record local-consent-YYYYMMDD-001 --output /abs/local/report.json
```

High accuracy passes three `--front` and three `--side` files. Exit codes:
`0` complete, `3` recapture required (the report still records every reason),
`2` an input file is not a valid `LandmarkSequenceV2`, `1` any other failure.

## Report contents

- per attempt: accepted frame ratio, nominal frame rate and mode, median and
  lower-decile visibility of the twelve required joints, phase-anchor detection
  outcome and the five anchor positions as fractions of the ready to
  follow-through span (never timestamps);
- cross-view geometry: status, the minimum normalized view distance between
  any front/side pair against the provisional 0.04 admission limit, compared
  pair count, or the rejection reason (`duplicate_view_projection`,
  `mirrored_view_projection`);
- cross-view alignment: status, confidence, maximum intermediate anchor delta,
  interval RMSE, compared pair count, or the rejection reason;
- pipeline outcome: `complete` or `recapture_required` with the stable reason,
  detail, affected attempts and bones, confidence, retained takes;
- evidence summary: mean/min conditioning, mean/min availability, retained
  angular spread, anchor dispersion, perturbation sensitivity, maximum cone;
- reconstruction: bone-length drift after forward kinematics, joint-angle
  velocity distribution and discontinuity count, uncertainty cone and
  covariance-trace distributions;
- runtime: processing time and peak heap when available.

`docs/evaluation/two-view-evaluation-report.synthetic-example.json` is a report
generated from the deterministic synthetic fixture
(`tests/fixtures/synthetic-landmark-sequence.ts`) with `sourceClass:
"synthetic_fixture"`. It documents the shape only; it is not real-video evidence.

## On-device path (P1.1)

A development build with `EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL=1` (exactly `1`,
plus the three V2 flags) shows an internal panel on the capture review and
recapture screens that builds the same `TwoViewEvaluationReportV1` from the
sequences already held in memory and hands the JSON to the system share sheet
only when the user presses the button. Raw clips and landmarks never leave the
app; see `docs/real-video-validation-runbook.md`.

## Status

No lawful real front/side pair has been evaluated yet. Until one is, the P1
real-video gate stays `real_video_fixture_unavailable` and the release status is
`code_complete_but_real_video_validation_blocked`.
