# Hoop Hub UI + AI + Motion Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Claude-built skeleton-social UI into a real vertical Reel experience where Motion Lift, public 3D playback, Save for Later, and a grounded PyTorch Coach all consume the same measured motion pipeline without cluttering the default video surface or expanding cloud data unnecessarily.

**Architecture:** Keep PR #5 as the visual baseline, keep PR #4 as the perception/private-evidence pipeline, and place a narrow shared contract between representative motion and the Coach. The mobile UI never depends directly on model internals: `RepresentativePose4DV2 -> CoachObservationV1[] -> CoachProvider -> CoachResponseV1`. Public Reels use a separate compact playback packet; private uncertainty/provenance remains private. Motion Lift is the interaction bridge that reveals both 3D and at most one grounded AI cue.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, expo-video, react-native-gesture-handler, Reanimated, react-native-svg, expo-haptics, Firebase/Firestore + object storage, existing FormPath native pose module, Python 3.11, PyTorch, Pydantic v2, FastAPI, Transformers/PEFT.

**Spec:** `docs/superpowers/specs/2026-09-09-hoop-hub-integrated-experience.md`

## Global Constraints

- Base visible design on `feat/uiux-skeleton-social-redesign` / PR #5; do not revert the Graphite / Volt token system, skeleton identity, compact copy budget or accessibility work.
- Do not merge/bypass `feat/p1-real-video-validation` / PR #4 before its existing physical-iPhone Basic 1+1 gate passes.
- `feat/formpath-coach-pytorch` is an experimental scaffold only; corpus ingestion, RAG, trained weights, PlayerState bridge and mobile integration are not yet implemented.
- Default Reel must remain video-first; AI and analysis chrome stay hidden until inspection intent.
- Motion Lift skeleton interaction must work even when subject segmentation fails or is unavailable.
- Do not send raw video, face data, raw MediaPipe landmarks, native z, filenames/URIs or private per-frame capture evidence to Coach.
- Do not use the private 101-document V2 persistence shape as the public feed playback representation.
- No Three.js/R3F or Skia in the first implementation unless a measured test later falsifies the existing SVG/native path.
- Public motion packet, Coach request and Coach response must all be schema-versioned.
- Every UI/network failure path must preserve Reel playback and basic skeleton inspection.

---

### Task 1: Establish the integration branch and merge-order gate

**Files:**
- Create: `docs/integration/hoop-hub-integration-state.md`
- Modify only when branch integration begins: `HANDOFF.md`

**Interfaces:**
- Consumes: PR #5 UI branch, PR #4 real-video branch, `feat/formpath-coach-pytorch`.
- Produces: one documented merge order and conflict policy for later tasks.

- [ ] Record exact heads for PR #5, PR #4 and `feat/formpath-coach-pytorch`, plus each branch's verification state.
- [ ] Record merge order: UI baseline first; Coach scaffold can merge as an isolated `ml/coach/` workstream; PR #4 joins only after physical-iPhone gate.
- [ ] Pin dependency-conflict rule: when PR #4's Expo dependency alignment conflicts with PR #5 package versions, prefer the branch that passed `expo install --check` and re-run all PR #5 UI tests afterward.
- [ ] Add a hard statement that no direct `main` push or force push is permitted for this integration.
- [ ] Commit as `docs: pin Hoop Hub integration branch order`.

**Acceptance:** a reviewer can tell which branch is allowed to merge next without reading chat history.

---

### Task 2: Create one cross-language Coach contract before connecting any UI

**Files:**
- Create: `contracts/coach-request-v1.schema.json`
- Create: `contracts/coach-response-v1.schema.json`
- Create: `lib/coach/contract.ts`
- Create: `tests/coach-contract.test.ts`
- Modify: `ml/coach/src/formpath_coach/schemas.py`
- Create: `ml/coach/scripts/export_schema.py`
- Create: `ml/coach/tests/test_schema_export.py`

**Interfaces:**
- Produces TypeScript/Python equivalent `CoachRequestV1` and `CoachResponseV1`.
- `CoachObservationV1`: `{ id, metric, value, unit?, reference?, measurement_confidence, source, phase_anchor?, joints?, caveats }`.
- `PrimaryVisualCueV1`: `{ observation_id, label }`; it does **not** carry generated coordinates.

