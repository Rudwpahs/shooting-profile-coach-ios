# App Store privacy questionnaire working sheet

Use this only as a draft reconciliation aid; final answers must be checked against the exact archive and production Firebase project.

- Account data: email + Firebase UID for authentication; linked to the user; app functionality; Firebase Authentication processes in the United States.
- User content / fitness-style derived motion data: owner-private normalized pose/profile records may be stored in Cloud Firestore when the user explicitly saves; linked by UID; app functionality; Firestore production region is currently BLOCKED pending project evidence.
- Raw shooting video (default build): selected/captured and analyzed locally; product code does not upload raw video, and the ordinary bundle contains no upload path (CI greps the production export for it).
- Raw shooting video (only if the archive was built with `EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1=1`; default is off): footage the user keeps without pose analysis ("내 영상") is uploaded to owner-private Firebase Storage **only for the shots where the user turned on "클라우드에도 보관"**; linked by UID; app functionality; no file name or EXIF is stored; never used for tracking. If the submitted archive has this flag on, the store answers must declare user video content as collected and linked to the user, and the Storage bucket region must be recorded like the Firestore region. Confirm which case applies from the exact archive's build environment before answering.
- Tracking/advertising: intentionally disabled/not configured in audited product paths; reconcile with final Xcode privacy report before answering store questions.
- Deletion: in-app account deletion removes owner cloud records before deleting Firebase Auth, then clears local profile state after remote success. Every build, whatever the cloud film-shot flag, also erases the owner's cloud film shots (objects and documents) before the Auth user is deleted; a failure there aborts the deletion.

Do not submit until the final Xcode privacy report, linked SDK manifests/signatures, Firestore region, and App Store Connect labels are reconciled.
