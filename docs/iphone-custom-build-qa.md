# iPhone custom-build QA — native pose detector V2

## Current verification boundary

The repository snapshot can validate the TypeScript parser, event lifecycle, Expo module configuration, podspec text, and Swift source contracts on Linux. It cannot compile iOS code, run CocoaPods, inspect a built resource bundle, execute MediaPipe, or run a physical iPhone. Those Apple/device gates remain **PENDING** until the steps below are completed and recorded by an owner.

The representative V2 flags must remain off until this checklist and the Firebase emulator/network gates in `representative-4d-validation-protocol.md` pass. A successful TypeScript/static check is not permission to enable capture in production.

The existing `ios/Resources/pose_landmarker_full.task` binary is intentionally not duplicated here. It is present in the source repository but omitted from this audit snapshot.

## Fail-closed model integrity gate

The exact approved SHA-256 cannot be established from this snapshot because the binary is absent. Do not invent or infer a digest. The release owner must establish it from the reviewed repository object and replace `PENDING_OWNER_APPROVAL` in the release record—not in application logs.

Run from a clean macOS checkout containing the existing model:

```sh
MODEL_PATH="modules/formpath-pose/ios/Resources/pose_landmarker_full.task"
EXPECTED_MODEL_SHA256="PENDING_OWNER_APPROVAL"

test -f "$MODEL_PATH" || { echo "model file missing" >&2; exit 1; }
test "$EXPECTED_MODEL_SHA256" != "PENDING_OWNER_APPROVAL" || {
  echo "approved model SHA-256 is still pending" >&2
  exit 1
}

ACTUAL_MODEL_SHA256="$(shasum -a 256 "$MODEL_PATH" | awk '{print $1}')"
test "$ACTUAL_MODEL_SHA256" = "$EXPECTED_MODEL_SHA256" || {
  echo "model SHA-256 mismatch" >&2
  exit 1
}
```

Record the following together in the release evidence: repository commit, Git object ID for the model, 64-character lowercase SHA-256, byte count, verifier, and UTC verification date. Re-run the procedure after every model change. A missing expected digest, missing file, or mismatch blocks the build.

## Fail-closed model license gate

The release owner must verify the exact `pose_landmarker_full.task` artifact against its authoritative model card/download record and applicable terms. Record the source URL, artifact/version identifier, license or terms URL, retrieval date, redistribution review decision, approver, and any attribution/notice obligations. Preserve a durable copy of that evidence with the release record.

Status in this snapshot: **PENDING — model license and redistribution approval not established here.** A missing source/version match, unclear redistribution permission, or unmet notice obligation blocks release even if the hash matches.

## macOS/Xcode and CocoaPods gates

Use a clean checkout and an Xcode/macOS combination supported by the project’s Expo SDK. Record command output and the exact tool versions.

- [ ] Run Expo prebuild for iOS and confirm autolinking reads `FormpathPose.podspec`.
- [ ] Run CocoaPods installation and confirm `MediaPipeTasksVision` resolves exactly to `0.10.21`.
- [ ] Build the generated iOS workspace with Xcode for a physical-device destination.
- [ ] Confirm Swift compilation for the Expo `Record`, async AVFoundation loading, MediaPipe video API, event emission, and cancellation actor.
- [ ] Inspect the built app and confirm `FormpathPose.bundle/pose_landmarker_full.task` exists and `FormpathPoseResources.poseLandmarkerModelPath()` resolves it.
- [ ] Measure end-to-end owner-private save time and failure cleanup for Basic and High on normal Wi-Fi and cellular; High currently stages 720 one-mutation requests and is release-blocking if the UX cannot complete reliably.
- [ ] Verify every V2 environment flag is absent or `0` before the acceptance run, then enable only the specific test build with all three values exactly `1`.

## End-to-end physical acceptance matrix

- [ ] Camera and Photos permissions: test first denial, settings recovery, grant, and least-privilege copy.
- [ ] Complete one Basic 1+1 profile and one High 3+3 profile without bypassing recapture gates.
- [ ] Complete left- and right-hand capture sessions and confirm the selected hand persists through analysis/reopen.
- [ ] Capture in portrait and landscape and confirm upright-source overlays and final skeleton orientation.
- [ ] Decode HEVC, slow-motion, and variable-frame-rate clips using actual presentation timestamps.
- [ ] Exercise accepted and rejected 2-second and 20-second boundary clips.
- [ ] Verify real progress and cancellation, including no progress or save after cancellation.
- [ ] Interrupt the app with a background interruption during each native pass and during persistence; confirm safe retry/cleanup.
- [ ] Use retake for every capture slot and confirm stale attempts never enter the representative subset.
- [ ] Play all 101-phase playback samples, including exact phase 0 and phase 1 endpoints.
- [ ] Run airplane mode local detection and reconstruction; cloud save must wait/fail clearly without losing the local result.
- [ ] Force-quit and reopen after save, then strictly reconstruct the same 101-phase owner profile.
- [ ] Sign in as a second account and verify other-account denial for list, read, delete, and resume paths.
- [ ] Verify deletion and deletion resumption after interruption, with subordinate documents removed before the head.
- [ ] Confirm the missing-model case returns stable `model_missing` and does not expose a local path.

