# Claude C2-A product handoff — **C2-A PRODUCT UI READY**

Status: **C2-A PRODUCT UI READY** (2026-09-09). The structure verified in the `app/dev/reel-lab` harness now
is the real Home experience, built only on the frozen C2 contract. The PR #4 physical-iPhone gate is untouched
and not bypassed; the device-only items in §7 are the next gate for this work.

| Item | Value |
| --- | --- |
| Branch | `work/claude-hoop-hub-ui-integration` |
| Base | `work/claude-hoop-hub-product-ui` @ `1957969` + merge of `work/claude-hoop-hub-system-contracts` @ `fd4d145` (C2 CONTRACT FREEZE) |
| Worktree | `C:/Users/USER/Projects/shooting-profile-coach-ios-integration` |
| Not modified | `contracts/**`, `lib/coach/**` (contract, adapter, confidence map, privacy, providers, feed event), Python schemas, `lib/reels/**`, Firebase rules, storage, backend, RAG, training, `package.json`, lockfile, `app.config.ts` |

## 1. Commits (on top of `d5403cf`)

| SHA | Change |
| --- | --- |
| `13d7f22` | feat(feed): compose the Home feed and keep saved moments as state |
| `22942f4` | feat(feed): drive the Home coaching moment through the frozen provider boundary |
| `efc098e` | feat(feed): show the primary visual cue inside Motion Lift from the frozen observation |
| `4561629` | feat(home): turn Home into the vertical Reel feed |
| (this commit) | docs(integration): this handoff |

## 2. Changed screens

| Screen | Before | Now |
| --- | --- | --- |
| Home `app/(tabs)/index.tsx` | `ScrollView` + story strip + two feed cards; caption from `getPracticeFocus(goal)` | One vertical feed of full-height reels (`ReelFeed`): my latest representative loop, the coaching moment, the anonymous reference. 44 pt `TopBar` with the wordmark and one capture action (`슛폼 촬영` → `/private-capture`). One status line above the feed for signed-out / disabled / loading / empty / error; the feed stays video-first with the reference in every state. |
| `components/home/feed-card.tsx`, `story-strip.tsx` | Home cards | Retired (deleted); tests moved to the feed components. |
| `app/dev/reel-lab` | Harness | Kept, unchanged, as the regression and evaluation surface (fixture data only). |
| Explore, Profile, Analysis, Capture | | Unchanged. Graphite / Volt tokens, skeleton identity, TopBar and tab bar are the same components as PR #5. |

Rail actions (icon-only, 44 pt): user reel → analysis (only while the representative viewer flag is on),
profile, bookmark; coach reel → `코치 설명 자세히` (same analysis route, flag-gated) and bookmark; reference
reel → `참조 모션 열기`. The user reel label is `내 슛폼 · <recency>` and its one line is the band with the
boundary (`Basic · 4D 추정 · 실측 3D 아님`). No follower, like or percentage numbers exist anywhere on Home.

## 3. CoachReel insertion behaviour

- Built only from a frozen `CoachFeedEventV1`: `useHomeCoachReel` → `buildHomeCoachRequest` (the frozen adapter over the
  latest profile with the user goal and skill) → `CoachProvider.coach` → `buildCoachFeedEvent` → `coachReelFromFeedEvent`.
  Home never reads `coaching_comment`, `primary_visual_cue` or hypotheses itself (pinned by `tests/ui-home.test.ts`).
- Inserted right after the first user reel (`insertCoachReel`); it never leads the feed and never exists without my reel.
  Order: `user → coach → reference`. Zero eligible events means zero CoachReels; there is no "every N reels".
- Eligibility is the frozen rule: usable reply, passed capture gate, confidence ≥ medium, a visual cue, cooldown.
  The cooldown clock is per session until saved posts and a last-shown record exist.
- Provider selection (`lib/feed/home-coach-provider.ts`): `EXPO_PUBLIC_FORMPATH_COACH_URL` set → `RemoteCoachProvider`,
  otherwise `DeterministicCoachProvider`. No silent fallback from a failing remote service: unavailable, cancelled,
  stale, schema-invalid or ungrounded → the moment is skipped and the feed is simply the reels (`1 / 2` instead of `1 / 3`).
- One request per profile; changes of profile, goal or skill abort the in-flight call; an older answer never lands.

## 4. Motion Lift behaviour on Home

Unchanged machine from the harness (`lib/feed/motion-lift-state.ts`), now on production reels:

| Step | Behaviour |
| --- | --- |
| tap | pause / resume; the whole stage is the target and dims a little on touch-down |
| hold 320 ms while paused, ≤ 10 pt jitter | grab: one haptic, feed scroll locked, ground dims, figure lifts with a halo |
| move > 10 pt before the hold | gesture fails, the vertical swipe wins |
| held horizontal | continuous yaw (0.32°/pt) on the same skeleton renderer |
| held upward ≥ 56 pt | Save arms (one haptic, hysteresis at 40 pt), tiny bookmark turns solid |
| release armed | `onSave({ itemId, yaw })` → session saved state; tiny check for 1.2 s; rail bookmark turns solid |
| release not armed | settle; the turned pose stays until the reel resumes or changes |
| resume / swipe | full reset, lock released |
| Reduce Motion | no in-between states, instant settle, unanimated navigation, haptics unchanged |
| VoiceOver | the reel is an adjustable element: double-tap toggles, swipe up/down moves; the lift layer is hidden; the cue label is announced once; the rail bookmark is the accessible Save equivalent |

