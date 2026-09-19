# Source map — bhavnishkumar/InstagramUI

Snapshot: `master@b64437a0b1757c5ead6b08e9c1eb00e870e88b41`  
Verified: 2026-09-19 KST

This is a role map, not a source-code mirror. File SHAs are preserved so a future session can tell exactly what was inspected without opening upstream again.

## Repository-level facts

- Language: Swift.
- Architecture label: MVVM.
- Main app data for feed/profile comes from bundled JSON.
- Explore data comes from `https://picsum.photos/v2/list?page=2&limit=60`.
- Remote-image dependency: SDWebImage `5.13.2` and SDWebImageSwiftUI `2.0.2`.
- Repository root tree at this snapshot contains no `LICENSE`, `LICENSE.md`, or `COPYING` file.
- README advertises local JSON data, dark mode, dropdown menu, custom theme, compositional Search layout, and slide/page interactions.

## Entry and shell

| Upstream file | SHA | Role | Extraction value |
|---|---|---|---|
| `InstagramUI/InstagramUIApp.swift` | `40439639056ba36a41653afa6ab18f8d0f8651e4` | SwiftUI app entry; opens splash and observes scene phase | Low |
| `InstagramUI/MVVM/View/TabbarView.swift` | `f81344d3132c5565527197f7928c4cb8d1ad6d22` | Five-tab shell: Feed, Search, Reels, Notifications, Profile; custom bottom overlay | Medium: IA only |
| `InstagramUI/MVVM/View/SpalshView.swift` | `532e7baec55f5b375c98cae98109ba57f60083cf` | Splash flow | Low |
| `InstagramUI/MVVM/View/LoginView.swift` | `30c2f1644f7606fa98eb03fd8e3e4c213ab373bd` | Clone-specific login UI | Low |

## Feed

| Upstream file | SHA | Role | Extraction value |
|---|---|---|---|
| `InstagramUI/MVVM/View/FeedView.swift` | `7a9fd3fb06322b15d115ae40f844ed13845b0675` | Top bar + horizontal highlights + post list + feedback banner | High pattern value |
| `InstagramUI/MVVM/View/PostCell.swift` | `12f3e6013126c2f339999476e15132844a025032` | Post header, image stage, like/comment/share/save action row, likes/caption/time | High anatomy value, **do not copy code** |
| `InstagramUI/MVVM/ViewModel/FeedViewModel.swift` | `f9ee93317128a485fad430fedebe29114bcc65c3` | Loads bundled `Feed.json` into feed/highlight collections | Medium |
| `InstagramUI/MVVM/Model/FeedModel.swift` | `3f197dd7a1f758309674885945863466771d9f33` | `Feed` entity: id, username, caption, image URL, location | Medium: schema concept |
| `InstagramUI/Helper/Feed.json` | `1119da35ab906f57faeabc80a38c04b22bcba9e1` | Demo feed/highlight content | No production reuse |

Useful abstraction: a feed item is `identity/meta + visual stage + actions + caption`. Hoop Hub should substitute `shooter/session + skeleton/video/analysis stage + analyze/save/share actions + coaching caption`.

## Explore / Search mosaic

| Upstream file | SHA | Role | Extraction value |
|---|---|---|---|
| `InstagramUI/MVVM/View/SearchView.swift` | `72be03eaf76296e5daf5975cd7e52f2fbbf3f35a` | Search field + scroll of alternating layout groups | High |
| `.../Compositional Layout/Layout1.swift` | `50c494bf023e4efd30ac490da5e8facb6100edb6` | One tall tile left + four square tiles right | High |
| `.../Compositional Layout/Layout2.swift` | `3e5e3d47973f950ee9fd69e8b01859ad5f429eb0` | Three equal square tiles | High |
| `.../Compositional Layout/Layout3.swift` | `3b2dcf31e122e51b49d3fb33e7da1f664d089091` | Four square tiles left + one tall tile right | High |
| `InstagramUI/MVVM/ViewModel/SearchViewModel.swift` | `2bc330aa6f77e8280f8b23351fd9150d29e1063c` | Fetches 60 Picsum cards and chunks them into 5- or 3-card groups based on group index | Medium |
| `InstagramUI/MVVM/Model/CardsModel.swift` | `32696e7c91af060edf1fc634c55fb5acc17bdf59` | Remote card model | Low |

