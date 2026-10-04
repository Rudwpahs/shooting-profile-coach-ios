# iOS privacy release gate

Source configuration is not final archive evidence. Do not mark this gate passed until all items below are recorded from the exact release build.

Record: app version ___ / build ___ / git SHA ___ / Xcode ___ / device or archive date ___

- [ ] Create the release Archive on a supported Mac/Xcode version.
- [ ] Generate/review the Xcode privacy report and attach its evidence path.
- [ ] Inspect linked third-party SDK `PrivacyInfo.xcprivacy` manifests and required SDK signatures.
- [ ] Validate every Required Reason API category/reason found in the final archive; do not invent declarations from source guesses.
- [ ] Reconcile final App Store Connect privacy labels with actual Auth/Firestore/local data flows.
- [ ] Verify the production Cloud Firestore database region and record console/project evidence.
- [ ] Run `getIosReleaseBlockers(...)`; release requires an empty blocker list backed by the evidence above.
- [ ] Record whether the archive was built with `EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1=1`. The default is off: raw footage stays on the device (`docs/HOOPHUB_AI_PRODUCT_ARCHITECTURE.md` §6) and the bundle contains no upload path.
- [ ] If that flag is on, all of the following are required first; otherwise leave it off:
  - a reviewed architecture decision by the owner that authorises opt-in cloud keeping of raw footage (the architecture document says a change that uploads raw video needs one);
  - `firestore.rules` and `storage.rules` from this repository deployed to the production project, and the rules emulator suite green on the released commit;
  - the Firebase Storage bucket region recorded next to the Firestore region;
  - the privacy policy text and App Store privacy answers updated for user video content (see the questionnaire sheet);
  - an end-to-end check on the production project: keep one shot, see it listed, download it, delete it, and confirm in the console that its objects and documents are gone; then delete a test account that has a kept shot and confirm the same.

The app-level Expo manifest intentionally declares only `NSPrivacyTracking: false` and `NSPrivacyTrackingDomains: []`; CocoaPods manifest aggregation is enabled through `expo-build-properties`.
