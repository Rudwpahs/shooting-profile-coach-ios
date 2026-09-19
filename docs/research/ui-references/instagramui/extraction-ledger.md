# Extraction ledger

Upstream: `bhavnishkumar/InstagramUI`  
Locked snapshot: `master@b64437a0b1757c5ead6b08e9c1eb00e870e88b41`  
Extraction date: 2026-09-19 KST

## Rule for future sessions

**Check this ledger before accessing upstream.** `inspected` means the decision-relevant content was read and synthesized. `inventory-only` means the file/path was identified in the complete tree but its full content was not needed. `placeholder` means it was opened and confirmed to contain no meaningful implementation. Do not re-open any of these merely to repeat extraction.

Re-open upstream only when:

- upstream commit changed and the delta matters to the current request;
- an `inventory-only` file becomes specifically decision-relevant;
- a fresh licensing/provenance question requires evidence not captured here.

## Repository coverage

| Area/file | Status | What was established | Revisit? |
|---|---|---|---|
| Repository root README | inspected | Project purpose/features, 2022 clone, no license grant in README | Only if upstream HEAD changes or licensing question changes |
| Full recursive Git tree | inspected | Complete tree (`truncated:false`), exact SHAs, no LICENSE/COPYING file found | No for this locked snapshot |
| `Package.resolved` | inspected | SDWebImage 5.13.2; SDWebImageSwiftUI 2.0.2 | No |
| `InstagramUIApp.swift` | inspected | Splash entry + scene-phase handling | No |

## Feed coverage

| File | SHA | Status | Finding | Revisit? |
|---|---|---|---|---|
| `MVVM/View/FeedView.swift` | `7a9fd3fb06322b15d115ae40f844ed13845b0675` | inspected | Top bar, horizontal highlights, post list, banner feedback | No |
| `MVVM/View/PostCell.swift` | `12f3e6013126c2f339999476e15132844a025032` | inspected | Post anatomy; explicit Stephen Dowless “All rights reserved” header | No; provenance already captured |
| `MVVM/ViewModel/FeedViewModel.swift` | `f9ee93317128a485fad430fedebe29114bcc65c3` | inspected | Loads local Feed JSON | No |
| `MVVM/Model/FeedModel.swift` | `3f197dd7a1f758309674885945863466771d9f33` | inspected | Feed schema | No |
| `Helper/Feed.json` | `1119da35ab906f57faeabc80a38c04b22bcba9e1` | inventory-only | Demo local content; not suitable for product reuse | Only if exact demo data unexpectedly matters |

## Explore/Search coverage

| File | SHA | Status | Finding | Revisit? |
|---|---|---|---|---|
| `MVVM/View/SearchView.swift` | `72be03eaf76296e5daf5975cd7e52f2fbbf3f35a` | inspected | Search UI + compositional groups | No |
| `MVVM/View/Compositional Layout/Layout1.swift` | `50c494bf023e4efd30ac490da5e8facb6100edb6` | inspected | Tall-left + four squares | No |
| `.../Layout2.swift` | `3e5e3d47973f950ee9fd69e8b01859ad5f429eb0` | inspected | Three equal squares | No |
| `.../Layout3.swift` | `3b2dcf31e122e51b49d3fb33e7da1f664d089091` | inspected | Four squares + tall-right | No |
| `MVVM/ViewModel/SearchViewModel.swift` | `2bc330aa6f77e8280f8b23351fd9150d29e1063c` | inspected | Picsum fetch, 5/3-item grouping logic | No |
| `MVVM/Model/CardsModel.swift` | `32696e7c91af060edf1fc634c55fb5acc17bdf59` | inventory-only | Remote card model exists; schema not needed for UI decision | Only if exact schema matters |

## Profile coverage

| File | SHA | Status | Finding | Revisit? |
|---|---|---|---|---|
| `MVVM/View/ProfileView.swift` | `e1cf8c2ac40ab70bafeef86ae02664e5a8f27433` | inspected | Identity/stats/bio/actions/highlights/3-grid-tabs hierarchy | No |
| `MVVM/ViewModel/ProfileViewModel.swift` | `fa934a54836555a284e8140378410d6ec1c7eaca` | inspected | Local profile data + create menu options | No |
| `MVVM/Model/ProfileModel.swift` | `540161a7978578e45b8b766c6cbca91e7100adef` | inspected | Profile schema and follow state | No |
| `MVVM/View/EditProfileView.swift` | `dfc0b0ddcc434ac9d9c96c3fc55113a826dc9a93` | inventory-only | Editing screen exists; not load-bearing for current extraction | Only if edit-profile UX becomes the direct question |
| `Helper/Userdata.json` | `6e8a020c02fad5aeeb48060e4572b7c784414487` | inventory-only | Demo profile data | No unless exact fixtures matter |

