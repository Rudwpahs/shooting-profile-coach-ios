# SDD ledger — plan: docs/superpowers/plans/2026-08-26-compact-representative-persistence.md

- Workspace isolation: remote branch `codex/representative-dual-view-4d`; local snapshot has no Git metadata, so remote updates must use fast-forward GitHub tree/commit/ref operations.
- Approved design: `docs/superpowers/specs/2026-08-26-compact-representative-persistence-design.md`.
- Baseline remote state: `main` at `c09eb573cc9bed122c04f907e5a83d2c216973ba`; feature branch at `5b1db614ea19c245d6148b53911a331db3d7bc3a`, 53 commits ahead and 0 behind; no PR found at kickoff.
- Dependency evidence: repository `node_modules` is quarantined because its internal pnpm lock differs from the committed lockfile. It must not be used for completion claims.
- Task 1 compact codec: pending.
- Task 2 compact persistence service: pending.
- Task 3 Firestore rule chain: pending.
- Task 4 clean CI: pending.
- Task 5 documentation and independent review: pending.
- Task 6 final verification and Draft PR: pending.
- External release gates: Firebase Emulator, live Firebase integration, clean macOS prebuild/CocoaPods/Xcode, approved model SHA/license, bundle inspection, and physical-iPhone acceptance remain pending.
