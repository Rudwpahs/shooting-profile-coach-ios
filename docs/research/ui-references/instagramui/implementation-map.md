# Hoop Hub implementation map

Upstream reference: `bhavnishkumar/InstagramUI@b64437a0b1757c5ead6b08e9c1eb00e870e88b41`  
Hoop Hub baseline inspected: `main@1eb8803ed5e79cd981dc1010a510088ab01249be`  
Verified: 2026-09-19 KST

This document answers the future-session question: **what from the InstagramUI extraction is already represented in Hoop Hub, and what is still worth adapting?**

## Summary

Most of the high-value Instagram-like information architecture is already present in Hoop Hub in a safer and more product-specific form. The right strategy is to evolve existing React Native components, not port the SwiftUI clone.

| Pattern | Upstream reference | Current Hoop Hub | Status | Future action |
|---|---|---|---|---|
| Circular story/highlight rail | `FeedView.swift` highlights | `components/home/story-strip.tsx` | Already implemented, product-correct | Evolve only when real categories/content exist |
| Feed post anatomy | `PostCell.swift` | `components/home/feed-card.tsx`, `components/home/home-feed.tsx` | Already implemented, product-correct | Keep current component; no Swift port |
| Explore asymmetric mosaic | `SearchView.swift`, `Layout1/2/3.swift` | `app/(tabs)/explore.tsx` | Strong partial equivalent | Optionally expand to repeating left/equal/right rhythm when lawful content volume supports it |
| Profile hierarchy | `ProfileView.swift` | `app/(tabs)/profile.tsx`, `components/profile/*` | Already implemented more robustly | Preserve owner/privacy logic; optionally add useful category/highlight rail later |
| Five-destination shell | `TabbarView.swift` | Expo Router tab structure | Concept already represented | Current product tasks decide tabs; do not seek parity |
| Reels | `ReelsView.swift` | `app/reels.tsx` | Hoop Hub is ahead; upstream is placeholder | Ignore upstream Reels |
| Notifications | `NotificationView.swift` | No equivalent required by this reference | Upstream is placeholder | Add only from independent product need |
| Dark/light theme tokens | `ThemeHelper.swift` | `constants/tokens` and current primitives | Current implementation preferred | Use current tokens only |
| Toast/banner feedback | `Toast.swift`, Feed/Profile overlays | Existing alerts/status/live-region patterns | Selective opportunity | Add transient feedback only for non-critical success/status events |

## 1. Home / Feed

### Existing Hoop Hub implementation

`app/(tabs)/index.tsx` wires a dedicated `HomeFeed` and routes to capture, analysis, profile, Reels, and the reference library. `components/home/feed-card.tsx` already preserves the strongest part of the upstream post grammar:

- compact header/title/meta;
- dominant visual stage supplied as a child;
- icon action row with accessible 44pt controls;
- optional confidence band;
- compact caption/coaching line.

`components/home/story-strip.tsx` already provides the circular story/highlight rail using a capture action and skeleton glyphs rather than borrowed portrait imagery.

### Decision

**No upstream code port is warranted.** If Home needs richer social rhythm, extend `HomeFeed`, `FeedCard`, and `StoryStrip` using current tokens and lawful data.

## 2. Explore

### Existing Hoop Hub implementation

`app/(tabs)/explore.tsx` already provides:

- asymmetric large/small skeleton tiles;
- responsive sizing using measured/window width, `MAX_WIDTH`, and fallback width;
- front / oblique / side view chips;
- accessibility labels, roles, and selected state;
- only anonymous/reference motion currently allowed by the product contract.

This is technically cleaner than the upstream 2022 approach, which uses `UIScreen.main.bounds` and fixed tile math.

### Remaining useful idea

If Explore later has enough lawful content, use a repeating visual rhythm inspired by the extracted grammar:

1. feature-left group;
2. equal three-tile row;
3. feature-right group;
4. repeat with content-driven ranking.

Do not manufacture users, popularity, or placeholder posts merely to fill the mosaic.

## 3. Profile

### Existing Hoop Hub implementation

`app/(tabs)/profile.tsx` is substantially more capable than the reference. It already separates:

- top account control;
- `ProfileHero`;
- `ProfileStats`;
- training goal context;
- sync/error states;
- `MotionGrid` for representative profiles;
- legacy private analyses;
- owner-bound delete/load operations;
- account panel.

It also uses generation/owner guards to prevent stale previous-owner results and carries accessibility state through interactive controls.

### Remaining useful idea

A category/highlight rail may be useful later if it maps to genuine shooting concepts such as Release, Rhythm, Range, Consistency, Saved, or Challenges. It should not mimic social Story semantics without a product reason.

## 4. Navigation

The upstream five-tab layout is a familiar social shell, but Hoop Hub navigation must optimize for shooting tasks. Capture/analysis can deserve higher prominence than a Notifications tab. Current Expo Router structure remains authoritative.

## 5. Reels

Upstream `ReelsView.swift` contains only `Text("Pending Work")`. Hoop Hub already has `app/reels.tsx`, so there is **nothing to extract or port from upstream Reels** at this snapshot.

## 6. Notifications

Upstream `NotificationView.swift` is also only `Text("Pending Work")`. Do not create a notification subsystem from this reference. That would be a separate product decision.

## 7. Theme and visuals

Use Hoop Hub's current design system. Do not import the upstream navy/orange/teal theme variants, exact spacing, image assets, or Instagram visual identity. The transferable lesson is only centralized dark/light theming.

## 8. Proposed priority if this reference drives future UI work

1. Keep current FeedCard/StoryStrip/Profile architecture.
2. Expand Explore mosaic only when there is enough legitimate content.
3. If social posting becomes a real feature, extend the existing feed data contract rather than cloning `FeedModel`.
4. Add transient success feedback where it reduces uncertainty.
5. Keep Reels/Notifications independent of this source.

## Relevant Hoop Hub file snapshot

| File | SHA at inspected `main` | Why it matters |
|---|---|---|
| `app/(tabs)/explore.tsx` | `18cab058371664c011fdf40a797bb97a7ac3d2e5` | Existing asymmetric Explore mosaic |
| `app/(tabs)/profile.tsx` | `33abbf83a6b03540be7e37d001b916a1dc06fac1` | Current robust profile route |
| `app/(tabs)/index.tsx` | `c3b66707f75eedd5916c28053742f8c084a3c700` | Home routing and HomeFeed wiring |
| `components/home/story-strip.tsx` | `601c52d1838f6a8b1f0670d2f2903962d70e646f` | Existing circular highlight/story pattern |
| `components/home/feed-card.tsx` | `86e86926c39598d4e4b5a5cb388e24f4f1d4c526` | Existing product-specific post anatomy |
| `components/home/home-feed.tsx` | `d3efb7ab021abca15ca8d19a4a93bd5c7d253f3e` | Home feed composition |
| `app/reels.tsx` | `56491c324cdf54b867435839512dd2a5c38a01b5` | Actual Hoop Hub Reels route, unlike upstream placeholder |

If any of these SHAs change, inspect the **current Hoop Hub file**, not the upstream InstagramUI file, before deciding what to implement.