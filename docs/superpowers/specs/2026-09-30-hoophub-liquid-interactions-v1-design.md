# HoopHub Liquid Interaction System v1 — Design Spec

## Status
Approved design direction. This document defines the architecture and staged delivery boundaries for the HoopHub Liquid Interaction / Glass Rendering system. Product implementation starts only after this spec is reviewed.

Base branch: `work/hoophub-film-phase-space-v1`

Implementation branch: `work/hoophub-liquid-interactions-v1`

Base commit: `497bd6d6ed44b9c68fad5b3b6c741440ce995006`

## Product intent
HoopHub should feel like a responsive physical object rather than a collection of flat controls. Buttons, selectors, menus, glass panels, and navigation surfaces should exhibit controlled liquid, spring, and optical behavior while preserving current basketball-analysis functionality.

The visual language must remain useful rather than ornamental: interaction feedback should clarify selection, navigation, depth, and state changes. Motion/Phase/Film analysis performance always takes priority over decoration.

The web preview is also a product-verification surface. It must behave like a signed-in app experience without requiring Firebase authentication or an installed native app.

## Non-negotiable constraints
- Do not change Firestore schema, rules semantics, or server persistence contracts for this feature.
- Do not upload raw video to the server.
- Preserve Motion, Phase Space, Film Space, and existing fallbacks.
- Preserve evidence boundaries: no visualization may imply measured physical 3D/4D when the underlying data does not support that claim.
- Production authentication behavior remains unchanged.
- Synthetic signed-in state is allowed only inside the explicit web preview/demo build.
- Prefer existing dependencies: `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`, `expo-glass-effect`.
- Do not introduce a heavy shader/game-engine dependency in v1 unless a later measured performance gap proves it necessary.
- Respect reduced-motion accessibility settings.
- Decorative rendering must degrade safely when blur/glass/filter capabilities are unavailable.
- One implementation slice per work session. Do not combine multiple major slices into one session unless the user explicitly changes this rule.

## Architecture
The system is a reusable UI layer rather than screen-specific animation code.

### 1. Interaction primitives
#### `LiquidPressable`
Shared press/hover/touch primitive providing spring scale and translation, touch-position-aware ripple, optional magnetic attraction, damped release, reduced-motion fallback, and accessible press semantics.

#### `LiquidRipple`
A bounded visual feedback layer originating at the input point. It must avoid layout reflow, prefer transform/opacity animation, simplify under reduced motion, and remain clipped to the owning surface.

#### `MagneticTarget`
Pointer proximity mapping for web and bounded touch-offset behavior where appropriate on native. Movement must stay subtle enough that the semantic hit area never becomes ambiguous.

### 2. Shape and morph primitives
#### `LiquidMorph`
A shape-state coordinator for transitions among circle, pill, and rounded rectangle states. Primary use: selected tab indicator, Motion / Phase / Film selector, play/pause-like controls, compact affordance expanding into a panel. V1 favors radius/scale/width/position interpolation over arbitrary path morphing.

#### `GooeyCluster`
A visual relationship between nearby moving controls.

Web strategy: SVG/CSS blur plus alpha-contrast filtering where reliable, with overlapping animated surfaces as fallback.

Native strategy: overlapping animated surfaces, stretch, scale, and connecting bridge illusion. Exact browser-filter parity is not required.

The requirement is the perceptual effect of surfaces joining/separating, not physically exact fluid simulation.

### 3. Glass and optics primitives
#### `LiquidGlassSurface`
Shared container providing translucent glass, background blur when supported, Fresnel-like edge brightening, specular highlight, dark-mode edge separation, configurable tint/opacity, and graceful fallback.

Web may use `backdrop-filter` and layered gradients. Native should prefer `expo-glass-effect` where supported and fall back without changing layout.

#### `ContextualGlassTone`
Adapts glass tint/contrast to known background luminance or surface context. V1 does not require expensive continuous pixel sampling.

#### Refraction / distortion
V1 implements perceptual refraction rather than full ray tracing. Web can use bounded distortion/filter layers where supported. Native can use highlight displacement, gradient curvature, scaling, and glass overlays. Unsupported platforms fall back to ordinary glass.

### 4. Fluid rendering details
#### Alpha contrast / jelly edge
Blur plus alpha contrast may strengthen gooey boundaries where supported. It is an enhancement, not a functional dependency.

#### Fluid particles
V1 uses a small bounded set of decorative particles or gradient blobs, not tens of thousands of CPU particles and not a Navier–Stokes solver. Target approximately 20–60 lightweight visual elements at most on a decorative surface, GPU-friendly transforms, disabled under reduced motion, and no impact on Motion/Phase interaction responsiveness.

#### Dynamic liquid background
Slow gradient/shape movement may be used behind major glass surfaces. It must remain visually quiet enough that pose/skeleton analysis remains the focus.

## Application points
### Bottom Dock
Highest-priority showcase: moving selected liquid pill, spring response, subtle gooey/stretch relationship, web magnetic pointer response, emphasized capture action, glass surface, edge highlight.

### Home
Major actions use `LiquidPressable`; selected cards may use restrained glass; ripple and spring feedback are allowed; avoid heavy continuous animation over skeleton/video content.

