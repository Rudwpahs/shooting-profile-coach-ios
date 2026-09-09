# Hoop Hub Codex System / Data / AI Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete non-UI Hoop Hub system lane: frozen cross-language Coach contracts, privacy-safe representative-profile and public-motion projections, deterministic product behavior, evidence-aware RAG and training, a hardened remote Coach service, automated verification, and a pushable Claude handoff.

**Architecture:** Start from the approved PR #5 integration-spec baseline and merge the isolated PyTorch Coach scaffold without modifying Claude-owned UI. Keep private representative evidence, compact public motion, Coach observations, deterministic feed events, and remote-model assets as separate versioned boundaries. The app consumes a provider interface whose deterministic implementation remains usable when the remote model is unavailable.

**Tech Stack:** TypeScript, Zod, Vitest, Expo/React Native domain libraries, Python 3.11+, Pydantic v2, PyTorch, Transformers, PEFT, FastAPI, deterministic lexical retrieval, JSONL fixtures.

**Spec:** `docs/superpowers/specs/2026-09-09-hoop-hub-integrated-experience.md`

## Global Constraints

- Do not edit Claude-owned `app/**`, Home/Reel route files, `components/feed/**`, `components/motion-lift/**`, or PR #5 visual tokens.
- Do not merge or weaken PR #4 before its physical-iPhone Basic 1+1 gate passes.
- Preserve the exact boundary literal `representative_phase_fused_4d_estimate_not_actual_3d`.
- Coach input excludes raw video, face data, raw MediaPipe landmarks, native z, filenames, URIs, per-frame private evidence, and unnecessary covariance arrays.
- A model visual cue references an existing observation ID; it never carries generated coordinates.
- Coach feed eligibility, priority, cooldown, and deduplication are deterministic and never model-controlled.
- Corpus, prompts, adapters, production policy, credentials, and player memory remain server-side.
- Deterministic Coach behavior remains the product fallback until model evaluation gates pass.
- No direct `main` push and no force push.

---

### Task 1: Freeze the Codex integration base and import the Coach scaffold

**Files:**
- Create: `docs/integration/codex-system-ai-state.md`
- Merge content: `ml/coach/**` from `origin/feat/formpath-coach-pytorch@49a35243ef7030b614547afc2f979c4278bc6096`

**Interfaces:**
- Consumes: integration baseline `db129da7a5b3b974aba69fdaf567fa0a485512ad`
- Produces: a buildable `ml/coach` package and pinned branch-state record

- [ ] **Step 1: Record the five verified branch heads and forbidden write scopes in the state document.**
- [ ] **Step 2: Merge the Coach branch without committing, inspect `git diff --name-status`, and abort if the merge changes Claude-owned files.**
- [ ] **Step 3: Run the existing 79-test offline Python Coach suite.**

Run: `ml/coach/.venv/Scripts/python -m pytest ml/coach/tests -q`

Expected: all existing Coach tests pass without network/model downloads.

- [ ] **Step 4: Commit the verified integration base.**

```bash
git add docs/integration/codex-system-ai-state.md ml/coach
git commit -m "chore(coach): establish Codex system integration base"
```

### Task 2: Freeze the cross-language Coach V1 contract

**Files:**
- Create: `contracts/coach-request-v1.schema.json`
- Create: `contracts/coach-response-v1.schema.json`
- Create: `contracts/fixtures/coach-request-v1.golden.json`
- Create: `contracts/fixtures/coach-response-v1.golden.json`
- Create: `lib/coach/contract.ts`
- Create: `tests/coach-contract.test.ts`
- Modify: `ml/coach/src/formpath_coach/schemas.py`
- Create: `ml/coach/scripts/export_schema.py`
- Create: `ml/coach/tests/test_schema_export.py`

**Interfaces:**
- Produces: `CoachObservationV1`, `CoachRequestV1`, `CoachResponseV1`, `PrimaryVisualCueV1`, `parseCoachRequestV1`, `parseCoachResponseV1`
- `PrimaryVisualCueV1 = { observation_id: string; label: string }`

- [ ] **Step 1: Add failing Python and TypeScript golden-contract tests.**
- [ ] **Step 2: Run focused tests and confirm missing V1 schemas/types fail.**
- [ ] **Step 3: Implement versioned closed-world Pydantic and Zod contracts with canonical joint, source, confidence, phase, evidence, hypothesis, drill, and retest literals/ranges.**
- [ ] **Step 4: Implement response validation that rejects a `primary_visual_cue.observation_id` absent from the paired request.**
- [ ] **Step 5: Export stable JSON Schemas and verify committed files byte-match regenerated output.**
- [ ] **Step 6: Run focused Python and TypeScript tests.**