Framework-neutral pattern: repeat `(feature-left 5 items) → (equal 3 items) → (feature-right 5 items)` or a product-specific variation. Keep aspect-ratio logic responsive rather than copying `UIScreen.main.bounds` constants.

## Profile

| Upstream file | SHA | Role | Extraction value |
|---|---|---|---|
| `InstagramUI/MVVM/View/ProfileView.swift` | `e1cf8c2ac40ab70bafeef86ae02664e5a8f27433` | Header, avatar/stats, bio/link, dynamic actions, horizontal highlights, three grid tabs, edit navigation, toast | High IA value |
| `InstagramUI/MVVM/View/EditProfileView.swift` | `dfc0b0ddcc434ac9d9c96c3fc55113a826dc9a93` | Profile editing form | Medium/low |
| `InstagramUI/MVVM/ViewModel/ProfileViewModel.swift` | `fa934a54836555a284e8140378410d6ec1c7eaca` | Loads profile JSON and defines creation menu entries | Medium |
| `InstagramUI/MVVM/Model/ProfileModel.swift` | `540161a7978578e45b8b766c6cbca91e7100adef` | User identity, bio/link, counts, highlights, follow state | Medium: domain-shape inspiration only |
| `InstagramUI/Helper/Userdata.json` | `6e8a020c02fad5aeeb48060e4572b7c784414487` | Demo profile data | No production reuse |

Framework-neutral profile sequence worth retaining: `hero/identity → stats → context/bio → primary action(s) → highlight rail → content grid`. Hoop Hub should use shooting identity and private/public contracts rather than follower vanity metrics by default.

## Placeholder views

| File | SHA | Finding |
|---|---|---|
| `InstagramUI/MVVM/View/ReelsView.swift` | `f6abe216b8e144f36e27a24808d25e15592df029` | Only renders `Pending Work`; no reusable Reels implementation exists. |
| `InstagramUI/MVVM/View/NotificationView.swift` | `5e290eb87a1d565baeb39c39b60163e65be0395d` | Only renders `Pending Work`; no reusable notification implementation exists. |

Future sessions should **not** inspect these two files again unless upstream commit changes.

## Helpers

| File | SHA | Role | Value |
|---|---|---|---|
| `InstagramUI/Helper/ThemeHelper.swift` | `35b88a1a8e3fb6cf8d90c6678a7ed6c7bbb5ce3d` | Simple dark/light color switch with multiple theme variants | Concept only; implementation is outdated |
| `InstagramUI/Helper/Toast.swift` | `7368ff07787260056e81603b7d1ea33445925775` | Banner/toast feedback | Pattern only |
| `InstagramUI/Helper/AsyncImage.swift` | `da8319c330a76dd6a58e3a5111eb36b259411e35` | Remote image helper | No need in current React Native stack |
| `InstagramUI/Helper/String + Extension.swift` | `9a3eda2e348d0993aa4a5241de46adc16cba4737` | String utility helpers | Not relevant to extracted UI direction |
| `InstagramUI/Persistence.swift` | `548bcb3eac74cf915da3a8d3cec417a8ce95b46d` | Core Data scaffold | Not relevant to useful reference flows |

## Assets

The tree contains Instagram/Meta logos, tab icons, profile/highlight imagery, and assorted post images. Treat all upstream assets as **reference-only / non-reusable**. Hoop Hub should continue to use its own icon set, skeleton renderer, tokens, and user-owned/lawful media.

## Tests

Upstream contains unit/UI test targets, including `FeedViewModel_UnitTest.swift` and UI tests. They do not materially add to the UI extraction and are not needed to reproduce the identified patterns in Hoop Hub.

## Dependency snapshot

From `Package.resolved`:

- `SDWebImage` `5.13.2`
- `SDWebImageSwiftUI` `2.0.2`

Do not add either dependency to Hoop Hub solely because the reference uses it; Hoop Hub is React Native and already has its own rendering/data path.