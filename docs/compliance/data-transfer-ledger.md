# Hoop Hub data-transfer ledger

| Data class | Source → recipient | Location knowledge | Purpose | Retention / deletion | Evidence state |
| --- | --- | --- | --- | --- | --- |
| Account email + Firebase UID | App → Firebase Authentication | **United States**. Firebase states Authentication is run only from US data centers: https://firebase.google.com/support/privacy | Account creation/sign-in/reauthentication/deletion | Account lifecycle; in-app account deletion removes Auth principal | VERIFIED vendor fact + repository wiring |
| Owner-private derived shooting profile | App → Cloud Firestore | **BLOCKED — verify production project**. Firestore supports configured data locations but this repository does not prove the production database location | Private shooting-profile persistence | Owner deletion; account deletion removes V2 and legacy owner records | Repository data boundary verified; production region unknown |
| Raw shooting video | Camera/photo library → on-device app/MediaPipe | No app cloud transfer | Local pose inference | Not uploaded by product code | Repository source contract |
| Allowlisted normalized pose observations | Local inference → Cloud Firestore when user saves | Same Firestore blocker above | Owner-private profile history | Until owner deletes profile/account | Repository rules and save copy |
| Local profile preferences | App → AsyncStorage | Device local | Goals/self-assessed profile | Cleared by `clearProfile()` | Repository source |

Tracking/advertising transfer: none intentionally configured in the audited dependency/product paths. This statement must be reconciled with the final Xcode privacy report and App Store privacy labels before release.
