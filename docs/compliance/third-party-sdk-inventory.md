# Hoop Hub third-party SDK inventory

Release evidence inventory for the current Expo SDK 54 branch. A package being present does not by itself mean it collects data; rows distinguish repository facts, vendor facts, and release-time unknowns.

| Provider / package | Version / source | Product purpose | Data/network boundary | Linked to user / tracking | Retention/deletion | Release verification |
| --- | --- | --- | --- | --- | --- | --- |
| Firebase Authentication | Firebase JS `12.18.0` | email/password account identity | Email and Firebase UID are sent to Firebase Authentication. Vendor documentation states this service processes data exclusively in the United States: https://firebase.google.com/support/privacy | Linked to account; no app tracking use | Until account deletion; in-app delete calls Firebase `deleteUser` after owner data cleanup | Source behavior verified; App Store privacy-label reconciliation BLOCKED until final archive/release review |
| Cloud Firestore | Firebase JS `12.18.0` | owner-private derived shooting profiles | Only allowlisted derived owner data is written under `/users/{uid}/...`; raw shooting video is not uploaded by this app | Linked by Firebase UID; no app tracking use | Owner-deleted V2 flow and account deletion remove stored owner records | Storage/processing region: BLOCKED — verify production project |
| MediaPipeTasksVision 0.10.21 | `modules/formpath-pose/ios/FormpathPose.podspec` | on-device pose landmark inference | Native pose inference is local; no app-implemented MediaPipe cloud upload | Not used for tracking | Raw video stays local; derived allowlisted data may separately be saved to Firestore | Pod privacy manifest/signature and exact bundled model provenance must be checked in final Xcode archive |
| ExpoModulesCore | Expo SDK 54 / `expo-modules-core ~3.0.29` | native bridge/runtime | No independent product data transfer established by repository evidence | Not classified as tracking solely because linked | N/A | Final linked-SDK privacy manifests BLOCKED until Xcode archive report |
| expo-image-picker | `~17.0.11` | choose/capture shooting video | Accesses camera/photo library after OS permission; selected raw video is analyzed locally and is not uploaded by product code | Not tracking | Local media lifecycle controlled by OS/user; app does not persist raw video to cloud | Purpose strings and runtime usage source-verified |
| expo-secure-store | `~15.0.8` | local secure key/value capability | Local device secure storage; no independent network transfer established | Not tracking | Device/local lifecycle | Confirm whether any release path uses it during final dependency audit |
| @react-native-async-storage/async-storage | `^2.2.0` | local profile preferences | Local device storage only | Local profile values; not tracking | `clearProfile()` removes app profile storage | Source-verified |
| expo-video | `~3.0.15` | local video playback/preview | Product shooting clips are consumed locally | Not tracking | No app cloud retention from this package | Archive manifest review required if linked SDK declares privacy data |

## Release rule

No row marked BLOCKED may be converted to PASS from source inspection alone. Final IPA/Xcode privacy report, App Store Connect privacy labels, SDK manifests/signatures, and the production Cloud Firestore region require release evidence.
