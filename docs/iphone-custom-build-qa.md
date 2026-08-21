# iPhone Custom Development Build QA

## Purpose

This is the acceptance procedure for the existing user-upload flow. It does not add a player model or reference motion. A development build is needed because the `FormPathPoseDetector` bridge is native code; Expo documents that development builds can include custom native libraries and configuration whereas Expo Go is limited to its bundled native set. [1] [2]

## Prerequisites

| Requirement | Repository state | Owner action before test |
| --- | --- | --- |
| Development client | `expo-dev-client` is installed | Build a new development binary after adding the actual native `FormPathPoseDetector` implementation. |
| iOS permissions | `expo-image-picker` plugin and Korean photo-library message are configured | Install the fresh build; configuration-plugin changes require a new binary. [3] |
| Native detector | JavaScript bridge expects `NativeModules.FormPathPoseDetector.analyzeVideo(uri)` to return sampled 33-landmark frames | Add or link the Swift/MediaPipe Tasks Vision bridge before executing the test. |
| Firebase | UID-scoped Auth and Firestore rules are present | Supply the production Firebase configuration and sign in with a test account. |
| Test media | One private 2–20 second side-view, full-body shooting clip | Use a clip with preparation through follow-through visible; do not use it as a product model. |

## Device procedure

1. Create a new development build. Expo’s documented iOS path is `npx expo run:ios --device` on macOS/Xcode, or an iOS development build through EAS; install it on a physical iPhone and enable Developer Mode. [1]
2. Sign in, open **내 기록**, and choose **영상 선택 후 분석**. Grant the media-library permission before the picker opens.
3. Select the prepared video. Confirm that a shorter-than-two-second or longer-than-twenty-second clip is rejected before detector execution.
4. Confirm the detector reports progress, rejects inadequate landmark visibility/coverage, or yields a five-phase corrected fluid motion. The raw video must remain local; only pose JSON, quality JSON, correction JSON, and corrected motion JSON may be written.
5. Close and reopen the app. Confirm that the same Firebase UID can view and delete its corrected motion, while another account cannot access it.
6. Confirm all private motion copy says analysis-only and that it is absent from recommendation inputs.

## Pass criteria and honest stop condition

The test passes only when a physical iPhone returns a valid native detector payload, the independent JavaScript quality gate accepts it, the correction output is stored, and the reopened private viewer renders the same five-phase timeline. If the native bridge is absent, the UI must show its explicit custom-build requirement rather than fabricate a skeleton. This sandbox cannot perform that hardware acceptance test.

## References

[1] [Expo, *Introduction to development builds*](https://docs.expo.dev/develop/development-builds/introduction/)

[2] [Expo, *Add custom native code*](https://docs.expo.dev/workflow/customizing/)

[3] [Expo, *ImagePicker configuration and video permission behavior*](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
