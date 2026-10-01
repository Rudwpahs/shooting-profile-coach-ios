# Hoop Hub Personalization v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-safe, deterministic longitudinal personalization layer that compares a player only with their own comparable history, selects at most one personalized priority, and feeds only bounded stable history codes into the frozen Coach V1 request.

**Architecture:** Personalization stays outside model weights. A local owner-scoped history store records derived metric samples and retest outcomes, never raw video or raw landmarks. Pure comparison/baseline/trend/priority functions operate before the Coach model; numeric history remains local while the existing `recent_history` field carries only stable codes. Cold start falls back to the non-personalized Decision Core/Coach path.

**Tech Stack:** TypeScript; React Native/Expo; AsyncStorage already used by the app; existing shooting-profile/Coach contracts; Vitest. No new dependency and no Firestore schema change.

**Spec:** `docs/superpowers/specs/2026-10-01-hoophub-compute-efficient-coach-design.md`

## Global Constraints

- Start from the latest `main`; do not implement this on PR #19/#20/#21 branches.
- Personalization is not per-user fine-tuning. No user history is written into model weights.
- Raw video, raw landmark frames, face landmarks, URIs/paths, and native `z` are never stored in personalization history.
- No Firestore schema/rules changes in Personalization v1. History is local-first in AsyncStorage.
- Owner-scoped storage key: `@formpath/personalization/v1/<uid>`; one signed-in owner must never read another owner's local history.
- Store at most 100 session records per owner; prune oldest first deterministically.
- A record created before this feature and lacking the required context is not retroactively guessed into a comparable session.
- Comparable sessions must match: owner, shooting hand, capture protocol, shot action, evidence boundary, quality passed, and metric/unit. Current and historical measurement confidence must be at least `medium` to influence trend/priority.
- Baseline window: the most recent 5 comparable valid records; fewer than 3 means `insufficient_history` for trend.
- Baseline statistics are median + MAD. Do not compare a player to a professional-player population baseline in this layer.
- Trend states are neutral measurement directions: `increasing`, `decreasing`, `stable`, `mixed`, `insufficient_history`. Do not call an increase/decrease an improvement unless a retest success criterion explicitly defines the desired direction.
- Trend calculation uses the last 3 comparable numeric samples and `epsilon = max(MAD, 1e-9)`: both consecutive deltas `> epsilon` => increasing; both `< -epsilon` => decreasing; both absolute deltas `<= epsilon` => stable; otherwise mixed.
- Player-specific cue effectiveness requires repeated outcomes. One before/after pair is stored but never promoted to a learned preference.
- A cue/context/metric combination becomes `helpful` only after at least 2 comparable successful retests and zero failures; `not_helpful` only after at least 2 comparable failures and zero successes; otherwise `uncertain`.
- Priority selection is deterministic and returns at most one primary candidate. It consumes Decision Core candidates rather than inventing diagnoses from raw metrics.
- Priority ordering is lexicographic: eligible measurement confidence/quality -> goal relevance -> persistence count -> unresolved/not-helpful prior outcome before already-helpful -> evidence availability -> existing Decision Core order -> stable code tie-break.
- Do not change the frozen Coach V1 schema. Numeric baseline/MAD/deltas remain local; Coach receives at most 10 stable `recent_history` codes matching the existing code pattern.
- Deleting a motion profile removes local personalization records that reference its profile ID. Account deletion removes the owner-scoped personalization key.
- UI changes are out of scope for the first implementation slice; core logic/storage/evaluation land before a personalized UI.

## Review Focus

- Cross-account leakage on a shared device: owner-scoped history must never mix UIDs.
- False trend from low-quality measurements: below-medium confidence or failed capture must not affect baseline/trend/priority.
- Missing shot action/context: old or incomplete records must fail comparability rather than be guessed compatible.
- Single-pair causal overclaim: one successful retest must not mark a cue helpful.
- Profile/account deletion: derived local history must not survive deletion of the source profile/account.

---

### Task 1: Define the bounded Personalization v1 record contract

**Files:**
- Create: `lib/personalization/types.ts`
- Create: `lib/personalization/codec.ts`
- Create: `tests/personalization-codec.test.ts`

**Interfaces:**
- Produces: `PersonalizationMetricSampleV1` with frozen Coach metric code, numeric value, unit, and measurement confidence.
- Produces: `PersonalizationSessionRecordV1` with `schemaVersion: 1`, opaque `profileId`, shot action, capture protocol, shooting hand, evidence boundary, quality state, goal, metric samples, optional recommendation/drill stable codes, optional retest outcome, and ISO timestamp.
- Produces: `parsePersonalizationSessionRecordV1(value: unknown) -> PersonalizationSessionRecordV1` with closed-key validation.
- Export a runtime `PERSONALIZATION_METRICS_V1` array matching the eight frozen Coach metric names.

