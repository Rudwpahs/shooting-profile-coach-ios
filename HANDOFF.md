# FormPath repository handoff

Last updated: 2026-08-31 UTC

## Current checkpoint

- Repository: `Rudwpahs/shooting-profile-coach-ios`
- Integration target: `main`
- Remote `main` inspected for this repair: `208e7e63073abd5f56862b08c02ad0277df134cc` (`Add verifier ensemble and novelty research routing`).
- `Representative 4D CI` run `33391227022` / run number 42 failed only at `Typecheck`; lint, unit tests, and web export were skipped by the workflow after that failure.
- Root cause: `LandmarkSequenceV2.metadata` gained mandatory native evidence fields, but the two synthetic metadata fixtures in `tests/shooting-profile-phase-normalization.test.ts` still used the older shape.
- Repair: mirror the complete native evidence structure in both synthetic fixtures and append matching attempt evidence when a duplicate frame is added. No production runtime or representative-4D algorithm behavior is changed.
- Integration policy: update `main` only with `force: false`; re-read remote `main` immediately before and after the update.
- Primary implementation commit `4c700da9fd30f4484b718225119227a6c5eba674` and handoff commit `a84ea9f65f333d61000fed13f10cccdb73071204` remain ancestors of current `main`.
- The eight commits from `a84ea9f...` through `208e7e6...` changed only agent/research documentation. This repair is based directly on the `208e7e6...` tree so all newer work remains preserved.
- GitHub Actions success is not claimed until the repair's push run completes successfully.
- Earlier review candidates remain intentionally unreferenced. In particular, never move a branch to incomplete candidate `8f895ecff260f49c9a510fd3ed91a3d05b819418`.

## Completed in this checkpoint

- Reproduced the original Expo failure. A clean pnpm 9.12.0 frozen install proved `react-native-css-interop` was already supplied transitively by NativeWind; the original resolution error came from an incomplete local `node_modules`, so no redundant direct dependency was added.
- Replaced direct tracked Barlow TTF usage with exact `@expo-google-fonts/barlow@0.4.1` and `@expo-google-fonts/barlow-condensed@0.4.1` dependencies.
- Replaced the six platform images with FormPath SVG-derived assets at the configured exact sizes and added `tests/app-assets.test.ts`.
- Removed obsolete tracked local Barlow TTF files in the candidate Git tree.
- Changed `pnpm lint` to deterministic `eslint . --max-warnings 0`, ignored generated output, moved `onlyBuiltDependencies` to `pnpm-workspace.yaml`, converted ESLint config to CommonJS, and resolved all 31 original lint warnings.
- Removed the route-render theme debug log and added a release-readiness regression assertion.
- Removed previously tracked `web-dist/` from the candidate Git tree and added `/web-dist/` to `.gitignore` while preserving the newer remote `graphify-out/` rule.
- Added `docs/IMPLEMENTATION_STATUS.md`, updated `README.md` and `docs/PROJECT_MAP.md`, and saved the execution plan at `docs/superpowers/plans/2026-08-31-repository-sync-and-error-fixes.md`.
- Preserved the newer remote toolchain/agent/research-skill changes through `1e781eb...`, plus the later meta-study commit `e7c5921...`. Only `.gitignore` overlapped during implementation; `/web-dist/`, `graphify-out/`, and `.research/` are all retained.

## Independent review

The pre-merge reviewer reported no Critical issues and two Important issues:

1. `web-dist/` was already tracked, so ignore-only cleanup was insufficient.
2. Status wording incorrectly said assets/fonts were absent even though the remote base tracked them.

Both are resolved in the merged implementation: tracked web output and obsolete TTFs are deleted, and the status document now describes replacement/migration accurately. The complete remote comparison was checked before moving `main`, and the branch update used `force: false`.

## Latest verification evidence

Run after the final code and test changes:

| Command | Result |
| --- | --- |
| `CI=true corepack pnpm install --frozen-lockfile` | passed; lockfile up to date |
| `corepack pnpm check` | passed |
| `corepack pnpm lint` | passed with 0 warnings/errors |
| `corepack pnpm test:unit` | 381 passed, 1 intentional auth skip; 24 files passed, 1 skipped |
| `corepack pnpm exec expo export --platform web --output-dir web-dist` | passed; 18 static routes exported |

CI-repair verification on the `208e7e6...` runtime tree plus the fixture patch:

| Command | Result |
| --- | --- |
| `corepack pnpm check` | passed; the two `TS2739` errors from run 42 are absent |
| `corepack pnpm lint` | passed with 0 warnings/errors |
| `corepack pnpm test:unit` | 381 passed, 1 intentional auth skip; 24 files passed, 1 skipped |
| `corepack pnpm exec expo export --platform web --output-dir <temporary-directory>` | passed; 18 static routes exported |

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

1. Confirm the new `Representative 4D CI` push run for this repair reaches `success`; local verification does not substitute for the GitHub result.
2. Start P0 release-gate work in this order: Firebase Emulator → clean macOS/Xcode → model checksum/license/bundle → physical-iPhone smoke matrix.
3. Keep the three V2 flags off until the external and scientific gates below are recorded and reviewed.
4. Update this file after every meaningful checkpoint so a new session can continue from the exact current state.

## External release gates still pending

- Firebase Rules compiler/Emulator and live Firebase integration
- clean macOS prebuild/CocoaPods/Xcode/signing
- approved detector model SHA-256, license/redistribution record, and bundle inspection
- physical iPhone matrix including HEVC/VFR/slow motion, permission denial, cancellation/background/retake, airplane mode, force-quit/reopen, deletion resumption
- synthetic, rig/optical-mocap, negative-clip, repeated-user, subgroup, and held-out scientific validation
- V2 own-history comparison/coaching, licensed/pseudonymous style comparison, and opt-in peer sharing remain future Projects 2-4
