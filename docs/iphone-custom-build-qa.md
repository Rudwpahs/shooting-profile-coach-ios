# iPhone custom-build QA — native pose detector V2

## Current verification boundary

The repository snapshot can validate the TypeScript parser, event lifecycle, Expo module configuration, podspec text, and Swift source contracts on Linux. It cannot compile iOS code, run CocoaPods, inspect a built resource bundle, execute MediaPipe, or run a physical iPhone. Those Apple/device gates remain **PENDING** until the steps below are completed and recorded by an owner.

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
- [ ] Confirm the missing-model case returns stable `model_missing` and does not expose a local path.

Status in this Linux run: **PENDING — not executed.**

## Physical-iPhone behavior gates

Use consented local clips only. Do not paste clip URIs, filenames, frames, or landmark arrays into QA notes or console logs.

- [ ] V1 regression: `analyzeVideoAsync(uri, sampleCount)` still returns its existing `frames`/`sampledFrames` shape.
- [ ] V2 valid clip: metadata is emitted first, coarse sampling targets 15 fps, and dense sampling stays at or below 30 fps inside the bounded wrist/elbow-motion window.
- [ ] Actual-time proof: compare returned timestamps with the asset’s presentation timestamps; verify they are the `actualTime` values from frame decode, not requested sampling times.
- [ ] Ordering proof: returned detected frames are deduplicated and strictly timestamp-ordered.
- [ ] Counter proof: `attempted` increments for every requested decode, `decoded` only after image decode and `MPImage` conversion, `detected` only for a unique 33-landmark pose, and `rejected = attempted - detected`.
- [ ] Progress proof: only `metadata`, `coarse_pose`, `dense_pose`, `quality`, and `complete` are emitted, each includes the matching request ID, and no event contains media identifiers.
- [ ] Concurrent-request proof: progress cannot cross request IDs and duplicate active request IDs fail stably.
- [ ] Cancellation proof: cancel during coarse, dense, and quality boundaries; each must return `analysis_cancelled`, stop before the next frame/stage, and return no partial sequence.
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
