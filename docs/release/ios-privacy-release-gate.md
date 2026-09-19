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

The app-level Expo manifest intentionally declares only `NSPrivacyTracking: false` and `NSPrivacyTrackingDomains: []`; CocoaPods manifest aggregation is enabled through `expo-build-properties`.
