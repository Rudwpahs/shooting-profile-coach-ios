# Compact Representative 4D Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` and `superpowers:test-driven-development`. Complete one implementation task at a time in the shared workspace and run a specification review followed by a code-quality review before advancing.

**Goal:** Replace the unreleased 720-document High persistence plan with an exact, owner-only packed-sequence layout requiring 9 total writes while preserving the existing representative 4D product boundary, viewer result, failure safety, and default-off rollout.

**Architecture:** Pack the 101 fixed-size phase frames for each attempt into one 14,544-byte observation document and the 101 representative frames into one 48,480-byte immutable revision. Create observations, capture session, revision, then the small publication head. Firestore rules validate every document and establish an immutable observation-to-capture-to-revision-to-head proof chain.

**Tech Stack:** TypeScript 5.9, Firebase Auth/Firestore, Firestore Security Rules, Vitest 2, Expo 54, GitHub Actions, pnpm 9.12.0.

**Approved design:** `docs/superpowers/specs/2026-08-26-compact-representative-persistence-design.md`

## Global constraints

- Keep `schemaVersion: 2`, the exact evidence boundary, normalized phase time basis, 101 phases, 12 persisted joints, fixed-point scale, Basic confidence cap, and High 3+3 admission behavior unchanged.
- Keep `RULE_SAFE_BATCH_MUTATIONS_V2 = 1`; publication is a separate final mutation.
- Compact V2 only: no dual-read compatibility for the unmerged phase-document layout.
- Never persist raw media, URI, filename, EXIF, thumbnail, face/head points, source timestamps, or source `z`.
- Every decoder and viewer path fails closed on unknown keys, wrong metadata, malformed payloads, or identity mismatches.
- Keep all V2 feature flags default-off.
- Do not claim iPhone/Firebase release readiness from Linux/static tests.

---

### Task 1: Lock the compact binary contract with failing behavior tests

**Files:**
- Modify: `tests/firebase-shooting-profile-contract.test.ts`
- Modify: `lib/firebase-shooting-profile-contract.ts`

**Produces:** exact sequence constants, observation sequence serializer/validator, representative sequence serializer/decoder.

- [ ] Write literal, hand-derived tests proving one observation attempt is exactly 14,544 bytes and one representative sequence is exactly 48,480 bytes.
- [ ] Assert phase 0, 37, and 100 byte offsets independently, including the missing-visibility sentinel.
- [ ] Assert deterministic serialization and full 101-frame round trips.
- [ ] Add malformed cases for short/long/wrong-type payloads, wrong frame metadata, invalid first/middle/last observation blocks, invalid representative coordinates/cone/covariance, and a non-positive-semidefinite covariance that reaches the full profile parser.
- [ ] Run only the changed test file in a deliberately clean dependency environment and record the expected RED failures caused by the missing sequence API.
- [ ] Implement the minimum packed sequence codec by reusing the existing per-frame pack/unpack validators.
- [ ] Re-run the changed test file and require GREEN.
- [ ] Refactor names so frame byte lengths and sequence byte lengths cannot be confused, then re-run GREEN.

Mutation check: changing phase order, using 100 frames, reusing a frame-sized constant as total size, skipping the middle block, or bypassing the full profile parser must break at least one test.

---

### Task 2: Replace the Firestore write, read, recovery, and deletion plans

**Files:**
- Modify: `tests/firebase-shooting-profile-contract.test.ts`
- Modify: `lib/firebase-shooting-profiles.ts`

**Consumes:** Task 1 sequence codec.

- [ ] Add failing plan tests with literal expectations: Basic has 4 staging writes and 5 total; High has 8 staging writes and 9 total.
- [ ] Assert canonical staging order: observation documents, capture session, revision; publication head is absent from staging and last overall.
- [ ] Assert no path contains `/frameChunks/`, `/sequenceChunks/`, or `/phaseSummaries/`.
- [ ] Assert exact `Bytes` values and compact metadata on every observation/revision, and exact storage layout on every document.
- [ ] Add failing viewer tests that reconstruct 101 frames using only head plus revision, and reject wrong layout, wrong payload size/type, unknown keys, identity mismatches, and corrupted covariance.
- [ ] Add failing recovery tests proving ambiguous matching `Bytes` are acknowledged, mismatches are not cleaned, uncertain publication retains evidence, and known failed staging cleanup runs in reverse dependency order.
- [ ] Add failing deletion tests proving compact subordinate paths are derived without collection enumeration and are deleted revision-first, capture-next, observations-next, head-last.
- [ ] Run the changed tests in the clean environment and record RED.
- [ ] Implement compact documents and validators; remove phase-document writers/readers/enumerators and obsolete types/constants from active V2 code.
- [ ] Re-run changed tests and require GREEN.