- [ ] Add stable `id`, optional canonical phase anchor and optional persisted-joint list to Python observations.
- [ ] Add optional `primary_visual_cue` to Python Coach response, constrained to an observation ID string and display label.
- [ ] Export Pydantic JSON Schema into the two committed contract files.
- [ ] Mirror the same runtime validation in `lib/coach/contract.ts` with Zod using the exact literal sets already used by Python.
- [ ] Add golden request/response fixtures that pass both Python and TypeScript validation.
- [ ] Add negative fixtures for unknown confidence, unknown source, invalid joint, invalid phase anchor and missing observation ID.
- [ ] Verify: `corepack pnpm test:unit -- tests/coach-contract.test.ts` and `python -m pytest ml/coach/tests/test_schema_export.py -q`.
- [ ] Commit as `feat(coach): define shared mobile coach contract`.

**Acceptance:** a Coach response cannot ask the UI to highlight a joint/phase unless it references a measured observation already present in the request.

---

### Task 3: Build the representative-profile -> Coach observation adapter

**Files:**
- Create: `lib/coach/representative-profile-adapter.ts`
- Create: `lib/coach/confidence-map.ts`
- Create: `tests/coach-representative-profile-adapter.test.ts`
- Reuse: `lib/shooting-profile/types.ts`
- Reuse: `lib/skeleton/analysis-evidence.ts`

**Interfaces:**
- `buildCoachObservations(profile, shootingHand): CoachObservationV1[]`
- `buildCoachRequest({ profile, shootingHand, player, context, userGoal, evidence }): CoachRequestV1`

- [ ] Define a small initial metric set derived only from existing profile geometry/phase/uncertainty; do not invent force, torque, muscle activation or measured release speed.
- [ ] Give each observation a deterministic ID derived from metric + phase + joint scope.
- [ ] Map uncertainty/cone/record quality into `measurement_confidence` using one tested deterministic function.
- [ ] Add the boundary caveat `representative_phase_fused_4d_estimate_not_actual_3d` to every observation sourced from the V2 representative profile.
- [ ] Ensure no serialized request contains full `frames`, covariance arrays, raw landmark evidence, file metadata or capture attempt IDs.
- [ ] Add tests proving the same profile produces byte-stable JSON ordering/IDs and that higher uncertainty never yields higher measurement confidence.
- [ ] Add a privacy test that recursively rejects forbidden keys/values from the Coach request.
- [ ] Commit as `feat(coach): adapt representative motion into grounded observations`.

**Acceptance:** Coach sees a compact evidence-aware summary, not the private reconstruction payload.

---

### Task 4: Introduce a CoachProvider so UI integration does not wait for model training

**Files:**
- Create: `lib/coach/provider.ts`
- Create: `lib/coach/deterministic-provider.ts`
- Create: `lib/coach/remote-provider.ts`
- Create: `hooks/use-coach-insight.ts`
- Create: `tests/coach-provider.test.ts`

**Interfaces:**
- `type CoachProvider = { coach(request: CoachRequestV1, signal?: AbortSignal): Promise<CoachResponseV1> }`
- `DeterministicCoachProvider` returns a schema-valid cue based only on supplied observations; no network.
- `RemoteCoachProvider` POSTs the same request to a configured endpoint.

- [ ] Implement deterministic provider first so the entire UI can be exercised without trained weights or a backend.
- [ ] Add request de-duplication/cache keyed by representative profile ID + request content hash; do not write Coach responses to Firestore yet.
- [ ] Abort Coach work when the Reel leaves the viewport or the inspected post changes.
- [ ] Make network/model error return a typed unavailable state, not a thrown UI crash.
- [ ] Ensure remote provider never logs full request bodies in production mode.
- [ ] Add tests for success, cancellation, stale-response rejection, schema-invalid response and 5xx fallback.
- [ ] Commit as `feat(coach): add swappable coach provider boundary`.

**Acceptance:** replacing deterministic Coach with the future PyTorch service requires no changes to Reel/Motion Lift components.

---

### Task 5: Replace the current Home ScrollView cards with a real Reel feed shell

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Create: `components/reels/reel-feed.tsx`
- Create: `components/reels/reel-item.tsx`
- Create: `components/reels/reel-chrome.tsx`
- Create: `lib/reels/types.ts`
- Create: `tests/reel-feed.test.tsx`
- Reuse visual tokens/components from PR #5.

**Interfaces:**
- `ReelPostV1` contains post metadata, media reference, optional compact motion reference and author skeleton identity metadata.
- Reel item states: `playing | paused | inspecting | save_armed`.