- [ ] **Step 1: Write failing tests for a complete record and rejection of unknown keys, raw-video/path fields, invalid boundary, duplicate metrics, mismatched units, and free-text recommendation/drill values.**
- [ ] **Step 2: Add a contract-parity test that reads `contracts/coach-observation-v1.schema.json` and pins `PERSONALIZATION_METRICS_V1` to the same metric set.**
- [ ] **Step 3: Implement strict codec/types; do not import Firebase or AsyncStorage here.**
- [ ] **Step 4: Run focused tests, typecheck, and lint; verify GREEN.**
- [ ] **Step 5: Commit `feat(personalization): define v1 history contract`.**

### Task 2: Add owner-scoped local history persistence and lifecycle cleanup

**Files:**
- Create: `lib/personalization/store.ts`
- Create: `tests/personalization-store.test.ts`
- Modify later in this task only: `lib/firebase-account-deletion.ts`
- Modify later in this task only: the existing profile-deletion call site that owns successful motion-profile deletion.

**Interfaces:**
- Produces: `loadPersonalizationHistory(uid: string) -> Promise<PersonalizationSessionRecordV1[]>`.
- Produces: `appendPersonalizationRecord(uid, record) -> Promise<void>` with max 100 records, oldest-first pruning.
- Produces: `removePersonalizationRecordsForProfile(uid, profileId) -> Promise<void>`.
- Produces: `clearPersonalizationHistory(uid) -> Promise<void>`.

- [ ] **Step 1: Write failing tests for UID isolation, malformed stored JSON fail-closed behavior, deterministic 100-record pruning, profile cleanup, and account cleanup.**
- [ ] **Step 2: Implement AsyncStorage persistence using `@formpath/personalization/v1/<uid>` and strict codec revalidation on read.**
- [ ] **Step 3: Wire profile deletion to remove matching local records only after the source profile deletion succeeds.**
- [ ] **Step 4: Wire account deletion to clear the owner-scoped key; do not alter Firestore document layout.**
- [ ] **Step 5: Run focused tests plus existing account/profile deletion tests; verify GREEN.**
- [ ] **Step 6: Commit `feat(personalization): persist owner-scoped history`.**

### Task 3: Implement comparable-history filtering and robust baseline statistics

**Files:**
- Create: `lib/personalization/baseline.ts`
- Create: `tests/personalization-baseline.test.ts`

**Interfaces:**
- Produces: `ComparableContextV1` containing action, capture protocol, shooting hand, boundary, metric, and unit.
- Produces: `selectComparableSamples(records, context, limit=5) -> PersonalizationMetricSampleWithTimeV1[]` ordered newest-first.
- Produces: `buildPersonalBaseline(samples) -> { count: number; median: number | null; mad: number | null }`.

- [ ] **Step 1: Write failing tests proving different hand/protocol/action/boundary/unit, failed quality, or below-medium confidence are excluded.**
- [ ] **Step 2: Write failing tests pinning most-recent-5 selection, median, MAD, and 0/1/2-sample behavior.**
- [ ] **Step 3: Implement pure filtering/statistics with no Coach/UI/storage side effects.**
- [ ] **Step 4: Run focused tests; verify GREEN.**
- [ ] **Step 5: Commit `feat(personalization): add comparable baseline engine`.**

### Task 4: Implement neutral longitudinal trend classification

**Files:**
- Create: `lib/personalization/trend.ts`
- Create: `tests/personalization-trend.test.ts`

**Interfaces:**
- Produces: `PersonalTrendV1 = "increasing" | "decreasing" | "stable" | "mixed" | "insufficient_history"`.
- Produces: `classifyPersonalTrend(samples, baseline) -> PersonalTrendV1` using exactly the Global Constraints formula.

- [ ] **Step 1: Write failing cases for increasing, decreasing, stable-inside-MAD, mixed, fewer-than-3, MAD=0, and low-confidence samples excluded before classification.**
- [ ] **Step 2: Implement classification without any good/bad/improved semantics.**
- [ ] **Step 3: Run focused tests; verify GREEN.**
- [ ] **Step 4: Commit `feat(personalization): classify longitudinal trends`.**

### Task 5: Track retests without converting one pair into causality

**Files:**
- Create: `lib/personalization/retest.ts`
- Create: `tests/personalization-retest.test.ts`