Mutation check: restoring any per-phase path, publishing before revision, accepting a metadata-only revision, comparing `Bytes` by object identity, or deleting the head early must fail.

---

### Task 3: Enforce the immutable evidence chain in Firestore Rules

**Files:**
- Modify: `tests/firestore-shooting-profile-rules.test.ts`
- Modify: `firestore.rules`

**Consumes:** exact Task 2 field sets and path order.

- [ ] Replace source-text assertions with parser/evaluator assertions wherever the current test harness can exercise actual rule expressions.
- [ ] Add failing cases for observation payload lengths 14,543/14,544/14,545 and representative lengths 48,479/48,480/48,481.
- [ ] Add failing cases for unknown fields, wrong path identity, wrong canonical attempt ID, wrong layout, wrong owner, unauthenticated access, and attempted updates.
- [ ] Add stored-evidence cases: capture denied before all canonical observations; revision denied before matching capture; head denied before a fully valid stored revision; valid order accepted.
- [ ] Seed a metadata-only or wrong-sized revision and prove publication still fails because the head rule invokes the full stored-revision validator.
- [ ] Add deletion cases: active-head subordinate deletion denied; `in_progress` deletion allowed; unpublished cleanup must follow revision, capture, observations; head deleted last.
- [ ] Implement exact compact validators, remove phase subcollection matches, add no-head create guards, and implement the chained `get()` validation.
- [ ] Require the conservative rule-expression estimate to stay at or below 700 and document maximum access calls per operation.
- [ ] Run the rules tests and require GREEN. Run the real Firebase Emulator suite when the environment is available; otherwise leave it explicitly pending, never inferred from static tests.

Mutation check: weakening owner checks, omitting actual `Bytes.size()`, checking only revision metadata, allowing post-publication append, or permitting active-head subordinate deletion must fail.

---

### Task 4: Add clean, hermetic pull-request CI

**Files:**
- Modify: `package.json`
- Create: `.github/workflows/representative-4d-ci.yml`
- Modify as required by clean findings: TypeScript/lint test fixtures only

- [ ] Add a hermetic unit-test script that excludes the live Identity Toolkit/Firebase configuration test.
- [ ] Configure pull-request and manual CI with Node 22, exact pnpm 9.12.0, Corepack, and `pnpm install --frozen-lockfile`.
- [ ] Run typecheck, lint, hermetic tests, and `expo export --platform web` in separate named steps.
- [ ] Do not run write-formatting, database push, live Firebase configuration, CocoaPods, or signing in Ubuntu CI.
- [ ] Reproduce the same commands in a fresh local temp copy when cached dependencies permit; never use the quarantined repository `node_modules` as evidence.
- [ ] Push the workflow and inspect the real GitHub Actions result. Fix only failures caused by this branch; record pre-existing or environment-only blockers precisely.

Mutation check: changing the package-manager version, removing the frozen lockfile, reintroducing the live Firebase test, or skipping a required command must be visible in workflow review.

---

### Task 5: Update protocol documentation and perform independent review

**Files:**
- Modify: `docs/representative-4d-validation-protocol.md`
- Modify: `docs/iphone-custom-build-qa.md` only if command/path references change
- Update: `.superpowers/sdd/2026-08-26-compact-representative-persistence/progress.md`

- [ ] Replace the 720-write storage description with the exact Basic 5/High 9 layout and document packed lengths, read count, direct deletion, and rule limitations.
- [ ] Confirm product language still says representative estimate, never actual/calibrated/metric 3D.
- [ ] Run an independent specification review against this plan.
- [ ] Run an independent code-quality/security review and resolve all High/Medium findings within scope.
- [ ] Search the repository for stale active references to 101 chunk documents, 720 staging writes, and removed paths; retain such text only when explicitly describing history.

---

### Task 6: Final verification and Draft PR

- [ ] Re-fetch the exact remote branch head before publishing any final commit; use only fast-forward GitHub tree/commit/ref updates.
- [ ] Run the narrow contract/rules tests, hermetic suite, typecheck, lint, and web export in a clean environment or via the branch workflow.
- [ ] Verify the three V2 flags still require an exact environment value of `1` and default off.
- [ ] Confirm `main` is still the merge base and the branch is not behind; do not merge automatically.
- [ ] Create or update a **Draft PR** summarizing the 721-to-9 High write reduction, security proof chain, tests, and all pending external gates.
- [ ] Leave Firebase Emulator, clean macOS prebuild/CocoaPods/Xcode, approved model SHA/license, bundle inspection, and physical-iPhone tests clearly unchecked until actually completed.

Definition of done for this implementation session: compact code and tests are committed to the feature branch, trustworthy automated results are attached where available, independent reviews are resolved, flags remain off, and the Draft PR truthfully separates implemented behavior from pending release gates.