- [ ] Preserve PR #5 TopBar/tab/token work but move the main content to a virtualized, vertically snapping one-item-at-a-time feed.
- [ ] Keep only minimal author/social chrome over the default video.
- [ ] `tap` toggles play/pause; vertical swipe remains feed navigation.
- [ ] Pause all offscreen players and unload non-adjacent heavy media according to a tested window policy.
- [ ] Keep the existing own representative skeleton/reference data as temporary Reel fixtures until social backend data is wired.
- [ ] Add accessibility actions for pause/play and next/previous Reel so gesture-only navigation has equivalents.
- [ ] Verify 375pt and compact-height layouts without covering the athlete's central body area with controls.
- [ ] Commit as `feat(reels): turn home into vertical video-first feed`.

**Acceptance:** default feed contains no persistent analysis dashboard and only one active media item plays.

---

### Task 6: Add the Motion Lift gesture state machine over the Reel

**Files:**
- Create: `components/reels/motion-lift-controller.tsx`
- Create: `components/reels/motion-lift-skeleton.tsx`
- Create: `lib/reels/motion-lift-state.ts`
- Reuse/refactor: `components/pose-motion-viewer.tsx`
- Reuse: `lib/pose-motion.ts`
- Reuse: `expo-haptics`, RNGH, Reanimated, react-native-svg.
- Create: `tests/motion-lift-state.test.ts`
- Create: `tests/motion-lift-controller.test.tsx`

**Interfaces:**
- `MotionLiftState = idle | holding | grabbed | save_armed`.
- `dx` while grabbed maps to yaw using the existing normalized yaw function.
- `dy` only affects save arming after grab; it never changes Reel index while grabbed.

- [ ] Extract/reuse the current yaw projection/SVG skeleton code rather than introducing a second renderer.
- [ ] Implement pause-only long-press activation; playing-state long press must not trigger Motion Lift.
- [ ] Compare RNGH `activateAfterLongPress` with a composed/manual activation tolerance in tests/spike wiring; choose the implementation that permits realistic pre-activation jitter.
- [ ] Trigger one haptic on grab and one distinct haptic when Save becomes armed; avoid repeated haptics while staying over threshold.
- [ ] Horizontal movement continuously updates yaw while the same pointer remains down.
- [ ] Upward movement past threshold displays a tiny bookmark affordance; release commits Save only while armed.
- [ ] Releasing without Save returns to paused inspection; swiping to another Reel resets Motion Lift state.
- [ ] Honor reduced-motion: suppress decorative lift animation while keeping state/haptic semantics.
- [ ] Commit as `feat(reels): add held Motion Lift interaction`.

**Acceptance:** `pause -> hold -> rotate -> up-to-save` is one continuous pointer interaction and ordinary vertical Reel swipes still work outside grab state.

---

### Task 7: Add optional native subject lift without making it a dependency of Motion Lift

**Files:**
- Create: `modules/formpath-motion-lift/` Expo native module
- Create: `lib/reels/subject-lift.ts`
- Modify: `app.config.ts` only as required by the local module
- Create: `tests/motion-lift-capability.test.ts`
- Add physical-device benchmark script/doc under `docs/evaluation/motion-lift/`.

**Interfaces:**
- iOS preferred input: native image/SharedRef from `expo-video` thumbnail generation.
- Output: selected cutout image reference + source bounds + selected instance ID, or typed unavailable/no-subject result.

- [ ] Implement iOS 17+ Vision person/foreground instance selection using press point + skeleton ROI as a prior.
- [ ] Keep the normal path memory-only where Expo SharedRef plumbing permits it; avoid persistent thumbnail/mask files.
- [ ] Do not block `grabbed` state while Vision runs; skeleton appears first.
- [ ] If Vision selects the wrong/ambiguous overlapping subject, discard the cutout and keep skeleton-only.
- [ ] Add Android capability boundary; ML Kit segmentation may be unavailable/model-pending and must return skeleton-only gracefully.
- [ ] Do not add cutout/mask fields to Firestore schemas.
- [ ] Physical-iPhone test must record p50/p95 thumbnail time, segmentation time, memory delta, athlete-selection accuracy and visible hitching on overlap/motion-blur clips.
- [ ] Commit as `feat(reels): add optional on-device subject lift` only after the spike meets the documented threshold chosen before the run.

**Acceptance:** disabling/removing the native subject-lift module does not break 3D rotation, Coach cue or Save for Later.

---

### Task 8: Create the compact public motion playback packet

**Files:**
- Create: `lib/reels/motion-packet-v1.ts`
- Create: `scripts/build-motion-packet.ts`
- Create: `tests/motion-packet-v1.test.ts`
- Create: `lib/reels/motion-loader.ts`
- Do not modify private V2 Firestore evidence contract.