**Primary visual cue.** Only on a CoachReel, only while inspecting (held, or holding a turned pose): one label pill in the
bottom-left padding zone (`motion-lift-cue`) and accent rings on exactly the joints of the observation the cue names,
resolved by `resolveCoachCueAnchor` from the frozen request; a text-only anchor shows the label alone. A user reel shows
no cue, so the default reel stays free of analysis. Nothing is positioned from prose.

**Save.** UI and state only: `lib/feed/saved-moments.ts` keeps one moment per item for the session; the rail bookmark
reflects and toggles it. No persistence, no modal.

## 5. Frozen interfaces consumed (read only)

| Interface | Used by |
| --- | --- |
| `CoachRequestV1`, `CoachResponseV1`, `CoachObservationV1`, `PrimaryVisualCueV1`, `resolveCoachCueAnchor` (`lib/coach/contract.ts`) | `lib/feed/coach-reel-adapter.ts`, `lib/feed/home-coach.ts` |
| `buildCoachRequest` (`lib/coach/representative-profile-adapter.ts`) | `lib/feed/home-coach.ts` |
| `CoachProvider`, `CoachProviderResult` (`lib/coach/provider.ts`) | `hooks/use-home-coach-reel.ts`, `lib/feed/home-coach-provider.ts` |
| `DeterministicCoachProvider`, `RemoteCoachProvider` | `lib/feed/home-coach-provider.ts` |
| `CoachFeedEventV1`, `buildCoachFeedEvent` (`lib/coach/feed-event.ts`) | `lib/feed/home-coach.ts`, `lib/feed/coach-reel-adapter.ts` |
| `RepresentativePose4DV2` (unchanged private shape) | `lib/feed/home-feed.ts` via `useLatestRepresentativeProfile` |

## 6. Backend interfaces still needed from the Codex lane

1. **MotionPacketV1 decoder** (`lib/reels/motion-packet-v1.ts`) and its object-storage reference: public reels of other
   shooters need a `ReelMotion` adapter from the decoded packet; today only my own representative profile and the
   anonymous reference render.
2. **Public feed provider** (`reelPosts`): the list of public reels, ranking and paging; `buildHomeFeed` takes them as
   more `UserReel`s and `insertCoachReel` already places the coaching moment after the first one.
3. **Saved reels persistence** (`savedReels`): `onSave({ itemId, yaw })` and the rail toggle are the only calls the UI
   makes; the last-shown coaching moment (cooldown clock) belongs to the same boundary.
4. **Remote Coach service**: endpoint behind `EXPO_PUBLIC_FORMPATH_COACH_URL` speaking `contracts/coach-request-v1.schema.json`
   / `coach-response-v1.schema.json` with auth, rate limit and log redaction; the FastAPI scaffold still speaks the legacy
   models. Until then the deterministic provider answers.
5. **Detail experience data** (C4): hypotheses, `do_not_infer`, drills and retest come from the same `CoachResponseV1`;
   the coach reel's detail action opens the existing analysis screen for now.

## 7. Device-only blockers (not verifiable on web or jsdom)

- Hold jitter versus `UIScrollView`: manual activation with a 10 pt tolerance and the scroll lock must be checked with a real thumb; a false grab or a stolen scroll is a defect.
- Haptics: one on grab, one on arm, one on save; none repeated while over threshold.
- VoiceOver: adjustable actions on the reel, the announced cue label, the rail bookmark as the Save equivalent.
- Reduce Motion on device: instant grab and settle, unanimated paging.
- Compact height (iPhone SE class): the rail (up to three 44 pt buttons) overlaps only the bottom-right corner of the stage; confirm the caption band never pushes it over the figure.
- Yaw updates re-render the SVG skeleton per move; measure for hitching on device before C3 adds the cutout.
- The status line and the feed with a real safe-area inset and the tab bar.
- PR #4 Basic 1+1 physical-iPhone gate: unchanged and still mandatory before any merge of this line.

## 8. Verification (integration worktree, 2026-09-09)

| Gate | Result |
| --- | --- |
| `pnpm check` | 0 errors |
| `pnpm lint` | 0 problems |
| `pnpm test:unit` | 758 passed, 1 skipped, 1 failed (the CRLF-only lockfile regex, passes with an LF lockfile as in CI) |
| Focused: home-feed 7, home-coach 4, ui-home 7, ui-render home 5, reel-feed-render 13 (cue 3), coach-reel-adapter 6 | all passed |
| `expo export --platform web` | 21 static routes; Home and `/dev/reel-lab` both export |
| Web export visual check (375 × 760) | signed-out Home: status line, capture action, reference reel full height, chrome off the figure |
