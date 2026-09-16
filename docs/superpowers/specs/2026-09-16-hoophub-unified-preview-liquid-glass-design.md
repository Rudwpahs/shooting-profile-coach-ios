# Hoop Hub Unified Preview + Liquid Glass Design

Date: 2026-09-16
Status: Design approved in principle; implementation not started
Base: `main` @ `6564b3010ead7da68bc7775d50b45a253aba88b8`

## 1. Purpose

Build one public, install-free Hoop Hub web experience that behaves like the real app instead of a collection of `?screen=` showcase pages, while introducing a medium-strength Liquid Glass visual system across both the web preview and the real iPhone app.

The result must preserve Hoop Hub's Graphite / Volt identity, skeleton-first visual hierarchy, existing app navigation, current privacy boundaries, and production-isolation guarantees.

## 2. User-approved product decisions

The following decisions are fixed for this design:

- Apply the work to both the public web preview and the real iPhone app.
- Use medium-strength Liquid Glass: clearly visible depth/refraction/glare on floating controls, but never strong enough to compete with motion/skeleton content.
- The public web experience behaves like the real app. No developer showcase side panel or screen picker is visible to users.
- The public web experience is fully explorable without sign-in, using synthetic preview data only.
- The web preview starts at the normal Hoop Hub Home flow and supports real navigation between Home, Explore, Capture, Reels, Analysis, and Profile.
- Existing `?screen=` demo states may remain as hidden QA/automation entry points but are not the primary user experience.

## 3. Architecture choice

### 3.1 Use the real router, not a duplicate showcase app

The preview reuses the existing Expo Router application and real screen components. It does not create a second web-only UI implementation.

A build-time preview runtime is injected only when `EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1"`. This runtime supplies synthetic auth, profile, representative motion, analysis, and capture-completion state through controlled provider boundaries.

Normal production builds continue to use the existing Firebase/auth/profile/capture paths and must not include preview fixture payloads.

### 3.2 Preview runtime boundary

Introduce a narrow preview runtime abstraction rather than sprinkling `if (preview)` checks across screens.

Recommended shape:

- `lib/preview/preview-runtime.ts`
  - pure mode detection and public runtime types
- `lib/preview/preview-runtime-provider.tsx`
  - provider selected at the app root only in preview builds
- `lib/preview/preview-runtime-fixtures.ts`
  - synthetic fixture factory, loaded behind a build-time-foldable gate
- `lib/preview/preview-session-state.ts`
  - in-memory session state so capture completion can update Home/Profile during the browser session

The runtime should expose only the data/actions the UI needs, for example:

- synthetic signed-in identity for preview builds
- representative profiles / summaries
- anonymous reference motions
- analysis profile lookup
- capture simulation state and save-completion action
- reset-preview-session action for tests only

The real application must not depend on preview fixture types directly.

### 3.3 Root behavior

For GitHub Pages preview builds, the repository root URL renders the real Hoop Hub Home route immediately. The user does not need `/dev/ui-demo` or query parameters.

The existing `/dev/ui-demo` route remains available for deterministic QA screenshots and contract tests.

## 4. Liquid Glass design system

### 4.1 One cross-platform component contract

Create a single product-facing abstraction:

- `components/glass/glass-surface.tsx` or platform-specific siblings
- `components/glass/glass-surface.ios.tsx`
- `components/glass/glass-surface.web.tsx`
- optional shared `lib/glass/glass-tokens.ts`

Product screens import `GlassSurface`; they do not know whether the implementation is native iOS glass, WebGL/CSS web glass, or fallback Graphite.

Suggested props stay small:

- `variant`: `bar | chip | button | panel`
- `intensity`: fixed to product presets, not free-form knobs
- `interactive`: whether the native surface should react to interaction
- `tint`: semantic product tint only
- regular `style`, children, accessibility props

No generic studio control panel ships in Hoop Hub.

### 4.2 iOS implementation

Use the already-installed `expo-glass-effect` package.

On iOS 26+ when `isLiquidGlassAvailable()` is true:

- use native `GlassView`
- use clear/regular glass styles according to the product preset
- enable interactive behavior only on controls where it improves tactile feedback

On unsupported iOS versions or platforms, `GlassSurface` falls back to the Graphite translucent surface described below.

The design must not hard-depend on native glass availability for readability or input handling.

### 4.3 Web implementation derived from liquid-glass-studio

Source reference: `iyinchao/liquid-glass-studio` (MIT License, copyright Charles Yin).