**Interfaces:**
- Produces: `CueEffectivenessV1 = "helpful" | "not_helpful" | "uncertain"`.
- Produces: `summarizeCueEffectiveness(records, cueCode, contextKey, metric) -> CueEffectivenessSummaryV1`.
- A retest record stores the explicit machine-readable success result produced by the drill/retest evaluator; Personalization does not infer success from prose.

- [ ] **Step 1: Write failing tests that one success remains uncertain, two successes/zero failures becomes helpful, two failures/zero successes becomes not_helpful, and mixed outcomes remain uncertain.**
- [ ] **Step 2: Add tests that context/metric changes prevent aggregation and low-confidence retests are excluded.**
- [ ] **Step 3: Implement pure aggregation.**
- [ ] **Step 4: Run focused tests; verify GREEN.**
- [ ] **Step 5: Commit `feat(personalization): summarize repeated retest outcomes`.**

### Task 6: Implement deterministic personal priority selection

**Files:**
- Create: `lib/personalization/priority.ts`
- Create: `tests/personalization-priority.test.ts`

**Interfaces:**
- Consumes Decision Core candidates as `PersonalPriorityCandidateV1 { issueCode, metric, measurementConfidence, goalRelevant, persistenceCount, priorCueEffectiveness, evidenceAvailable, decisionCoreRank }`.
- Produces: `selectPersonalPriority(candidates) -> PersonalPriorityCandidateV1 | null`.
- It never creates a new diagnosis and never returns more than one candidate.

- [ ] **Step 1: Write failing tests pinning the exact lexicographic order from Global Constraints and deterministic stable-code tie-break.**
- [ ] **Step 2: Add tests that failed/low-confidence candidates are ineligible and that an empty/unsafe set returns null.**
- [ ] **Step 3: Implement the comparator/selector.**
- [ ] **Step 4: Run focused tests; verify GREEN.**
- [ ] **Step 5: Commit `feat(personalization): select one personal priority`.**

### Task 7: Compress local history into frozen Coach V1 `recent_history` codes

**Files:**
- Create: `lib/personalization/coach-history.ts`
- Create: `tests/personalization-coach-history.test.ts`
- Do not modify: `contracts/coach-request-v1.schema.json`

**Interfaces:**
- Produces: `buildCoachHistoryCodes(input) -> string[]`, max 10 entries, each matching the frozen Coach stable-code pattern.
- Allowed code families include `history_insufficient`, `history_sufficient`, `trend_<metric>_increasing|decreasing|stable|mixed`, `prior_cue_helpful`, `prior_cue_not_helpful`, `prior_cue_uncertain`, and one selected `personal_priority_<issueCode>` when it fits the frozen code bounds.
- Numeric baseline/MAD/deltas are intentionally not serialized into `recent_history`.

- [ ] **Step 1: Write failing tests for max-10 bound, code regex/length, cold start, trend codes, cue-effectiveness codes, and deterministic ordering.**
- [ ] **Step 2: Add a fixture parity test proving the generated history is accepted by the existing frozen Coach request JSON schema.**
- [ ] **Step 3: Implement bounded code generation with no free-text fallback.**
- [ ] **Step 4: Run focused tests plus Coach contract fixture tests; verify GREEN.**
- [ ] **Step 5: Commit `feat(personalization): build coach history codes`.**

### Task 8: Add a longitudinal offline evaluation gate before product UI integration

**Files:**
- Create: `lib/personalization/evaluation.ts`
- Create: `tests/personalization-evaluation.test.ts`
- Create: `docs/ai/personalization-v1-evaluation.md`

**Interfaces:**
- Produces deterministic metrics for cold-start fallback rate, comparable-history coverage, trend stability under measurement-quality degradation, priority flip rate, and cue-effectiveness false-promotion count.
- Gate requires zero cross-owner leakage, zero single-pair helpful/not-helpful promotions, and no increase in unsupported Coach-history codes.

- [ ] **Step 1: Build synthetic longitudinal fixtures covering missing history, conflicting history, low-confidence retests, profile deletion, and repeated cue outcomes.**
- [ ] **Step 2: Write failing evaluator tests for the required safety gates.**
- [ ] **Step 3: Implement the evaluator and generate a checked-in baseline report from synthetic fixtures only.**
- [ ] **Step 4: Run all personalization tests plus repository typecheck/lint/unit tests.**
- [ ] **Step 5: Commit `test(personalization): add longitudinal evaluation gate`.**

## Execution Boundary

Personalization v1 is a later phase and must not block the current Phase 0/1 Coach work. Tasks 1-5 can be built and tested as pure/local infrastructure, but Task 6 integration must consume the real Decision Core candidate contract once Phase 2 exists. No personalized UI, server persistence, model fine-tuning, or professional-player baseline comparison is authorized by this plan.