Run: `corepack pnpm test:unit -- tests/coach-contract.test.ts`

Run: `ml/coach/.venv/Scripts/python -m pytest ml/coach/tests/test_schema_export.py ml/coach/tests/test_schemas.py -q`

- [ ] **Step 7: Commit the frozen contract and fixture set.**

```bash
git add contracts lib/coach/contract.ts tests/coach-contract.test.ts ml/coach
git commit -m "feat(coach): freeze shared Coach V1 contract"
```

### Task 3: Build MotionPacketV1 as a separate compact public projection

**Files:**
- Create: `lib/public-motion/contract.ts`
- Create: `lib/public-motion/codec.ts`
- Create: `lib/public-motion/from-representative.ts`
- Create: `contracts/fixtures/motion-packet-v1.golden.json`
- Create: `contracts/fixtures/motion-packet-v1.golden.bin`
- Create: `tests/public-motion-codec.test.ts`

**Interfaces:**
- Produces: `MotionPacketV1`, `encodeMotionPacketV1`, `decodeMotionPacketV1`, `buildMotionPacketV1`
- Packet contains schema version, canonical 12-joint order, normalized phase time basis, handedness, boundary literal, fixed quantization metadata, and signed integer joint samples.

- [ ] **Step 1: Write failing round-trip, byte-stability, malformed-input, size, and privacy tests.**
- [ ] **Step 2: Confirm tests fail because packet APIs do not exist.**
- [ ] **Step 3: Implement allowlist-only projection from `RepresentativePose4DV2` and a length-prefixed binary codec with bounds/finite-number checks.**
- [ ] **Step 4: Generate deterministic JSON and binary fixtures and assert their SHA-256 digests.**
- [ ] **Step 5: Run focused tests and commit.**

```bash
corepack pnpm test:unit -- tests/public-motion-codec.test.ts
git add lib/public-motion contracts/fixtures tests/public-motion-codec.test.ts
git commit -m "feat(motion): add compact public MotionPacket V1"
```

### Task 4: Adapt RepresentativePose4DV2 into privacy-safe Coach observations

**Files:**
- Create: `lib/coach/confidence-map.ts`
- Create: `lib/coach/representative-profile-adapter.ts`
- Create: `lib/coach/privacy.ts`
- Create: `tests/coach-representative-profile-adapter.test.ts`

**Interfaces:**
- Produces: `buildCoachObservations(profile, shootingHand)`, `buildCoachRequestV1(input)`, `assertCoachRequestPrivacyV1(value)`
- Initial metrics are direct geometry/phase observations only: release-phase elbow flexion, release-phase wrist-over-elbow alignment, stance width ratio, and phase-timing anchors when available.

- [ ] **Step 1: Write failing deterministic-ID, monotonic-confidence, boundary-caveat, compactness, and recursive forbidden-field tests.**
- [ ] **Step 2: Confirm focused tests fail on missing adapter APIs.**
- [ ] **Step 3: Implement finite geometry calculations over persisted joints and use heuristic uncertainty only as measurement reliability, never causal confidence.**
- [ ] **Step 4: Reject raw/private field names and values recursively before a Coach request leaves the app domain.**
- [ ] **Step 5: Prove repeated serialization is byte-stable and increased uncertainty never increases confidence.**
- [ ] **Step 6: Run focused tests and commit.**

```bash
corepack pnpm test:unit -- tests/coach-representative-profile-adapter.test.ts
git add lib/coach tests/coach-representative-profile-adapter.test.ts
git commit -m "feat(coach): derive grounded observations from representative motion"
```

### Task 5: Add deterministic and remote Coach providers plus feed events

**Files:**
- Create: `lib/coach/provider.ts`
- Create: `lib/coach/deterministic-provider.ts`
- Create: `lib/coach/remote-provider.ts`
- Create: `lib/coach/feed-event.ts`
- Create: `tests/coach-provider.test.ts`
- Create: `tests/coach-feed-event.test.ts`