**Interfaces:**
- `encodeMotionPacketV1(profile, shootingHand): Uint8Array`
- `decodeMotionPacketV1(bytes): PublicMotionV1`
- Packet contains only version, hand, canonical phase/anchor metadata, quantization transform and renderable xyz joints.

- [ ] Quantize render coordinates to int16 with a fixed documented transform and version byte/header.
- [ ] Prove round-trip maximum joint error stays under a predeclared visual tolerance.
- [ ] Reject malformed version, wrong length, out-of-range quantized values and noncanonical joint count.
- [ ] Keep uncertainty/covariance/private attempt evidence out of the public packet.
- [ ] Add lazy loader so the active/next Reel may prefetch motion but ordinary feed browsing does not fetch every packet.
- [ ] Commit as `feat(reels): add compact public motion packet`.

**Acceptance:** a public skeleton can be rendered without reading 101 Firestore frame documents.

---

### Task 9: Add minimal social persistence for public post + Save for Later

**Files:**
- Create/modify Firestore contract files for `reelPosts` and `savedReels`.
- Modify: `firestore.rules`
- Create: `lib/firebase-reels.ts`
- Create: `tests/firebase-reel-contract.test.ts`
- Extend: `tests/emulator/firestore-rules.emulator.test.ts`

**Interfaces:**
- `reelPosts/{postId}` stores owner, media object reference, compact motion object reference, duration/createdAt/privacy and minimal counters/state.
- `users/{uid}/savedReels/{postId}` stores `postId`, `savedAt`, and one saved playback position (`timeMs` or canonical phase index).

- [ ] Explicitly forbid masks, thumbnails generated for Motion Lift, raw landmark arrays and private representative uncertainty payloads in public post docs.
- [ ] Add owner-only publish/update/delete rules and authenticated save/unsave rules.
- [ ] Save current paused moment on upward release so reopening can seek directly to the inspected moment.
- [ ] Add idempotent save: repeated upward-save on the same post updates one record rather than creating duplicates.
- [ ] Extend emulator tests with unauthorized reads/writes and forbidden raw-field attempts.
- [ ] Commit as `feat(reels): persist minimal public posts and saved moments`.

**Acceptance:** Save for Later is one small document per user/post and public feed metadata does not duplicate motion frames.

---

### Task 10: Put one grounded Coach cue inside Motion Lift, not on the default Reel

**Files:**
- Create: `components/reels/coach-cue-layer.tsx`
- Create: `components/coach/coach-detail-sheet.tsx`
- Modify: `components/reels/reel-item.tsx`
- Modify/refactor: `components/analysis/analysis-layers.tsx`
- Modify: `app/private-analysis/[id].tsx`
- Create: `tests/coach-cue-layer.test.tsx`

**Interfaces:**
- `CoachCueLayer` receives validated `CoachResponseV1`, the original request observations and current phase/yaw.
- It resolves `primary_visual_cue.observation_id` to the app-owned observation's joints/phase.

- [ ] Keep default playing Reel free of Coach text.
- [ ] On Motion Lift inspection, show at most one short Coach cue in a safe-area location that does not cover the athlete.
- [ ] Highlight only joints/phases supplied by the matched observation; if the observation lacks a visual anchor, render text only.
- [ ] Put hypotheses, evidence used, `do_not_infer`, drill and retest behind one explicit detail sheet/action.
- [ ] Reuse the existing analysis disclosure components for owner/private detail where possible instead of building a second analytics UI system.
- [ ] On Coach unavailable/schema-invalid/stale response, show no cue and continue Motion Lift normally.
- [ ] Commit as `feat(coach): surface grounded cue inside Motion Lift`.

**Acceptance:** generated prose alone can never place an annotation on an arbitrary body part.

---

### Task 11: Connect capture -> private profile -> optional publish without weakening privacy

**Files:**
- Modify capture completion flow after PR #4 integration.
- Create: `lib/reels/publish-reel.ts`
- Create: `components/reels/publish-sheet.tsx`
- Create: `tests/publish-reel.test.ts`

**Interfaces:**
- `preparePublishableReel({ localVideo, representativeProfile, shootingHand }): { motionPacket, metadata }`
- Actual video upload occurs only after explicit publish confirmation.

- [ ] Keep capture/private analysis behavior unchanged when user does not publish.
- [ ] Generate the public motion packet from the accepted representative profile, never from raw landmarks on the feed side.
- [ ] Make public video upload an explicit action; private capture does not silently become social content.
- [ ] Verify the public payload contains no private evidence fields or local URI/file path after upload completes.
- [ ] Add typed rollback if video upload succeeds but metadata write fails, and prevent a public post head from pointing at a missing motion object.
- [ ] Commit as `feat(reels): publish validated motion without private evidence`.