Do not import the whole studio application, Leva controls, Vite shell, MUI dependencies, or its editor architecture.

Adapt only the concepts/code required for a lightweight Hoop Hub web renderer:

- refraction around the glass edge
- subtle Fresnel-style highlight
- restrained glare
- blurred/tinted background contribution
- superellipse-compatible rounded shapes

The upstream project uses WebGL2/WebGPU multipass rendering with Gaussian blur and custom shaders. Hoop Hub should not reproduce the entire engine. The web implementation should be reduced to the smallest renderer that can support a handful of floating glass surfaces on a mobile-size app viewport.

Any substantial copied shader/function code must:

- retain the upstream MIT copyright/license notice in an attribution file or source header
- be documented in `THIRD_PARTY_NOTICES.md` (create if absent)
- name the upstream repository and exact source file(s) used

### 4.4 Web fallback tiers

Web glass degrades safely:

1. WebGL2 lightweight refraction renderer when supported and performant.
2. CSS/backdrop-filter approximation when WebGL2 is unavailable, disabled, or too expensive.
3. Graphite translucent fallback with border/highlight when backdrop filtering is unavailable.

The product remains usable at tier 3.

### 4.5 Medium-strength visual preset

The approved "B" intensity means:

- glass is obvious on floating chrome
- distortion/refraction remains near edges and never warps skeleton joints or text heavily
- glare is soft and localized
- tint stays neutral/Graphite with restrained Volt accent use
- labels/icons always meet contrast targets
- motion content remains visually dominant

No rainbow-heavy dispersion, exaggerated blob merging, or demo-style optical distortion in production UI.

## 5. Surface application matrix

### Apply Liquid Glass

- bottom tab bar container
- central Capture action in the tab bar
- TopBar floating/overlay variants where they sit over content
- Reels close control
- Reels view selector chips
- Reels Analysis action
- paused play indicator
- Capture primary floating controls and mode/select actions where they overlay camera/stage content
- modal/sheet chrome introduced by these flows
- selected small floating actions where glass improves depth hierarchy

### Keep solid/non-glass

- skeleton renderer and motion glyphs
- shooting video/media content
- analysis charts/evidence body
- text-heavy information cards
- progress line
- large scrolling page backgrounds
- destructive/critical confirmation surfaces if glass harms clarity

## 6. Navigation and preview data flow

### 6.1 Primary public flow

Public Pages root:

Home
→ tap motion preview
→ Reels at selected item
→ Analysis
→ back to same Reel/frame
→ back to Home context

Bottom tabs:

Home ↔ Explore ↔ Profile

Capture button:

Home/tab Capture action
→ Capture setup
→ collecting simulation
→ review
→ save
→ synthetic representative motion is added to the preview session
→ Home/Profile immediately reflect the new synthetic result

No real camera, Firebase write, account creation, or user upload occurs in the public preview.

### 6.2 Preview persistence

Use in-memory state for the first implementation. A refresh resets to canonical synthetic fixtures.

Do not persist synthetic preview data to AsyncStorage, Firebase, cookies, or server storage unless a later requirement explicitly asks for it.

## 7. Production isolation and privacy

The existing preview isolation guarantee remains non-negotiable.

Ordinary production export must not contain identifiable preview fixture markers or fixture payloads.

Required controls:

- fixture module loaded only behind build-time-foldable preview gates
- production export grep/isolation test extended to new fixture markers
- no raw user video in preview fixtures
- no fake social counts/users/messages
- no hidden Firebase writes during preview mode
- no preview mode path that can authenticate as a real user

Synthetic preview mode must be obvious in code and test fixtures, but does not need a prominent user-facing "demo" banner unless required to avoid misunderstanding.

## 8. Accessibility and motion

- Respect Reduce Motion: no decorative spring/refraction animation that depends on motion for comprehension.
- Respect native/OS transparency reduction where available; otherwise provide an app-level fallback trigger when the platform signal is not exposed.
- Glass surfaces preserve 44pt minimum touch targets already used by the app.
- Text and icon contrast is tested over worst-case bright and dark backgrounds.
- Focus/VoiceOver semantics remain on the control, not on a decorative glass renderer.
- Decorative canvas/WebGL layers are hidden from accessibility APIs and never intercept pointer events.

## 9. Performance constraints

### iOS

Native `expo-glass-effect` is preferred where available. Avoid nesting many glass views or placing continuously changing content inside large glass regions.

### Web