Status in this Linux run: **PENDING — not executed.**

## Physical-iPhone behavior gates

Use consented local clips only. Do not paste clip URIs, filenames, frames, or landmark arrays into QA notes or console logs.

- [ ] V1 regression: `analyzeVideoAsync(uri, sampleCount)` still returns its existing `frames`/`sampledFrames` shape.
- [ ] Exact V2 request: only `uri`, `requestId`, `view`, `shootingHand`, `takeIndex`, and `profile: "personal_v2"` are accepted; missing, changed, or extra fields fail as `invalid_request`.
- [ ] V2 valid clip: metadata is emitted first, the full-frame locator targets 15 fps, and the complete cropped output pass merges locator timestamps with at-most-30-fps samples from the bounded wrist/elbow-motion window.
- [ ] Visible full-body ROI: the one clip-level crop contains the head, both shoulders, hips, knees, ankles, and the shooting arm through maximum extension for every output timestamp.
- [ ] Portrait/landscape ROI: repeat in both orientations and verify the upright crop uses the displayed pixel dimensions after preferred-track transform.
- [ ] Frame-edge ROI: repeat with the subject near the left, right, top, and bottom edge; proportional padding clamps to the source without a degenerate crop or clipped extended arm.
- [ ] Locator failure: insufficient light, a partially hidden body, or unstable multi-person framing returns only stable `person_roi_unavailable`, no accepted sequence, and no media context.
- [ ] Crop overlay: draw restored public x/y over the upright source and compare with the cropped model overlay; verify a non-full crop is restored exactly once and raw MediaPipe z is not drawn as metric depth.
- [ ] Actual-time proof: compare returned timestamps with the asset’s presentation timestamps; verify they are the `actualTime` values from frame decode, not requested sampling times.
- [ ] Ordering proof: returned detected frames are deduplicated and strictly timestamp-ordered.
- [ ] Counter proof: locator attempted/decoded/detected counters are separate; final `attempted` increments for every merged timestamp, `decoded` only after source decode/crop/`MPImage` conversion, `detected` only for a unique 33-landmark cropped pose, and `rejected = attempted - detected`.
- [ ] Attempt-evidence proof: every final requested timestamp has a decoded/detected marker, and a failed interval spanning the release proxy fails `critical_phase_gap` instead of being interpolated into acceptance.
- [ ] Quality-boundary proof: 9/15 and 12/20 fail the final 80% gate, the exact 80% boundary passes when other gates pass, and every shoulder/wrist/hip/knee/ankle reaches at least 85% visible coverage.
- [ ] Progress proof: only `metadata`, `coarse_pose`, `dense_pose`, `quality`, and `complete` are emitted; coarse progress covers the locator, dense progress covers the entire cropped output pass, each event includes the matching request ID, and no event contains media identifiers.
- [ ] Concurrent-request proof: progress cannot cross request IDs and duplicate active request IDs fail stably.
- [ ] Cancellation proof: cancel during locator decode/detect and output decode/crop/detect, plus quality; each returns `analysis_cancelled`, stops before the next boundary, and returns no partial sequence.
- [ ] Codec proof: repeat with HEVC, VFR, and slow-motion clips and record exact locator/output counters and progress totals without assuming nominal FPS means constant frame rate.
- [ ] Invalid-media proof: empty, corrupt, non-video, and unreadable local inputs fail without a URI or filename in the result/log.
- [ ] Privacy proof: inspect the device/app console and network capture; there must be no URI, filename, raw frame, or landmark logging/upload.
- [ ] Coordinate-boundary proof: MediaPipe `z` is treated only as raw image-relative local detector output. It is not described as reconstructed depth and is not forwarded directly to Task 4 or cloud persistence.

Status in this Linux run: **PENDING — physical iPhone and device network/log inspection not executed.**

## Linux checks available now

```sh
./node_modules/.bin/vitest run tests/pose-detection-v2-contract.test.ts tests/pose-detection-contract.test.ts
./node_modules/.bin/vitest run tests/shooting-profile-*.test.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint lib/pose-detection-v2.ts lib/pose-detection.native.ts \
  modules/formpath-pose/src/FormpathPoseModule.ts tests/pose-detection-v2-contract.test.ts
```

Passing Linux checks do not satisfy any Apple-toolchain or device gate above.

Task 5B status in this Linux run: **PENDING — Xcode compilation, CocoaPods resolution, physical-iPhone ROI overlays, cancellation timing, and codec matrix were not executed.**