**Interfaces:**
- Produces: `CoachProvider`, `CoachResultV1`, `DeterministicCoachProvider`, `RemoteCoachProvider`, `CoachFeedEventV1`, `rankEligibleCoachFeedEventsV1`
- Result states: `ready | unavailable | cancelled | stale | invalid_response`
- Event classes: `new_material_finding | repeated_issue | meaningful_improvement | retest_due | recapture_explanation`

- [ ] **Step 1: Write failing tests for deterministic response grounding, cancellation, stale generation, invalid remote schema, 5xx unavailability, zero-event output, priority, cooldown, and deduplication.**
- [ ] **Step 2: Confirm focused tests fail on missing provider/event APIs.**
- [ ] **Step 3: Implement a deterministic provider that selects only supplied observations and returns one reversible intervention plus retest.**
- [ ] **Step 4: Implement a remote provider with AbortSignal, timeout, request hash, response schema validation, stale-key rejection, and no production body logging.**
- [ ] **Step 5: Implement pure deterministic feed eligibility/ranking; accept only measured history and never model prose.**
- [ ] **Step 6: Run focused tests and commit.**

```bash
corepack pnpm test:unit -- tests/coach-provider.test.ts tests/coach-feed-event.test.ts
git add lib/coach tests/coach-provider.test.ts tests/coach-feed-event.test.ts
git commit -m "feat(coach): add providers and deterministic feed events"
```

### Task 6: Define public loading/cache and owner-private saved-moment boundaries

**Files:**
- Create: `lib/public-motion/loader.ts`
- Create: `lib/public-motion/cache.ts`
- Create: `lib/saved-moment/contract.ts`
- Create: `lib/saved-moment/provider.ts`
- Create: `tests/public-motion-loader.test.ts`
- Create: `tests/saved-moment-contract.test.ts`

**Interfaces:**
- Produces: `PublicMotionLoader`, `PublicMotionState`, `PublicMotionCache`, `SavedMomentV1`, `SavedMomentProvider`
- Loader states: `idle | loading | ready | unavailable`; saved data contains only post ID, schema version, normalized phase or media time, and timestamp.

- [ ] **Step 1: Write failing cancellation, stale-post, malformed-packet, cache-bound, and saved-field allowlist tests.**
- [ ] **Step 2: Implement bounded active/adjacent caching with explicit cancellation and no dependency from video playback to motion success.**
- [ ] **Step 3: Implement the storage-agnostic saved-moment interface and reject cutout, mask, thumbnail, yaw, gesture path, URI, and raw motion arrays.**
- [ ] **Step 4: Run focused tests and commit.**

```bash
corepack pnpm test:unit -- tests/public-motion-loader.test.ts tests/saved-moment-contract.test.ts
git add lib/public-motion lib/saved-moment tests
git commit -m "feat(system): add public motion and saved-moment boundaries"
```

### Task 7: Build canonical research ingestion, deterministic RAG, and scenario generation

**Files:**
- Create: `ml/coach/src/formpath_coach/research.py`
- Create: `ml/coach/src/formpath_coach/retrieval.py`
- Create: `ml/coach/src/formpath_coach/scenarios.py`
- Create: `ml/coach/src/formpath_coach/evaluation.py`
- Create: `ml/coach/tests/fixtures/research_units.jsonl`
- Create: `ml/coach/tests/test_research.py`
- Create: `ml/coach/tests/test_retrieval.py`
- Create: `ml/coach/tests/test_scenarios.py`
- Create: `ml/coach/tests/test_evaluation.py`
- Modify: `ml/coach/.gitignore`

**Interfaces:**
- Produces: `ResearchUnitV1`, `CanonicalResearchCorpus`, `DeterministicRetrieverV1`, `ScenarioBuilderV1`, `evaluate_retrieval_v1`
- Private source paths and verbatim corpus stay ignored; committed fixtures contain synthetic non-sensitive examples only.

- [ ] **Step 1: Write failing tests for duplicate occurrence preservation, malformed lines, source hashes/spans, evidence tiers, supported/forbidden inferences, contradictions, retrieval determinism, citation closure, and source-held-out scenarios.**
- [ ] **Step 2: Implement lossless occurrence-level canonical ingestion with explicit derivation metadata and no invented missing units.**
- [ ] **Step 3: Implement deterministic BM25-style lexical retrieval with contradiction-group diversification and stable tie-breaking.**
- [ ] **Step 4: Implement scenario construction from observations plus retrieved evidence; never use copied research prose as the assistant response.**
- [ ] **Step 5: Run the private FormPath canonical ledger through ingestion outside Git and record counts/hashes in a non-sensitive manifest.**
- [ ] **Step 6: Run focused tests and commit code, synthetic fixtures, and sanitized manifest only.**

