# Shipping asset and license inventory

Status values: `VERIFIED`, `NOT_SHIPPED`, `BLOCKED`. A `VERIFIED` row includes inspectable evidence and a license/usage identifier.

| Asset/family | Status | License / right | Evidence | Shipping note |
| --- | --- | --- | --- | --- |
| Barlow | VERIFIED | SIL OFL-1.1 | https://github.com/jpt/barlow/blob/master/OFL.txt | Bundled through `@expo-google-fonts/barlow` |
| Barlow Condensed | VERIFIED | SIL OFL-1.1 | https://github.com/jpt/barlow/blob/master/OFL.txt | Same upstream family |
| MaterialCommunityIcons | VERIFIED | Apache-2.0 icons/fonts; package code license as upstream | https://github.com/Pictogrammers/pictogrammers.com/blob/main/docs/general/license.mdx | Used through `@expo/vector-icons`; do not use unlicensed brand/logo glyphs |
| MediaPipeTasksVision | VERIFIED | Apache-2.0 library | https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE | Native library linked by Formpath pose podspec |
| `pose_landmarker_lite.task` | BLOCKED | Exact model artifact license/provenance not independently recorded in repo | `modules/formpath-pose/ios/Resources/pose_landmarker_lite.task` | Must attach original download/source + model terms before shipping |
| CMU Graphics Lab Motion Capture Database | VERIFIED | Free for all uses; commercial-product inclusion allowed; direct resale prohibited | https://mocap.cs.cmu.edu/ and https://mocap.cs.cmu.edu/faqs.php | `lib/motions/cmu-shoot-01.json` is the anonymous product reference; retain attribution and do not sell dataset itself |
| App icon / splash / Android adaptive icon / favicon / `formpath-mark.svg` | BLOCKED | Project-owned/original-source provenance not independently documented | `app.config.ts`, `assets/images/` | Owner/source evidence required before App Store shipping |
| Named-player research JSON/reviews | NOT_SHIPPED | No product-rights claim | `lib/research/player-analysis-evidence.ts` + production-export CI grep | Research/history only; production routes have zero importer |
| React template logos | NOT_SHIPPED | Not used | repository reference search returned zero runtime/config references | Removed from branch before release checkpoint |

Because BLOCKED rows remain, `shippingLicensesCleared` must stay false in the manual release gate.
