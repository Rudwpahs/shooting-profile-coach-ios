# FormPath Basketball Product Policy

## Product promise

FormPath Basketball recommends an **anonymous shooting characteristic** that helps a user choose the next practice focus. It does not identify a player, claim that a user should copy a professional athlete, or state that a pose estimate is a biomechanical measurement. The app prioritizes a user-selected goal and their locally stored traits, then explains the recommendation in plain coaching language.

## Reference library release policy

| Library state | Consumer wording | Permitted behavior |
|---|---|---|
| `provisional_legacy_aggregate` | “익명 legacy 집계 기준” | Explain a training direction; never say verified form or athlete model |
| `verified` | “검증된 reference 특성” | Compare traits only after provenance and reviewer gates pass |
| `rejected` | Not exposed | Cannot influence scores or advice |

The current app ships with four provisional archetypes derived from the aggregate distribution of the audited legacy cohort. The app shows this status in its home, library, and settings views rather than silently converting legacy data into a commercial-quality claim.

## Data intake requirements

New reference data must first pass the source pipeline in `shooting-form-analysis`: a real footage indicator, manual identity review, shot-event review, frame labels, source/licensing status, duplicate-source checks, and reviewer record are required. Raw video URLs and player identity stay out of the mobile bundle. Only the resulting anonymized trait range and its release state may be packaged into the app.[1]

## Privacy boundary

Version one uses device-local storage for the user’s level, goal, and self-assessed shooting traits. The default-off V2 path requires an authenticated owner and explicit capture consent, but pose detection still runs locally and raw video is not uploaded. Only the 12 allowlisted joints' normalized x/y/visibility observations and the derived representative x/y/z/uncertainty sequence may be stored in owner-private Firestore documents. Filename, URI, EXIF, thumbnail, source timestamp, nonallowlisted landmarks, and native MediaPipe z are forbidden from cloud writes.

V2 owner data uses the retention class `owner_deleted_v2`; deletion must remove subordinate evidence before the profile head. These controls do not make client-written bytes trusted reference data. Comparative-player or coaching systems must not consume them as authoritative until server attestation, abuse controls, validation, retention review, and explicit product consent are approved.

## Representative estimate wording

The separate-shot V2 output must be labeled `representative_phase_fused_4d_estimate_not_actual_3d`. It may describe a repeatable phase-aligned shooting-form estimate, confidence/quality gates, and recapture guidance. It must not be called synchronized capture, triangulated 3D, metric anatomy, a calibrated uncertainty interval, medical/clinical analysis, or proof that the user matches a named player.

## References

[1]: https://github.com/Rudwpahs/shooting-form-analysis/pull/9 "Provenance-gated verified 3D analysis pipeline"
