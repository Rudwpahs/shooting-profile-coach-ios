# Claude UI integration — frozen C2 contract wired into the Reel harness

Date: 2026-09-09 · Branch: `work/claude-hoop-hub-ui-integration`
Base: `work/claude-hoop-hub-product-ui` @ `1957969` (verified UI lane, history untouched)
Merged: `work/claude-hoop-hub-system-contracts` @ `fd4d145` (**C2 CONTRACT FREEZE**), no conflicts.

## What changed on top of the merge

| File | Change |
| --- | --- |
| `lib/feed/coach-reel-adapter.ts` | new: `coachReelFromFeedEvent({ event, request, motion })` → `CoachReel \| null`. Only an eligible `CoachFeedEventV1` whose `request_id` matches yields a reel; the message is the provider's one line, the label and anchor come from `resolveCoachCueAnchor`. |
| `lib/feed/reel-model.ts` | `CoachReel` gains `cueAnchor: CoachCueAnchorV1 \| null` (joints + phase anchor, or text-only) for the Motion Lift cue in C3. |
| `lib/feed/reel-fixtures.ts` | the harness coaching moment is now built through the frozen chain: fixture profile → `buildCoachRequest` → `deterministicCoachResponse` → `buildCoachFeedEvent` → `coachReelFromFeedEvent`. The `lib/recommendation.ts` goal text is no longer used for the coach. Fixture cones are 8° so the Basic cap yields a medium, eligible event; `FIXTURE_NOW_MS`, request, event and profile ids are fixed. |
| `tests/coach-reel-adapter.test.ts` | new (6): each link of the chain validates, eligible → reel with message/label/anchor, ineligible → `null`, foreign request → `null`, quality label → text-only anchor, harness has exactly one coach reel. |
| `tests/reel-fixtures.test.ts`, `tests/reel-feed-render.test.tsx` | expectations follow the resolved cue label instead of fixture prose. |

Not touched: `app/(tabs)/**` (Home stays as at PR #5 until C2-A), `components/**`, contracts, providers,
`lib/reels/**`, Firestore, persistence.

## Verification (integration worktree)

| Gate | Result |
| --- | --- |
| `pnpm check` | 0 errors |
| `pnpm lint` | 0 problems |
| `pnpm test:unit` | 741 passed, 1 skipped, 1 failed (the CRLF-only lockfile regex, passes with an LF lockfile as in CI) |
| focused: coach-reel-adapter, reel-fixtures, reel-feed-render, representative-yaw, motion-lift-emergence | 30 passed |
| `expo export --platform web` | 21 static routes incl. `/dev/reel-lab` |

## Next (C2-A onward, same branch or its successor)

1. Replace `app/(tabs)/index.tsx` with `ReelFeed`; source the CoachReel from `buildCoachFeedEvent` over the
   owner's latest profile (`useLatestRepresentativeProfile`) and a `CoachProvider` (deterministic until the remote
   service is configured); zero eligible events means zero CoachReels.
2. C3: highlight `cueAnchor.joints` at `cueAnchor.phase_anchor` inside Motion Lift; text-only anchors render the
   label only.
3. C4: detail action opens hypotheses, `do_not_infer`, drills and retest from the same `CoachResponseV1`.
4. Public playback waits for the MotionPacketV1 decoder from the Codex lane; `ReelMotion` gets its adapter then.
