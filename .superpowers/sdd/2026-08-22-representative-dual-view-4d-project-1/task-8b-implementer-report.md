# Task 8B implementer report

## Scope changed

- `components/shooting-profile/profile-list.tsx` — added the presentational V2 list, honest mode/evidence/confidence labels, live loading/empty/error/deleting states, and accessible open/delete controls.
- `app/(tabs)/profile.tsx` — added independently loaded V2 records, deletion recovery before listing, exact-owner render envelopes and generation guards, native delete confirmation/single-flight handling, V2 viewer routing, and preserved V1 list/view/delete/capture/auth behavior with the `기존 단일 시점 분석` label.
- `hooks/use-shooting-profile-capture.ts` — changed the save callback to the exact `SaveShootingProfileInputV2 -> Promise<string>` contract, retained the exact aggregation attempts by generation, invalidated them on all required exits, enforced exact per-view counts, and uses the tested single-flight async save orchestrator so malformed/stale results cannot complete a session.
- `lib/shooting-profile/capture-session-reducer.ts` — added `savedProfileId`, generation-matched ID-bearing `SAVE_SUCCEEDED`, derived-state clearing coverage, exact-owner/token helpers, and dependency-injected async save/delete orchestrators used by production and deferred-race tests.
- `components/shooting-profile/capture-session.tsx` — wired the save callback/completion ID action, truthful saved copy, saved-ID-only completion action, saving-time close lock, and focus-visible accessible controls.
- `components/shooting-profile/quality-summary.tsx` — added the required Korean 12-joint normalized-2D consent/retention copy immediately before save, truthful unsaved state, saving live status, and focus-visible 44-point control.
- `components/private-pose-capture.tsx` — gated the V2 CTA on `captureV2 && profileV2`, preserved V1 when either flag is off, and added accessibility/focus/live-state treatment.
- `app/private-capture.tsx` — added dual-flag and settled-auth gating, clear auth loading, Task 8A save service wiring, UID-keyed capture remount, opaque-ID viewer/profile completion routing, and safe close fallback.
- `tests/shooting-profile-capture-reducer.test.ts` — added saved-ID lifecycle/stale-generation coverage, exact-owner A-to-B hiding coverage, and direct deferred tests of the production save/delete orchestrators: exact envelope identity, single-flight admission, valid-ID-only success, generation/owner suppression, no early completion, failure callbacks, matching-token cleanup, and a new-owner delete while the prior request hangs.
- `tests/shooting-profile-persistence-ui.test.ts` — added static integration coverage for the strict envelope, invalidation paths, auth/flags, V1 fallback, consent, completion, owner guards, V1/V2 independence, deletion ordering/single-flight, profileV2-off behavior, accessibility, and forbidden paths.

No Task 8A contract/service/rules, native detection, reconstruction math, V1 persistence service, dependency manifest/lockfile, server, MySQL/tRPC, public sharing/comparison/reference-player, or GitHub file was intentionally edited.

## Tests and checks

Tests were written before production edits. The focused Vitest executable was initially absent. A `pnpm exec vitest` probe attempted automatic dependency materialization and failed on blocked build scripts before running tests; that probe-created `node_modules` was moved out of this repository. A subsequently materialized `node_modules` was explicitly identified as unapproved/concurrent, so it was not used.

Executable verification therefore remains unavailable/unapproved:

- Focused Vitest: not run.
- TypeScript: not run.
- ESLint: not run.

Fresh read-only/static checks performed:

- Required scoped-file existence check: passed for all 10 implementation/test files.
- Pressable source audit: 20 controls across the five changed UI files; every block contained an accessibility label, button role, accessibility state, disabled state, focusability/focus handler, and visible text. Each file contained layout-neutral outline focus styling; referenced styles were manually checked at 44×44 or larger.
- Persistence/routing/owner/deletion/flag/async-orchestration invariant script: 35 checks passed.
- Forbidden reference search: no `console.*`, server import, tRPC, MySQL, or public share/comparison/reference-player path in changed V2 wiring.
- V2 write-reuse search: no V1 pose write/list/delete API in the capture save route/hook/session/summary/list.
- Save-section leakage check: no URI, filename, native landmarks, or slot sequence in the callback envelope.
- Copy check: exact evidence boundary plus 12-joint normalized 2D, no raw video/filename/original MediaPipe depth, retention-until-delete, and derived-private-data-saved wording all present.
- Live Task 8A API recheck: current strict save input, opaque-ID validator, `Promise<string>` save, list/delete/resume functions, and V2 summary shape remain compatible.

## Self-review

- Stale owner: V1 records, V2 records, selected V1 viewer, counts, delete state, loading, errors, and notices are hidden unless keyed to the exact current UID. Deferred loads check both generation and UID before updates; capture components remount by UID.
- Stale generation/save: retained normalized attempts are the same array passed to aggregation, are never recomputed at save, are invalidated on every required path/unmount, and late or malformed save results cannot dispatch success.
- Privacy/copy: the save envelope contains only profile, hand, confidence, and normalized attempts. Route params contain only a validated opaque ID. Copy never claims success before service resolution.
- Flags/auth: capture requires both persistence flags and settled signed-in auth. V2 profile calls/rendering are guarded by `profileV2`; V1 remains usable independently.
- Deletion: native `Alert`, synchronous single-flight guard, exact-owner validation, targeted deleting label, other delete controls disabled, and completion notice only after Task 8A deletion resolves.
- Accessibility: changed actionable Pressables are at least 44×44 with role/label/state, live changing states, and outline/shadow/elevation focus treatment without focus-only border-width changes.
- Review response: all production issues from the independent static review were addressed. Its final preflight found one stale pre-refactor source assertion; that assertion now checks the injected admission/run/current-token/cleanup path instead.

## Blockers

- No approved pre-existing project binaries were available for executable Vitest, TypeScript, or ESLint verification. No dependencies were intentionally installed or approved, and no commit/upload was performed.
