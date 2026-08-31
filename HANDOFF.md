# FormPath repository handoff

Last updated: 2026-08-31 UTC

## Current checkpoint

- Repository: `Rudwpahs/shooting-profile-coach-ios`
- Integration target: `main`
- Latest remote parent incorporated before this checkpoint: `1e781ebfd68423c6e481822aa78367635f84f2fc`
- Intended commit message: `fix: restore reproducible app build and sync status`
- Integration policy: update `main` only with `force: false`; re-read remote `main` immediately before and after the update.
- A GitHub candidate commit was created for diff review before this handoff file was added. It is intentionally not referenced by a branch and must not be used as the final target. Rebuild the candidate tree with this file included.
- Candidate `8f895ecff260f49c9a510fd3ed91a3d05b819418` is also intentionally unreferenced: a turn-boundary reset left only `.gitignore` and `HANDOFF.md` in its temporary blob map. The complete 42-file blob map was reconstructed before the final candidate. Never move a branch to `8f895ec...`.

## Completed in this checkpoint

- Reproduced the original Expo failure. A clean pnpm 9.12.0 frozen install proved `react-native-css-interop` was already supplied transitively by NativeWind; the original resolution error came from an incomplete local `node_modules`, so no redundant direct dependency was added.
- Replaced direct tracked Barlow TTF usage with exact `@expo-google-fonts/barlow@0.4.1` and `@expo-google-fonts/barlow-condensed@0.4.1` dependencies.
- Replaced the six platform images with FormPath SVG-derived assets at the configured exact sizes and added `tests/app-assets.test.ts`.
- Removed obsolete tracked local Barlow TTF files in the candidate Git tree.
- Changed `pnpm lint` to deterministic `eslint . --max-warnings 0`, ignored generated output, moved `onlyBuiltDependencies` to `pnpm-workspace.yaml`, converted ESLint config to CommonJS, and resolved all 31 original lint warnings.
- Removed the route-render theme debug log and added a release-readiness regression assertion.
- Removed previously tracked `web-dist/` from the candidate Git tree and added `/web-dist/` to `.gitignore` while preserving the newer remote `graphify-out/` rule.
- Added `docs/IMPLEMENTATION_STATUS.md`, updated `README.md` and `docs/PROJECT_MAP.md`, and saved the execution plan at `docs/superpowers/plans/2026-08-31-repository-sync-and-error-fixes.md`.
- Preserved the newer remote toolchain/agent/research-skill changes through `1e781eb...`. Only `.gitignore` overlapped; `/web-dist/`, `graphify-out/`, and `.research/` are all retained.

## Independent review

The pre-merge reviewer reported no Critical issues and two Important issues:

1. `web-dist/` was already tracked, so ignore-only cleanup was insufficient.
2. Status wording incorrectly said assets/fonts were absent even though the remote base tracked them.

Both are resolved in the reviewed candidate: tracked web output and obsolete TTFs are deleted, and the status document now describes replacement/migration accurately. The remote compare must still be checked before moving `main`.

## Latest verification evidence

Run after the final code and test changes:

| Command | Result |
| --- | --- |
| `CI=true corepack pnpm install --frozen-lockfile` | passed; lockfile up to date |
| `corepack pnpm check` | passed |
| `corepack pnpm lint` | passed with 0 warnings/errors |
| `corepack pnpm test:unit` | 381 passed, 1 intentional auth skip; 24 files passed, 1 skipped |
| `corepack pnpm exec expo export --platform web --output-dir web-dist` | passed; 18 static routes exported |

The Vitest CJS API deprecation notice and Expo worker `NO_COLOR` notice are upstream non-failing notices. They are not product test failures.

## Product boundary that must not change

- Front and shooting-side videos are separate, non-simultaneous shots.
- Output boundary remains exactly `representative_phase_fused_4d_estimate_not_actual_3d`.
- Basic is 1+1 with confidence capped at 0.65; High is 3+3 with a deterministic agreeing subset of at least two per view.
- Output is exactly 101 normalized phase samples and 12 cloud-allowlisted joints.
- It is not synchronized, calibrated, triangulated, metric, personal anatomy, or actual 3D.
- All three V2 flags require the exact value `"1"` and remain default-off.
- Compact persistence remains Basic 5 documents / High 9 documents, one mutation per request, head last, exact payload lengths 14,544 and 48,480 bytes, two-read viewer, and resumable revision → capture → observations → head deletion.

## Immediate continuation steps

1. Upload this `HANDOFF.md` blob.
2. Create a replacement candidate tree based on the reviewed candidate tree, then create one commit whose parent is the latest unchanged remote `main`.
3. Compare latest remote `main` to the replacement candidate. Require only the expected source/config/docs/assets changes, four obsolete font deletions, and tracked `web-dist/` deletion.
4. If remote `main` still equals the recorded parent, update `main` with `force: false`.
5. Re-read `main`, fetch the final commit, inspect combined status/workflow runs, and report exact evidence. Do not claim GitHub Actions passed unless the connector reports a successful run.

## External release gates still pending

- Firebase Rules compiler/Emulator and live Firebase integration
- clean macOS prebuild/CocoaPods/Xcode/signing
- approved detector model SHA-256, license/redistribution record, and bundle inspection
- physical iPhone matrix including HEVC/VFR/slow motion, permission denial, cancellation/background/retake, airplane mode, force-quit/reopen, deletion resumption
- synthetic, rig/optical-mocap, negative-clip, repeated-user, subgroup, and held-out scientific validation
- V2 own-history comparison/coaching, licensed/pseudonymous style comparison, and opt-in peer sharing remain future Projects 2-4
