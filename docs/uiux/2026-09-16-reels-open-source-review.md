# Reels v1 — open-source review (2026-09-16)

Branch `work/hoophub-reels-v1`. Before designing the Reels interaction model, six repositories were
opened and their actual source read (file trees through the GitHub API, files through raw
GitHub, licenses through the repository sidebar and the tree). This record lists, per repository:
the exact repository, the files inspected, the license, the ideas adopted, the ideas rejected, and
whether any source is reused.

**Result: no source code from any of the six repositories is copied into Hoop Hub.** Three of the
four Instagram clones carry no license at all (all rights reserved by default), the fourth is
GPL-3.0 (copyleft, incompatible with this app), and the two segmentation projects are permissively
licensed but are Python runtimes that do not fit an on-device React Native app. Only interaction
patterns and pipeline shapes are taken.

## Instagram UI / Reels UX references

| Repository | Files inspected | License | Adopted idea | Rejected idea | Direct code reuse |
| --- | --- | --- | --- | --- | --- |
| `iliaxp/Instagram-UI-Kotlin-SocialDesign` (Kotlin, Jetpack Compose) | `ui/screen/SocialDesignApp.kt`, `ui/screen/SingleStoryView.kt`, `ui/screen/HomeScreen.kt`, `ui/component/PostsView.kt`, `ui/component/BottomNavigationBar.kt` | GPL-3.0 (`LICENSE.txt`) | Route-based immersion: `fullScreenRoutes` hides both the top and the bottom bar when the current route is a full-screen one. Entering detail at the tapped index (`postDetail/{startIndex}`). | Fixed 240 dp media height with `FillBounds` (distorts); five-tab bar; the story viewer is unfinished (gesture imports unused, no timer, no paging). | **No.** GPL-3.0 would place the whole app under copyleft. Ideas and structure only. |
| `manish-850/instagram-ui` (vanilla HTML/CSS/JS) | `script.js`, `index.html` | None shown, no LICENSE file | A preview growing into the full-screen surface (`#full-screen` scaled 0 → 1); resetting playback on close (`pause()` and `currentTime = 0`); loop autoplay in the viewer. | No swipe paging, no active-item management, no tap-to-pause; a five-second like animation; volume chrome. | **No.** Unlicensed: idea/reference only, no source copying. |
| `bhavnishkumar/InstagramUI` (SwiftUI, MVVM) | `MVVM/View/ReelsView.swift`, `MVVM/View/TabbarView.swift`, `MVVM/View/FeedView.swift` | None shown, no LICENSE file | A custom 50 pt bar overlaid on `TabView` with the system navigation bar hidden on every tab. | `ReelsView` is a `Text("Pending Work")` stub: nothing to learn about reels. Feed cells have an empty action. | **No.** Unlicensed: idea/reference only, no source copying. |
| `Mbouziani/Instagram_CloneUI-Flutter` (Flutter) | `lib/Screens/Reel_Screen.dart`, `lib/Screens/navigator.dart`, `lib/Screens/Home_Screen.dart` | None shown, no LICENSE file | Vertical `PageView.builder`, one item sized to the viewport; `Stack` overlay order (media → bottom gradient caption → right action column → top title); `AppBar` removed only on the Reels tab; `IndexedStack` keeps tab state alive. | Static `NetworkImage` reels (no playback, no active-item rule, no tap pause); `SafeArea` wrapping the media itself instead of the chrome. | **No.** Unlicensed: idea/reference only, no source copying. |

### Patterns that repeat across the clones (adopted)

1. Immersive routes hide the app chrome; Reels is a route outside the tab navigator, so the tab bar
   and the top bar are absent by construction.
2. One item per viewport with native vertical paging; a swipe moves exactly one item.
3. Overlay hierarchy: motion full-bleed, one label plus one line at the bottom-left, a small action
   rail at the bottom-right, small controls at the top; the centre of the stage stays clear.
4. Enter full-screen from a preview at the tapped index; leave with back and return to where you were.
5. Reset or hold playback deliberately on leave; never let an unseen item keep animating.

