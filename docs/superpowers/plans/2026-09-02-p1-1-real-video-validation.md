# P1.1 — Private real-video validation flow (plan)

Status: approved design direction from the owner work order; bounded change. Start `main` SHA:
`075efaa860c6d0aadb403b697abdec2f5a94c5b6`. Branch: `feat/p1-real-video-validation`.

## Problem statement

The P1 two-view pipeline is merged and proven on synthetic sequences, but no real iPhone clip has
ever passed native MediaPipe → `LandmarkSequenceV2` → phase alignment → 101×12 estimate → quality
gate. The repository is temporarily public, so nothing identifying (video, raw landmark JSON, face
landmarks, native `z`, per-frame timestamps, file names, URIs, paths, user names, credentials) may
ever enter Git, PRs, CI logs, or `HANDOFF.md`.

Goal of this change: let an owner with a custom development build run a consented front + shooting-
side pair on the phone and obtain **only** a strict-schema `TwoViewEvaluationReportV1`, or a typed
recapture with the stable reason code, without any raw data leaving the app. This is an E2E smoke
test, not a 3D accuracy validation.

## Design (bounded)

1. `lib/feature-flags.ts`: `realVideoEvaluation` is true only when
   `EXPO_PUBLIC_FORMPATH_REAL_VIDEO_EVAL === "1"`. Default off.
2. `lib/shooting-profile/real-video-evaluation.ts` (pure, no React Native, no network, no Firebase):
   - `isRealVideoEvaluationEnabled(flags, developmentBuild)` = flag `&&` `__DEV__`-derived boolean;
   - `collectEvaluationAttempts(state)` reads the accepted slot sequences already held in reducer
     memory (`state.slots[].sequence`) — nothing is re-read from disk or the picker;
   - `buildRealVideoEvaluation(state, options)` runs the existing `buildTwoViewEvaluationReport`,
     then `assertReportContainsNoRawEvidence` and `twoViewEvaluationReportSchema.safeParse` again,
     and returns `{ status: "ready", report, json }` or a typed `build_failed` reason; it never
     produces a `saveInput`;
   - `shareRealVideoEvaluation(json, share)` maps an injected share function's outcome to
     `shared` / `share_dismissed` / `share_failed` so dismissal is never an error.
3. `hooks/use-shooting-profile-capture.ts`: evaluation sub-state, `buildEvaluationReport()` and
   `shareEvaluationReport()` (React Native `Share.share` with the JSON as the message — user-initiated
   share sheet only; no clipboard, no HTTP, no analytics, no Firestore). The existing save path,
   `matchingShootingProfileSaveInputV2`, `runCaptureSaveOperationV2`, and all cancellation guards are
   untouched.
4. `components/shooting-profile/real-video-evaluation-panel.tsx`: minimal internal panel rendered by
   `capture-session.tsx` only when the hook reports `evaluationEnabled`, in `result_review` and in the
   recapture `error` state.
5. `docs/real-video-validation-runbook.md`: owner-run procedure (Mac/Xcode, EAS-without-secrets,
   flag activation, camera placement, Basic 1+1 then High 3+3, saving the derived report, cleanup,
   reason-code actions).

Not in scope: solver math, thresholds, `heuristic_v1` coefficients, calibration, Firestore
contract, V1, social, player data, server cleanup, viewer UI, repository visibility.

## Test-first checklist

- [ ] flag exact-`"1"` semantics and release-build gating (`isRealVideoEvaluationEnabled`)
- [ ] default build cannot reach the panel or export code (source guards + flag value in tests)
- [ ] sequences never reach Firestore/network (module import guard + runtime fetch spy + no `saveInput`)
- [ ] derived report passes the strict schema; raw landmark / native `z` / timestamp / URI / filename rejected
- [ ] `complete` and `recapture_required` reports both build from reducer state
- [ ] share dismissal is `share_dismissed`, not a failure; share throw is `share_failed`
- [ ] `cross_view_phase_mismatch`, `phase_detection_failed`, `uncertainty_exceeds_limit` preserved verbatim
- [ ] evaluation failure produces no `saveInput`; save envelope logic unchanged
- [ ] 101 phases, 12 joints, Basic 0.65 cap, 1+1 / 3+3 unchanged

## Verification before completion

`CI=true corepack pnpm install --frozen-lockfile`, `corepack pnpm check`, `corepack pnpm lint`,
`corepack pnpm test:unit`, `corepack pnpm test:rules` (CI only on this Windows machine), Expo web
export to a temporary directory, `git diff --check`, and a tracked-file scan for media, raw JSON,
credentials, and absolute paths. The physical-iPhone run (Task 4) needs macOS/Xcode and a consented
pair; without them the PR stays open and the status stays
`code_complete_but_real_video_validation_blocked`.
