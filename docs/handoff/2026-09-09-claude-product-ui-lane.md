# Claude product / mobile UI lane — handoff (2026-09-09)

## Lane state

| Item | Value |
| --- | --- |
| Branch | `work/claude-hoop-hub-product-ui` |
| Base | `d00048d` (`feat/uiux-skeleton-social-redesign`, PR #5 head) |
| Worktree | isolated sibling checkout; the coach (`feat/formpath-coach-pytorch`) and main worktrees were not touched |
| Waves done | C0 (audit), C1-A (Reel harness), C1-B (Motion Lift prototype) |
| Gate | **stopped at the C1 Gate**; waiting for frozen `CoachRequestV1` / `CoachResponseV1`, `MotionPacketV1`, provider shape, `CoachFeedEventV1` |
| Merge | none; no PR opened; no direct `main` push; no force push; PR #4 and PR #5 untouched |

## Commits (oldest first)

| SHA | Subject |
| --- | --- |
| `59c1681` | docs(uiux): map which PR #5 components survive the Reel lane |
| `680a350` | feat(feed): add the isolated vertical Reel harness |
| `2591e7d` | feat(feed): add the held Motion Lift prototype over a paused Reel |
| (this commit) | test(feed): pin the animated lift emergence; docs(feed): record the C1 prototype and this handoff |

## Changed files

Created:
`app/dev/reel-lab.tsx`, `components/feed/{reel-feed,reel-item,reel-stage,reel-chrome,motion-lift-layer}.tsx`,
`components/feed/reel-stage-fit.ts`, `lib/feed/{reel-model,reel-feed-state,reel-fixtures,motion-lift-state}.ts`,
`hooks/use-reduce-motion.ts`, `tests/{reel-feed-state,reel-fixtures,motion-lift-state,representative-yaw}.test.ts`,
`tests/{reel-feed-render,motion-lift-emergence}.test.tsx`,
`docs/uiux/2026-09-09-c0-ui-component-map.md`, `docs/uiux/2026-09-09-c1-reel-motion-lift-prototype.md`, this file.

Modified (additive only):
`components/shooting-profile/sequence-viewer.tsx` (`projectRepresentativeJoints` delegates to the new
`projectRepresentativeJointsAtYaw`), `components/skeleton/representative-glyph.ts`
(`representativeGlyphAtYaw`, `representativeViewYaw`), `lib/skeleton/pose-motion-glyph.ts`
(`yaw` option, `poseMotionViewYaw`), `components/skeleton/skeleton-loop.tsx` and
`components/skeleton/pose-motion-loop.tsx` (optional `bounds` prop).

Not touched: `app/(tabs)/**`, `contracts/**`, `lib/coach/**`, `lib/coach-feed/**`, `lib/public-motion/**`,
`lib/saved-posts/**`, `ml/coach/**`, `lib/shooting-profile/types.ts`, Firebase rules, `package.json`,
`pnpm-lock.yaml`, `app.config.ts`, `HANDOFF.md`.

## Tests run

| Command | Result |
| --- | --- |
| `pnpm check` | 0 errors |
| `pnpm lint` | 0 problems |
| `pnpm test:unit` | 572 passed, 1 skipped, 1 failed — the CRLF-only lockfile regex in `pose-detection-v2-contract` (passes 56/56 with the LF lockfile, as in CI) |
| `expo export --platform web` | 21 static routes, `/dev/reel-lab` included |
| Web export interaction check | pause / hold / turn / arm / save / snap verified; details in the C1 prototype doc §5 |

## Interface changes

- No contract, schema, persistence or feature-flag change.
- UI-internal exports added (listed above); all existing call sites behave exactly as before
  (`tests/representative-yaw.test.ts` pins preset equality; the existing viewer, glyph and loop suites pass).
- `lib/feed/reel-model.ts` is a UI view model, explicitly not a wire contract; fixtures fill it until
  the frozen shapes arrive, then one adapter maps them.

## Unresolved issues

1. Physical-iPhone checks listed in the C1 prototype doc §6 (hold jitter vs. UIScrollView, haptics,
   VoiceOver, Reduce Motion, compact height) cannot be done on this machine.
2. React #418 hydration warning on the static web export is pre-existing at the PR #5 base (also on `/`).
3. Coordinator confirmations requested in the C0 map §6: base `d00048d`, `components/feed/**` as this
   lane's exclusive path.

## Requested shared-file changes

None.

## Next single action

Coordinator: freeze the Wave-1 contracts (or confirm the base) so this lane can adapt fixtures to the
frozen shapes and start C2-A (Home → `ReelFeed`). Until then the lane is idle by design.
