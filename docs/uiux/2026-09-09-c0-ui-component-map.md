# C0 — UI component map for the Reel / Motion Lift lane

Date: 2026-09-09 · Lane: `work/claude-hoop-hub-product-ui` · Base: PR #5 head `d00048d`
(= `feat/uiux-skeleton-social-redesign`, the SHA pinned in `CURRENT_STATE.md`).

Scope of this document: the audit the handoff asks for before any code. It records which
PR #5 pieces survive into the Reel architecture, which are adapted, and which Home structure is
replaced. No product code changed in this commit.

## 1. Base confirmation

| Item | Value |
| --- | --- |
| Lane branch | `work/claude-hoop-hub-product-ui` |
| Worktree | separate checkout, sibling of the main worktree; the system/AI lane never writes here |
| Base SHA | `d00048d` (PR #5 head at audit time; CI green) |
| Not touched | `contracts/**`, `lib/coach/**`, `lib/coach-feed/**`, `lib/public-motion/**`, `lib/saved-posts/**`, `ml/coach/**`, `lib/shooting-profile/types.ts`, `package.json`, lockfile, `app.config.ts`, Firebase rules |
| Confirmation requested | coordinator: pin `d00048d` as the C1 base for this lane (this file is the request) |

## 2. What survives unchanged

| Surface | File | Why it survives |
| --- | --- | --- |
| Graphite / Volt tokens | `theme.config.js`, `constants/tokens.ts` | The dark-first palette is the visual identity of every Reel; the stage/foreground/accent tokens map 1:1 onto a full-bleed Reel (stage = the Reel ground, primary = shooting arm, skeletonDerived = inferred joints). |
| Typography roles | `constants/typography.ts` | The Reel caption is `callout`, the overlay label is `label`, the CoachReel message is `headline`; no new roles needed. |
| Skeleton identity | `components/skeleton/skeleton-glyph.tsx`, `lib/skeleton/pose-motion-glyph.ts`, `components/skeleton/representative-glyph.ts` | The SVG glyph and its pure adapters are the only renderer. Motion Lift rotates the same glyph; no second renderer. |
| Loops | `components/skeleton/skeleton-loop.tsx`, `components/skeleton/pose-motion-loop.tsx` | Both already implement background pause, Reduce Motion hold and `paused` from the parent. A Reel item drives them exactly like `LoopStage` does today. |
| Playback lifecycle | `components/shooting-profile/sequence-viewer.tsx` (`createRepresentativePlaybackLifecycle`, `transitionRepresentativePlaybackLifecycle`, `resolveRepresentativePlayback`, `advanceRepresentativeFrameIndex`) | One playback policy for the analysis player and the feed. |
| Yaw projection | `projectRepresentativeJoints` in `sequence-viewer.tsx`; `projectPosePoint` in `lib/pose-motion.ts` | Motion Lift needs a continuous yaw; the plan is to extract the preset lookup from the projection so the same math takes a yaw in degrees (C1-B). |
| TopBar | `components/ui/top-bar.tsx` | 44 pt, wordmark on Home, title elsewhere. Over a Reel it stays as the only top chrome (wordmark + one trailing icon). |
| Bottom navigation | `components/hoophub-tab-bar.tsx` | Flat icon bar; the capture action stays the "+" tab. Unchanged. |
| Text budget | `docs/uiux/2026-09-06-screen-inventory-and-visual-directions.md` §4.6 | One line per Reel: caption (UserReel), message (CoachReel), label (ReferenceReel). No kickers, no KPI rows. |
| Tap-to-pause | `components/skeleton/loop-stage.tsx` | The behaviour survives (tap = pause/resume on the whole stage). The component itself is Home/card-specific and is superseded by the Reel item tap layer; Explore/Profile keep using it. |
| Profile | `components/profile/*`, `app/(tabs)/profile.tsx` | Untouched by this lane. The motion grid remains the owner archive; Reels do not replace it. |
| Explore | `app/(tabs)/explore.tsx` | Untouched by this lane. |
| Analysis layers | `components/analysis/analysis-layers.tsx`, `app/private-analysis/[id].tsx` | Reused later (C4) as the detail layer behind the CoachReel action; not rebuilt. |
| Latest-profile hook | `hooks/use-latest-representative-profile.ts` | Survives as the source of the own UserReel until the feed provider exists. |
| Owner-bound guards | `valueForExactOwner`, generation refs in `profile.tsx` | Untouched. |

## 3. What is adapted (C1 prototypes, isolated)

| Piece | Adaptation | Where |
| --- | --- | --- |
| Feed container | `ScrollView` of cards → virtualized, vertically snapping, one full-height item per viewport, only the active item plays, window policy for adjacent items | `components/feed/reel-feed.tsx` (harness first, `app/dev/reel-lab.tsx`) |
| Stage | `FeedCard` stage slot → full-bleed `ReelStage` that mounts `SkeletonLoop` / `PoseMotionLoop` only for the active item and a still for neighbours | `components/feed/reel-stage.tsx` |
| Chrome | header + action row + caption → bottom-left one-line caption and a trailing icon rail, both outside the central body area | `components/feed/reel-chrome.tsx` |
| Tap layer | `LoopStage` → the item tap surface with VoiceOver actions (pause/play, next, previous) | `components/feed/reel-item.tsx` |
| Yaw | preset-only projection → continuous yaw for the held rotate | `sequence-viewer.tsx` (extracted projector), `representative-glyph.ts`, `pose-motion-glyph.ts` (additive `yaw` option) |
| Hold interaction | none today → pure Motion Lift state machine + a thin gesture layer that only exists while paused | `lib/feed/motion-lift-state.ts`, `components/feed/motion-lift-layer.tsx` |

## 4. What is replaced (later, C2)

| Today (`app/(tabs)/index.tsx` @ d00048d) | Replacement | When |
| --- | --- | --- |
| `ScrollView` + `StoryStrip` + two `FeedCard`s | `ReelFeed` with `UserReel \| CoachReel \| ReferenceReel` items | C2-A, after the C1 gate, once the provider/adapter shapes are frozen |
| `getPracticeFocus(profile.goal)` as the caption | CoachReel message from a frozen `CoachFeedEventV1` (eligible events only, may be absent) with a deterministic fallback | C2-B |
| `StoryStrip` (촬영 / 내 슛폼 / 참조) | Not carried into the Reel feed; capture stays on the "+" tab, own profile stays on the profile tab, the reference becomes a ReferenceReel | C2-A |
| `FeedCard` action row | Trailing icon rail on the Reel; analysis stays behind an explicit detail action | C2-A / C4 |

`components/home/feed-card.tsx` and `components/home/story-strip.tsx` are therefore **retired at C2**, not deleted now: the harness must not edit Home, and the existing Home tests pin them until the swap.

## 5. Fixture strategy until the C1 gate

- UserReel / CoachReel motion: a `RepresentativePose4DV2` fixture derived deterministically from the audited CMU reference motion (101 phases × 12 joints, `basic_1_plus_1`, boundary literal intact, heuristic_v1 cones). It is a UI fixture only; it never claims to be a measured profile and is used only by `app/dev/reel-lab.tsx` and tests.
- ReferenceReel motion: `ANONYMOUS_POSE_REFERENCES[0]` as today.
- CoachReel message: one deterministic line from `lib/recommendation.ts` (`getPracticeFocus`), replaced by the frozen `CoachFeedEventV1` after the gate.
- No new motion packet format, no Coach request/response shape, no persistence.

## 6. Open items for the coordinator

1. Confirm `d00048d` as the C1 base (this lane will merge, not rebase, if the integration point moves).
2. Confirm `components/feed/**` (handoff naming) over `components/reels/**` (older plan naming) as the exclusive path of this lane.
3. The `expo-blur` decision and any `package.json` change stay owner/gate items; the prototypes use no new dependency.