```bash
ml/coach/.venv/Scripts/python -m pytest ml/coach/tests/test_research.py ml/coach/tests/test_retrieval.py ml/coach/tests/test_scenarios.py ml/coach/tests/test_evaluation.py -q
git add ml/coach
git commit -m "feat(coach): add provenance-aware offline RAG pipeline"
```

### Task 8: Train, evaluate, and harden the remote Coach service

**Files:**
- Modify: `ml/coach/src/formpath_coach/train_sft.py`
- Modify: `ml/coach/src/formpath_coach/inference.py`
- Modify: `ml/coach/src/formpath_coach/api.py`
- Create: `ml/coach/src/formpath_coach/security.py`
- Create: `ml/coach/src/formpath_coach/service.py`
- Create: `ml/coach/tests/test_security.py`
- Create: `ml/coach/tests/test_service.py`
- Create: `ml/coach/scripts/evaluate_adapter.py`
- Create: `ml/coach/artifacts/model-card-v1.md`
- Create: `ml/coach/artifacts/manifests/coach-adapter-v1.json`

**Interfaces:**
- Produces: authenticated `/v1/coach`, health/readiness separation, server-side retrieval, sanitized public citations, request limits, concurrency/rate limits, deterministic fallback, and a verified adapter manifest.

- [ ] **Step 1: Write failing tests for missing/invalid auth, oversized body, unknown fields, prompt injection, caller-supplied citation spoofing, cross-player access, timeouts, concurrency, internal-error redaction, and fallback behavior.**
- [ ] **Step 2: Implement service-owned retrieval and confidence/citation firewall; the model may draft wording but cannot set permissions, measurement values, evidence strength, or feed priority.**
- [ ] **Step 3: Generate reviewed training scenarios from the private canonical corpus and freeze a source-held-out evaluation set.**
- [ ] **Step 4: Train a hardware-feasible Qwen3 adapter with exact model revision, seed, data hash, command, runtime, GPU, loss, and output digest recorded.**
- [ ] **Step 5: Evaluate schema validity, observation grounding, citation closure, forbidden inference rate, uncertainty separation, drill/retest presence, and deterministic fallback.**
- [ ] **Step 6: Promote only if declared thresholds pass; otherwise leave remote model disabled and document the failed gate without claiming production readiness.**
- [ ] **Step 7: Run focused/full Python tests and commit source, tests, model card, and non-sensitive manifests; keep weights/data ignored.**

```bash
ml/coach/.venv/Scripts/python -m pytest ml/coach/tests -q
git add ml/coach
git commit -m "feat(coach): harden and verify evidence-aware Coach service"
```

### Task 9: Run automated gates, review, push, and hand off

**Files:**
- Create: `docs/integration/codex-interface-manifest.md`
- Create: `docs/integration/codex-system-ai-handoff.md`
- Modify: `docs/integration/codex-system-ai-state.md`

**Interfaces:**
- Produces: exact exported types/functions, fixture paths/hashes, model/runtime status, commit list, changed-file list, test evidence, and unresolved external gates for Claude/coordinator.

- [ ] **Step 1: Run TypeScript check, lint, all unit tests, Python tests, schema regeneration check, privacy checks, and Expo web export.**
- [ ] **Step 2: Run Firebase emulator tests only if rules or persistence implementation changed; otherwise record that they were not in scope.**
- [ ] **Step 3: Request independent code/security review and resolve every critical/important finding.**
- [ ] **Step 4: Re-run all affected and full automated gates from a clean worktree.**
- [ ] **Step 5: Write the interface manifest and final handoff, explicitly retaining PR #4 physical-iPhone and Claude UI integration as external gates.**
- [ ] **Step 6: Commit final handoff and push the Codex branch without force.**

```bash
git add docs/integration
git commit -m "docs: hand off verified Codex system and Coach lane"
git push -u origin work/codex-hoop-hub-system-ai
```

**Definition of Codex-lane completion:** all additive system contracts, codecs, adapters, providers, event logic, data/RAG/training/service code, fixtures, automated tests, non-sensitive manifests, and handoff are committed and pushed. Claude-owned UI integration and PR #4 physical-iPhone evidence remain explicit external release gates and are not falsified or bypassed.
