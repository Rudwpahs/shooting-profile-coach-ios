# Reusable UI patterns extracted from InstagramUI

Snapshot source: `bhavnishkumar/InstagramUI@b64437a0b1757c5ead6b08e9c1eb00e870e88b41`  
Verified: 2026-09-19 KST

This document intentionally describes **patterns, not copied implementation**.

## 1. Social feed skeleton

### Pattern

A feed screen works well when users can parse each item in four fast layers:

1. identity/context line;
2. dominant visual stage;
3. compact action row;
4. one short interpretation/caption line.

The upstream implementation adds a horizontal highlight row before the feed and keeps the content list visually plain so media dominates.

### Hoop Hub translation

Use:

- identity/context: session label, shooter/self label, shot goal, capture angle/date where useful;
- visual stage: skeleton motion, representative frame, approved video, or analysis preview;
- actions: open analysis, save/bookmark, share/export where lawful, compare/review;
- caption: one coaching insight or confidence/context line, not an Instagram-like generic caption.

Avoid carrying across follower/like mechanics unless a genuine social product requirement exists.

### Product rule

Analysis confidence and privacy state are more valuable than vanity engagement counts. Preserve the feed anatomy, not the Instagram semantics.

## 2. Story/highlight rail

### Pattern

A horizontally scannable row of circular items gives fast access to recent or categorical content. Upstream uses profile/story circles with a label underneath.

### Hoop Hub translation

Good categories include:

- 촬영 / new capture action;
- latest representative shot;
- anonymous/reference motion;
- release / rhythm / range / consistency focus;
- saved session groups or challenges if those become real features.

### Current status

Hoop Hub already has `components/home/story-strip.tsx`, using skeleton glyphs instead of copied portrait imagery. This is the preferred implementation and should remain the source of truth.

## 3. Post card anatomy

### Pattern

Header + stage + actions + caption is stronger than placing every metric around the media.

### Hoop Hub adaptation

Recommended order:

- short title (e.g. “최근 대표 슛폼”);
- optional secondary metadata;
- large motion stage;
- icon actions with 44pt+ touch targets;
- confidence indicator or state at the action row’s trailing edge;
- one-line coaching summary.

### Current status

`components/home/feed-card.tsx` already implements this pattern in a product-specific, accessible way. Do not port `PostCell.swift`; use the current component and evolve it.

## 4. Explore compositional mosaic

### Upstream layout grammar

The interesting part of Search is not the search bar; it is the mosaic grammar:

- **Feature-left group:** one 1×2 tall tile plus a 2×2 block of four square tiles.
- **Equal group:** three square tiles in one row.
- **Feature-right group:** a 2×2 block of four square tiles plus one 1×2 tall tile.

The Search view selects layout variants by group index and the ViewModel groups incoming cards into 5 or 3 items accordingly.

### Hoop Hub translation

The same visual rhythm can rank content without inventing popularity metrics:

- tall feature tile = current focus / high-confidence representative / curated reference;
- square tiles = adjacent phases, alternate views, sessions, or public opt-in motions;
- alternating feature side reduces grid monotony.

### Current status

`app/(tabs)/explore.tsx` already has an asymmetric `big + small` skeleton mosaic with responsive `useWindowDimensions`, accessibility states, and front/oblique/side view chips. This is technically better than the 2022 reference.

Potential future enhancement: if enough lawful public content exists, extend the current single mosaic into a repeating feature-left/equal/feature-right sequence. Do **not** fabricate filler people/content just to fill the pattern.

## 5. Profile hierarchy

### Pattern

The upstream profile is strong because it separates identity, stats, actions, highlights, and media grid into distinct vertical zones.

General order:

1. title/account controls;
2. hero identity;
3. compact stats;
4. goal/bio/context;
5. key action(s);
6. highlights/categories;
7. tabbed or gridded content history.

### Hoop Hub translation

Use shooting identity rather than social identity:

- hero = latest representative skeleton/motion;
- stats = representative shots, analysis history, consistency/quality counts only where meaningful;
- context = current training goal;
- primary action = capture/analyze;
- grid = representative motions/history;
- account controls remain secondary.

### Current status

`app/(tabs)/profile.tsx` already implements a more robust version with `ProfileHero`, `ProfileStats`, `MotionGrid`, owner-bound loads/deletes, private data contracts, and account panel state. Preserve those safety/data boundaries.

## 6. Bottom navigation

### Pattern

Upstream uses five destinations in a custom bottom tab shell. The lesson is that frequent destinations stay persistent and icon-led.

### Hoop Hub rule

Keep navigation driven by product tasks, not by Instagram parity. A capture or analysis path may deserve stronger prominence than notifications/social engagement. Do not add a notifications tab solely because the clone has one.

## 7. Feedback banner/toast

### Pattern

Upstream shows a lightweight banner after interactions such as liking/selecting.

### Hoop Hub translation

Use transient feedback for:

- saved/deleted session confirmation;
- analysis queued/completed locally;
- capture validation result;
- privacy/public-opt-in changes;
- recoverable sync states.

Avoid toast-only reporting for destructive, blocking, or accessibility-critical errors; those need persistent or alert semantics.

## 8. Theme handling

### Upstream lesson

The reference switches colors for dark/light mode and centralizes theme variants. The exact implementation relies on `UIScreen.main.traitCollection` and hard-coded SwiftUI colors, which should not be copied.

### Hoop Hub translation

Continue using `constants/tokens` and existing React Native theme primitives. Any new borrowed pattern must consume current tokens rather than introduce Instagram-like colors.

## 9. Responsive sizing

### Upstream weakness

Multiple reference views calculate layout from `UIScreen.main.bounds.width`, making them less adaptable to split-screen/web/other form factors.

### Hoop Hub rule

Prefer the current approach already visible in `ExploreScreen`: measured width / `useWindowDimensions`, a max content width, and safe fallback width. Treat the upstream mosaic as ratio grammar only.

## 10. Accessibility upgrade over the reference

The upstream clone predates the current Hoop Hub accessibility standard. Any adapted pattern must retain:

- explicit accessibility labels and roles;
- selected/expanded/disabled states;
- 44pt minimum touch targets;
- keyboard/focus behavior where supported;
- contrast using current tokens;
- loading/error/empty states;
- reduced reliance on color alone.

## 11. What not to extract

Do not build from these simply because they exist upstream:

- Instagram/Meta logos or wordmarks;
- stock/demo post images;
- clone login/splash styling;
- placeholder Reels/Notifications screens;
- exact icon artwork;
- exact spacing/font constants;
- copied `PostCell.swift` or any other Swift implementation.

## Decision shortcut for future sessions

When asked “should we use something from InstagramUI?”, answer in this order:

1. Is the pattern already present in Hoop Hub? If yes, evolve the existing component.
2. Is the idea domain-neutral (mosaic, feed anatomy, profile hierarchy)? If yes, use this document to reimplement cleanly.
3. Is it Instagram-specific or asset/code-specific? If yes, reject direct reuse.
4. Is lawful/real Hoop Hub content available to populate it? If no, do not add placeholder social content.