### Patterns none of the clones implement (Hoop Hub keeps its own)

Active-item playback management, tap to pause and resume from the same frame, accessibility
equivalents (adjustable element, Reduce Motion, background pause). These come from the earlier
Hoop Hub Reel harness on `work/claude-hoop-hub-product-ui` (`components/feed/reel-feed.tsx`,
`lib/feed/reel-feed-state.ts`), which is ported selectively onto current `main`, not merged.

### Explicitly not copied

Instagram logo, Meta branding, proprietary icons and assets, colour and layout trade dress, and any
fake social data (likes, comments, followers, shares, DMs, saved counts). Interaction model ≈
Instagram Reels; visual identity = Hoop Hub (Graphite / Volt, skeleton identity, system
typography, semantic tokens).

## Lift Subject references (investigation only; not implemented in this branch)

Terminology: **Motion Lift** is the existing skeleton-manipulation gesture (hold a paused figure,
turn it, keep a pose). **Lift Subject** is the future separation of the player from the background
in a frame. They are different features and must not share a name in code.

| Repository | Files inspected | License | Adopted idea | Rejected idea | Direct code reuse |
| --- | --- | --- | --- | --- | --- |
| `danielgatis/rembg` (Python) | `rembg/bg.py`, `rembg/sessions/base.py`, `rembg/sessions/u2net_human_seg.py`, `pyproject.toml`, release assets of `v0.0.0` | MIT (`LICENSE.txt`) | Pipeline shape only: one session per model, `normalize → predict → mask post-process (opening + gaussian) → composite`, with alpha matting as an optional refinement step behind thresholds. A person-specific model (`u2net_human_seg`, 320×320 input) is the right class of model for a single dominant shooter. | Running it anywhere near the app: Python 3.11, onnxruntime, pymatting, scipy and scikit-image are not embeddable in React Native; `u2net_human_seg.onnx` is 167.8 MB, the default `bria-rmbg-2.0.onnx` 977.1 MB, `u2netp.onnx` 4.4 MB; a server would need the raw frame uploaded, which the privacy boundary forbids. | **Permitted by MIT but not used.** No dependency, model or runtime added. |
| `facebookresearch/segment-anything` (Python, PyTorch) | `segment_anything/predictor.py`, `segment_anything/utils/onnx.py`, `demo/src/components/helpers/onnxModelAPI.tsx`, `README.md` | Apache-2.0 (`LICENSE`) | Promptable masks (point or box prompts on a cached image embedding) match a future "tap the player to lift" gesture; the decoder-only ONNX export (15.7 MB, quantised 8.3 MB) shows how a light decoder can run client-side. | The image encoder (`set_image`: resize to 1024, ViT once per frame) is the expensive step and must run on a server or a desktop GPU: ViT-B encoder ONNX 342.7 MB (quantised 103.8 MB), ViT-L 1,177.4 MB. Off-device encoding means the frame leaves the device. General segmentation is more than a single-person cutout needs. | **Permitted by Apache-2.0 but not used.** No dependency, model or runtime added. |

### Future candidate (recorded, not built)

For an iOS app that already ships a native Swift module (`modules/formpath-pose`), the realistic
Lift Subject path is the platform's own person-segmentation request (Vision framework, on the
Neural Engine, offline, no model download, no frame upload). It is not implemented in this branch;
this note only records the option so the Reel stage's layer order (media → future subject cutout →
skeleton → interaction → chrome) leaves room for it without an abstraction being built now.

## How the review shaped Reels v1

- Reels is a stack route outside `(tabs)`: no tab bar, no top bar, safe areas kept.
- The feed is a paged vertical list with exactly one active item; neighbours hold a still; the rest
  hold nothing (ported concept from the earlier harness, re-implemented on current `main`).
- Tap pauses and resumes from the same frame; a small play indicator appears only while paused.
- A thin progress line sits at the bottom, above the home indicator.
- The view selector is a small chip row, not a player control; the analysis action is a small rail
  button that opens the existing analysis route and returns to the same Reel.
- Nothing social is faked.
