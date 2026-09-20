# App Store privacy questionnaire working sheet

Use this only as a draft reconciliation aid; final answers must be checked against the exact archive and production Firebase project.

- Account data: email + Firebase UID for authentication; linked to the user; app functionality; Firebase Authentication processes in the United States.
- User content / fitness-style derived motion data: owner-private normalized pose/profile records may be stored in Cloud Firestore when the user explicitly saves; linked by UID; app functionality; Firestore production region is currently BLOCKED pending project evidence.
- Raw shooting video: selected/captured and analyzed locally; product code does not upload raw video.
- Tracking/advertising: intentionally disabled/not configured in audited product paths; reconcile with final Xcode privacy report before answering store questions.
- Deletion: in-app account deletion removes owner cloud records before deleting Firebase Auth, then clears local profile state after remote success.

Do not submit until the final Xcode privacy report, linked SDK manifests/signatures, Firestore region, and App Store Connect labels are reconciled.
