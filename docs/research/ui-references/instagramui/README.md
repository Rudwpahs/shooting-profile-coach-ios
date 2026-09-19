# InstagramUI reference extraction

> **DO NOT RE-CRAWL FIRST.** Before opening or scraping the upstream repository, read `extraction-ledger.md` and `snapshot-manifest.json`. This folder is the durable extraction record for the exact upstream snapshot listed below. Revisit upstream only when (a) its HEAD changed and the change matters, (b) a file is explicitly marked `not-inspected`, or (c) a new implementation question cannot be answered from this archive.

## Purpose

This folder preserves the useful UI/UX knowledge extracted from `bhavnishkumar/InstagramUI` for Hoop Hub without copying upstream product code or visual assets into the app.

- Upstream: `https://github.com/bhavnishkumar/InstagramUI`
- Snapshot branch: `master`
- Snapshot commit: `b64437a0b1757c5ead6b08e9c1eb00e870e88b41`
- Verified: 2026-09-19 KST
- Upstream stack: SwiftUI + MVVM, iOS project, local JSON for feed/profile data, Picsum network data for Explore, SDWebImage/SDWebImageSwiftUI for remote images.
- Hoop Hub stack at extraction time: Expo Router + React Native/TypeScript.

## Read order for future sessions

1. `README.md` — scope and rules.
2. `implementation-map.md` — what is already present in Hoop Hub and what remains worth borrowing as an idea.
3. `patterns.md` — reusable interaction/layout patterns in framework-neutral terms.
4. `license-risk.md` — mandatory clean-room constraints.
5. `source-map.md` — upstream file-by-file role map.
6. `extraction-ledger.md` — inspection coverage and no-need-to-revisit decisions.
7. `snapshot-manifest.json` — machine-readable source SHAs and extraction status.

## Executive result

The upstream repository is useful mainly as a **reference for information architecture and composition**, not as a code donor.

High-value patterns:

- Home feed composed of a top action bar, horizontal circular highlight/story row, then vertically stacked post cards.
- Post card anatomy: identity/meta header → media stage → action row → compact caption/meta.
- Explore/search mosaic with three repeating layout families: tall feature tile on the left, all-equal row, tall feature tile on the right.
- Profile anatomy: identity/hero → numeric stats → primary actions → highlight rail → tabbed/grid content.
- Five-destination bottom navigation as an easily understood social-app shell.
- Dark/light theme concept and small feedback banner/toast pattern.

Low/no-value areas:

- `ReelsView.swift` and `NotificationView.swift` are placeholders containing only “Pending Work”.
- Core Data scaffold is not used by the useful UI reference paths.
- Upstream login/splash flows are visually specific to the clone and do not add much to Hoop Hub’s current authenticated product architecture.
- Upstream image assets include Instagram/Meta branding and assorted third-party-looking imagery; none should be copied.

## Current Hoop Hub overlap

At the 2026-09-19 `main` snapshot, several of the best ideas are **already represented in cleaner, product-specific form**:

- `app/(tabs)/explore.tsx` already has an asymmetric skeleton mosaic and responsive tile sizing.
- `components/home/story-strip.tsx` already provides the circular story/highlight rail using lawful skeleton content.
- `components/home/feed-card.tsx` already uses the useful post anatomy while replacing Instagram-specific semantics with analysis actions and confidence state.
- `app/(tabs)/profile.tsx` already uses `ProfileHero`, `ProfileStats`, and `MotionGrid` with owner-bound Firebase state and accessibility handling.

Therefore future work should not blindly “port InstagramUI”. Use this archive to answer narrowly: **which pattern is still missing, and how should it be adapted to Hoop Hub?**

## Clean-room rule

Do not copy upstream Swift code, layout constants, images, logos, or branded strings into production. Reimplement ideas from the framework-neutral descriptions in `patterns.md`. See `license-risk.md` for why.

## When upstream must be revisited

Revisit only if one of these conditions is true:

- the user explicitly asks to compare against a newer upstream commit;
- upstream `master` no longer equals `b64437a0b1757c5ead6b08e9c1eb00e870e88b41` and the delta could affect the requested feature;
- an entry in `extraction-ledger.md` is `not-inspected` and that exact file becomes decision-relevant;
- a licensing question requires fresh legal metadata unavailable in this snapshot.

Otherwise treat this folder as the source of truth for the extracted reference.