- target one shared renderer or a small bounded number of canvases, not one heavyweight WebGL context per button
- glass effects are limited to visible chrome
- pause/disable expensive glass updates when the page is backgrounded
- provide CSS fallback for low-power/mobile browsers
- no shader work runs for offscreen demo states
- Reels playback and skeleton animation retain priority over decorative glass

A performance regression that causes dropped Reels frames is a release blocker for the glass work.

## 10. Testing strategy

### Pure/unit tests

- preview build detection
- preview session reducer/state transitions
- capture simulation adds one synthetic representative result
- fallback selection for iOS glass availability / web renderer capability
- glass preset mapping

### UI contract tests

- public preview root opens Home without sign-in
- Home → Reels selected item
- Reels → Analysis → back same item
- tab navigation works in preview mode
- Capture simulation completes and updates Home/Profile
- no developer showcase selector is rendered
- glass surfaces wrap only approved chrome
- skeleton/media/analysis body remain non-glass

### Production isolation

Extend the existing GitHub Pages workflow test to verify:

- ordinary production export excludes preview fixtures and preview runtime payloads
- preview build includes the required synthetic runtime
- Pages root emits a usable entry point
- `/dev/ui-demo` deterministic QA route still emits

### Visual QA

Required widths:

- 375
- 390
- 430

Required states:

- Home
- Explore
- Profile
- Capture setup
- Capture collecting/review
- Reels playing
- Reels paused
- Analysis

For glass QA, capture at least one dark, one mixed, and one bright background under the glass controls and verify readability/refraction restraint.

## 11. Rollout plan

Implement in four internal stages on one work branch, each independently testable:

1. Preview runtime + public root navigation with no visual redesign.
2. Cross-platform `GlassSurface` abstraction + Graphite fallback.
3. iOS native Liquid Glass application to approved chrome.
4. Web lightweight liquid-glass-studio-derived renderer + final visual/performance QA.

Do not mix preview-runtime correctness debugging with shader debugging in the same first commit.

## 12. Protected areas / non-goals

Do not change unless a concrete blocking reason is documented first:

- reconstruction math
- two-view / 3D fusion
- Representative 4D analysis thresholds
- capture acceptance/yaw protocol
- MotionPacket
- Coach API
- Firestore Rules
- privacy contracts
- feature rollout gates
- Reels playback semantics already merged in v1

Non-goals for this project:

- Lift Subject / segmentation
- Motion Lift changes
- social likes/comments/followers/DM
- a user-facing Liquid Glass parameter editor
- importing the entire liquid-glass-studio app
- changing Hoop Hub from Graphite/Volt to Apple's visual identity

## 13. Acceptance criteria

The work is complete only when all are true:

1. One public Pages URL opens the real Hoop Hub Home experience without sign-in.
2. Home, Explore, Capture, Reels, Analysis, and Profile can be reached through app-like navigation.
3. Preview mode uses synthetic data only and never writes to Firebase.
4. Capture can be simulated through completion and updates the session's Home/Profile state.
5. Existing deterministic `/dev/ui-demo` QA states remain available.
6. Bottom tab bar uses Liquid Glass at the approved medium intensity on supported iOS and web.
7. Reels floating chrome uses Liquid Glass without reducing skeleton readability.
8. Capture floating controls use Liquid Glass without changing capture state-machine behavior.
9. iOS uses native `expo-glass-effect` when available and a Graphite fallback otherwise.
10. Web uses a lightweight liquid-glass-studio-derived refraction/glare implementation when supported and a safe fallback otherwise.
11. Any copied upstream shader/function code carries MIT attribution and third-party notice.
12. Reduce Motion / transparency fallbacks remain usable.
13. No approved non-glass content surface is accidentally glassified.
14. Reels active-item-only playback and paging tests remain green.
15. Ordinary production export contains no synthetic preview fixtures/runtime payloads.
16. Typecheck, lint, full unit tests, Firestore Rules tests, Representative 4D regressions, preview tests, and Expo web export are green.
17. 375/390/430 visual QA passes.
18. GitHub Pages deploy succeeds from `main` after owner-approved merge.

## 14. Implementation branch policy

This design/spec branch is not production code and must not be merged into `main` as an implementation shortcut.

After this spec is reviewed, create the implementation plan with Superpowers `writing-plans`, then implement on `work/hoophub-unified-preview-liquid-glass` (or a clean successor branch if the design branch is kept separate). Use TDD and verification-before-completion. Do not merge to `main` without owner approval.