### Analysis: Motion / Phase / Film
Selected mode indicator morphs/slides fluidly; spring transition and restrained gooey connection; analysis content remains independent from decorative motion; Phase Space scrub/anchor controls may use spring snapping in a later slice.

### Top Bar / overlays
Use glass, Fresnel-like border, and specular highlight with minimal movement. Popup affordances may morph into a glass panel.

## Interactive web preview architecture
The preview becomes a single signed-in interactive simulator rather than disconnected static routes.

Requirements:
- one stable GitHub Pages entry URL
- starts in synthetic signed-in Home state
- Home actions navigate to synthetic Profile, Capture, Reels, Explore/Reference, and Analysis views
- Profile items can open Analysis
- Analysis supports Motion / Phase / Film web-safe states
- close/back returns to prior preview state
- no Firebase authentication requirement
- no page navigation that drops the `/shooting-profile-coach-ios` base path
- preview-only state must not leak into normal production exports
- visible primary actions must not use `noop`

Preferred implementation: state-driven preview navigation inside the demo shell while reusing real presentational components.

## Performance policy
### Animation budget
- prefer transform and opacity
- Reanimated worklets for native-capable motion
- avoid JS-thread-per-frame decorative work
- avoid full-screen high-radius blur where local surfaces suffice
- particle/detail effects must remain bounded
- analysis viewer frame rate and gesture response take priority

### Adaptive degradation
Effects are layered by importance:
1. layout and interaction semantics
2. spring/morph movement
3. translucent glass
4. blur/refraction
5. particles/extra highlights

Lower layers may be disabled without breaking interaction.

### Reduced motion
When reduced motion is requested:
- remove bounce/overshoot
- remove magnetic drift
- remove decorative particles
- shorten morph transitions to simple state changes
- retain clear selected/unselected states
- retain glass/static edge treatment where readable

## Accessibility
- minimum hit areas remain unchanged or improve
- moving visuals must not move semantic hit areas unpredictably
- selected state remains exposed to accessibility APIs
- animation never replaces textual/structural state
- contrast remains readable on glass backgrounds
- ripple/particle effects are never required to understand an action

## Testing strategy
Each slice follows TDD.

Contract/unit tests cover reduced-motion behavior, spring/magnetic parameter bounds, preview navigation transitions, preview-only synthetic-auth isolation, fallback when glass/filter support is unavailable, selector selected-state semantics, and Motion/Phase/Film evidence-boundary regressions.

Existing CI must continue to pass: typecheck, lint, hermetic unit tests, Firestore Rules emulator tests, Expo web export, and GitHub Pages preview build/deploy where relevant.

## Session-sized implementation slices
Execute exactly one major slice per work session unless the user explicitly changes this rule.

### Slice 0 — Branch + design spec
This document only. No product code.

### Slice 1 — Interactive signed-in web preview shell
Goal: make the browser preview behave like a clickable app before adding visual effects.

Deliverables: state-driven preview navigation; Home → Profile / Capture / Reels / Analysis / reference flows; back/close behavior; removal of primary-action `noop` handlers; GitHub Pages base-path-safe behavior.

### Slice 2 — Liquid interaction foundation
Goal: reusable interaction primitives with no broad app rollout yet.

Deliverables: motion constants/tokens, `LiquidPressable`, `LiquidRipple`, magnetic helper, reduced-motion support, focused tests.

### Slice 3 — Liquid Dock
Goal: apply the new interaction system to bottom navigation only.

Deliverables: moving selected indicator, spring response, capture response, gooey/stretch illusion, web magnetic hover, accessibility regression tests.

### Slice 4 — Glass / optics foundation
Goal: reusable glass rendering primitives.

Deliverables: `LiquidGlassSurface`, edge/Fresnel-like highlight, contextual tint model, web refraction enhancement and safe fallback, native glass/fallback contract.

### Slice 5 — Home + Top Bar integration
Goal: apply restrained liquid/glass behavior to primary product surfaces without overwhelming analysis content.

### Slice 6 — Analysis controls
Goal: apply fluid morphing to Motion / Phase / Film selector and selected Phase Space controls while preserving viewer performance.

### Slice 7 — Fluid detail layer
Goal: add bounded particles, dynamic gradients, and alpha-contrast enhancements after core interaction quality is stable.

### Slice 8 — Final integration and verification
Goal: full regression, web preview review, performance review, reduced-motion review, and cleanup. No feature expansion.

## Explicit non-goals for v1
- physically exact Navier–Stokes fluid simulation
- full ray-traced optical refraction
- thousands/tens of thousands of runtime particles
- replacing the existing HoopHub information architecture
- changing shooting-analysis data models
- redesigning Phase Space geometry
- changing Firebase/Auth production behavior
- adding server video storage

## Acceptance criteria
1. Web preview opens as a synthetic signed-in interactive HoopHub experience from one stable URL.
2. Visible primary preview controls actually navigate or change state.
3. Dock/Home/analysis selectors exhibit coherent spring/liquid feedback.
4. Glass surfaces show depth through blur/tint/highlight with safe fallback.
5. Gooey/morph/ripple effects are visible but do not obscure analysis.
6. Reduced-motion mode remains fully usable.
7. Motion/Phase/Film behavior and evidence boundaries remain intact.
8. Production auth/data behavior is unchanged.
9. Existing CI and web export pass.
10. Effects degrade gracefully on unsupported browsers/devices.
