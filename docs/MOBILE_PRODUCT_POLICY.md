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

Version one uses device-local storage for the user’s level, goal, and self-assessed shooting traits. It does not require an account, does not upload a video, and does not create a player identity record. Before adding cloud sync, analytics, video processing, or user accounts, the product must add a privacy review, a retention policy, and opt-in consent flow.

## References

[1]: https://github.com/Rudwpahs/shooting-form-analysis/pull/9 "Provenance-gated verified 3D analysis pipeline"