## Explicitly completed placeholders

| File | SHA | Status | Finding | Revisit? |
|---|---|---|---|---|
| `MVVM/View/ReelsView.swift` | `f6abe216b8e144f36e27a24808d25e15592df029` | placeholder | Only `Text("Pending Work")` | **No** for this snapshot |
| `MVVM/View/NotificationView.swift` | `5e290eb87a1d565baeb39c39b60163e65be0395d` | placeholder | Only `Text("Pending Work")` | **No** for this snapshot |

## Shell/auth/theme/helpers

| File | SHA | Status | Finding | Revisit? |
|---|---|---|---|---|
| `MVVM/View/TabbarView.swift` | `f81344d3132c5565527197f7928c4cb8d1ad6d22` | inspected | Five-tab custom overlay shell | No |
| `MVVM/View/LoginView.swift` | `30c2f1644f7606fa98eb03fd8e3e4c213ab373bd` | inventory-only | Clone-specific login exists | Only for direct login-UX comparison |
| `MVVM/View/SpalshView.swift` | `532e7baec55f5b375c98cae98109ba57f60083cf` | inventory-only | Splash exists | Only for direct splash question |
| `Helper/ThemeHelper.swift` | `35b88a1a8e3fb6cf8d90c6678a7ed6c7bbb5ce3d` | inspected | Central dark/light colors; dated UIScreen trait approach | No |
| `Helper/Toast.swift` | `7368ff07787260056e81603b7d1ea33445925775` | inventory-only | Toast/banner helper exists | Only if exact transition/animation behavior becomes relevant |
| `Helper/AsyncImage.swift` | `da8319c330a76dd6a58e3a5111eb36b259411e35` | inventory-only | Swift remote-image helper | No for React Native Hoop Hub |
| `Helper/String + Extension.swift` | `9a3eda2e348d0993aa4a5241de46adc16cba4737` | inventory-only | Utility extension | No |
| `Persistence.swift` | `548bcb3eac74cf915da3a8d3cec417a8ce95b46d` | inventory-only | Core Data scaffold | No for extracted UI patterns |

## Assets/screenshots/tests

| Area | Status | Finding | Revisit? |
|---|---|---|---|
| `Assets.xcassets/**` | inventory-only | Full names/tree inventoried; includes Instagram/Meta logos and third-party-looking imagery; intentionally not adopted | No, except a dedicated provenance audit |
| `Screenshots/**` | inventory-only | Two screenshots exist; visual binary not required to recover source-defined patterns | Only for an explicit pixel/visual comparison |
| `InstagramUITests/**` | inventory-only | Unit-test target exists | Only for an upstream behavior/test question |
| `InstagramUIUITests/**` | inventory-only | UI-test target exists | Only for an upstream test-coverage question |
| Xcode workspace/userdata | inventory-only | Build/editor metadata | No |

## Hoop Hub comparison coverage

These current files were inspected to avoid proposing duplicate ports:

| Hoop Hub file | SHA at comparison time | Status |
|---|---|---|
| `app/(tabs)/explore.tsx` | `18cab058371664c011fdf40a797bb97a7ac3d2e5` | inspected |
| `app/(tabs)/profile.tsx` | `33abbf83a6b03540be7e37d001b916a1dc06fac1` | inspected |
| `app/(tabs)/index.tsx` | `c3b66707f75eedd5916c28053742f8c084a3c700` | inspected |
| `components/home/story-strip.tsx` | `601c52d1838f6a8b1f0670d2f2903962d70e646f` | inspected |
| `components/home/feed-card.tsx` | `86e86926c39598d4e4b5a5cb388e24f4f1d4c526` | inspected |
| `components/home/home-feed.tsx` | `d3efb7ab021abca15ca8d19a4a93bd5c7d253f3e` | inventory-confirmed |
| `app/reels.tsx` | `56491c324cdf54b867435839512dd2a5c38a01b5` | inventory-confirmed |

Future sessions should inspect the **current** Hoop Hub version if these SHAs have changed; they should still avoid re-extracting the locked upstream snapshot.

## Extraction completion criterion

For the purpose requested in this session, the extraction is durable when the following are committed together:

- source snapshot and exact SHAs;
- reusable pattern synthesis;
- current Hoop Hub implementation mapping;
- licensing/provenance constraints;
- this coverage ledger;
- machine-readable manifest.

That set is designed so a future session can resume from the archive rather than crawling the same upstream material again.