**Acceptance:** capture and social publishing remain separate consent boundaries.

---

### Task 12: Build the real FormPath Coach data/RAG/training lane behind the already-stable UI contract

**Files:**
- Under `ml/coach/`: add corpus ingestion, research unit schema, retrieval, scenario data, evaluation and training manifests.
- Keep mobile contract files from Task 2 unchanged unless a version bump is justified.

**Interfaces:**
- Retrieval returns evidence items already shaped for `CoachRequestV1.evidence`.
- Model output must validate as `CoachResponseV1` before leaving FastAPI.

- [ ] Ingest the preserved FormPath research corpus into canonical research units with source IDs, evidence tier, supported/forbidden inference and contradiction group.
- [ ] Add deterministic retrieval baseline and held-out retrieval evaluation before fine-tuning.
- [ ] Create training scenarios from measured observations + retrieved evidence rather than copying papers as assistant completions.
- [ ] Train/evaluate the first adapter with recorded hardware/config/seed provenance.
- [ ] Score schema validity, evidence citation correctness, forbidden-inference rate, uncertainty calibration and drill/retest usefulness on held-out scenarios.
- [ ] Do not switch `RemoteCoachProvider` to production by default until evaluation thresholds are declared and passed.
- [ ] Add auth, rate limiting and sanitized production errors before exposing FastAPI publicly.
- [ ] Commit this lane in independently reviewable slices; do not combine model experiments with Reel UI changes.

**Acceptance:** the model plugs into the provider contract already exercised by the app; no redesign is needed when real weights replace deterministic responses.

---

### Task 13: End-to-end integration and physical-device release gate

**Files:**
- Create: `tests/integration/reel-motion-coach-flow.test.tsx`
- Create: `docs/evaluation/hoop-hub-integrated-iphone-runbook.md`
- Update: `HANDOFF.md`

**Interfaces:**
- End-to-end state path: `capture -> representative profile -> optional publish -> Reel -> pause -> hold -> rotate -> grounded cue -> up-save -> reopen saved moment`.

- [ ] Run TypeScript check, lint, full unit tests, Firestore emulator tests and Expo export.
- [ ] Run existing PR #4 Basic 1+1 physical-iPhone gate before integrating its branch into the release candidate.
- [ ] On physical iPhone, record Reel scroll smoothness, dropped-frame observations, Motion Lift p50/p95 latency, memory delta, gesture false-cancel count and subject-selection correctness.
- [ ] Test Coach available, Coach offline, motion packet unavailable, subject lift unavailable, signed-out, deleted post and save write failure.
- [ ] Test VoiceOver/accessibility actions and Reduce Motion.
- [ ] Confirm no network request containing a raw video path, raw landmark stream or Motion Lift mask appears during Reel inspection.
- [ ] Compare final behavior against the spec's default-Reel and Motion-Lift contracts before opening/merging the integration PR.
- [ ] Commit as `test: gate integrated Reel Motion Lift and Coach flow`.

**Acceptance:** the primary product path works on a physical iPhone and all optional layers degrade independently.

---

## Recommended execution order

1. Tasks 1-4: **contract first**. This prevents Claude UI and PyTorch Coach from evolving incompatible shapes.
2. Tasks 5-7: **Reel + Motion Lift** using deterministic Coach and local fixture motion.
3. Tasks 8-11: **public data + save + publish + grounded cue**.
4. Task 12: **real Coach research/training/deployment**, parallelizable once Task 2 is frozen.
5. Task 13: **integration release gate** after PR #4 physical-iPhone evidence exists.

## Branch strategy

- Keep PR #5 reviewable as a UI branch; do not dump model work into it.
- Implement Tasks 2-4 on a narrow integration-contract branch based on the approved PR #5 head.
- Implement Reel/Motion Lift on a separate feature branch based on that contract branch.
- Merge/cherry-pick the isolated `ml/coach/` work only after its tests remain green against the integration base.
- Bring PR #4 into the integration candidate only after its existing device gate passes; resolve Expo/package conflicts there, then rerun PR #5 UI tests.
- Final integration PR targets `main`; no force push and no direct main commits.

## Definition of done

The UI, perception and Coach are considered integrated only when the app no longer uses `getPracticeFocus(profile.goal)` as the primary analysis/coaching source for a measured shot, a real representative profile can produce a schema-valid compact Coach request, Motion Lift can display the same motion in the Reel, the AI cue can point only to an app-measured observation, and all three layers continue working independently when the others are unavailable.
