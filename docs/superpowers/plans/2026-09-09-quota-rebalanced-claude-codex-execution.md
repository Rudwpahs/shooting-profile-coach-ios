# Hoop Hub Quota-Rebalanced Claude + Codex Execution Plan

Verified against repository state: 2026-09-09

## Trigger

Codex exhausted the advanced-model allowance before implementation began and fell back to Luna. The current screenshot shows Luna Reserve still available, but advanced model access is unavailable until the displayed reset time. Claude's product/UI lane is already pushed and stopped cleanly at the C1 Gate.

## Ground truth before reallocation

- Approved integration/spec branch: `plan/hoop-hub-ui-ai-motion-integration` @ `db129da7`.
- Claude product/UI lane: `work/claude-hoop-hub-product-ui` @ `1957969`, pushed, clean, C1 Gate reached.
- Claude C1 includes Reel harness + Motion Lift prototype + tests/handoff and deliberately made no shared Coach-contract changes.
- `feat/formpath-coach-pytorch` @ `49a3524` is still an experimental scaffold: schemas/SFT/inference/FastAPI exist; corpus/RAG/trained model/mobile bridge do not.
- No remote `work/codex-hoop-hub-system-ai` branch was visible when this plan was written. The Codex session had generated a local `2026-09-09-codex-system-ai-lane.md` plan and then hit the advanced usage limit.
- PR #4 physical-iPhone merge gate remains mandatory and must not be bypassed.

## Principle

Do not ask the weaker fallback model to make irreversible architecture/security decisions merely to keep both agents busy. Rebalance by criticality:

- **Claude = critical-path contract owner until C2 freeze.**
- **Codex/Luna = bounded, pure, low-risk independent work only.**
- **After advanced Codex resets = Codex resumes security/backend/ML-heavy lane.**

Use isolated branches/worktrees. Never let Claude and Codex edit the same file set concurrently.

---

# Phase 0 — serial salvage gate (Codex/Luna, short)

Before any new implementation, Codex must preserve the work it already produced.

### Codex ownership

1. Create/use `work/codex-hoop-hub-system-ai` from `db129da7` if it does not exist.
2. Add the generated `2026-09-09-codex-system-ai-lane.md` under `docs/superpowers/plans/`.
3. Add `docs/integration/codex-quota-handoff.md` containing:
   - current model state: advanced quota exhausted / Luna fallback;
   - exact branch/worktree;
   - files changed so far;
   - explicit statement whether any production code was implemented;
   - tests run;
   - uncommitted changes;
   - next safe task.
4. Commit and push those docs only.
5. Do not claim the system/AI lane is complete.

**Gate Q0:** the plan/handoff exists on origin and Claude can read it read-only.

---

# Phase 1 — parallel until C2 contract freeze

## Lane A — Claude: critical Coach contract takeover

Create a NEW isolated worktree/branch. Do not continue contract work on the completed product UI branch.

Recommended branch: `work/claude-hoop-hub-system-contracts`
Base: `plan/hoop-hub-ui-ai-motion-integration` @ `db129da7`

Claude owns ONLY these areas during Phase 1:

- `contracts/coach-*.schema.json`
- `lib/coach/contract.ts`
- `lib/coach/representative-profile-adapter.ts`
- `lib/coach/confidence-map.ts`
- `lib/coach/provider.ts`
- `lib/coach/deterministic-provider.ts`
- `lib/coach/remote-provider.ts`
- `lib/coach/feed-event.ts` or equivalent CoachFeedEvent contract
- `hooks/use-coach-insight.ts` only if needed for provider boundary tests, not product-screen integration
- matching `tests/coach-*.test.ts`
- `ml/coach/src/formpath_coach/schemas.py`
- schema export/parity scripts/tests required to keep TypeScript and Python contracts identical

### Required serial order inside Claude lane

A1. Integrate/read the existing `feat/formpath-coach-pytorch` scaffold without relabeling it trained.

A2. Define and test versioned `CoachRequestV1` / `CoachResponseV1` / `CoachObservationV1` / `PrimaryVisualCueV1`.

A3. Cross-language parity gate: Python-exported JSON schema and TypeScript runtime validation must accept/reject the same golden/negative fixtures.

A4. Build `RepresentativePose4DV2 -> CoachObservationV1[]` adapter. It must not serialize raw video, face landmarks, raw MediaPipe landmarks, native z, filenames/URIs, full private frame evidence, or unsupported biomechanical claims.

A5. Add swappable CoachProvider + deterministic provider + typed unavailable/cancel/stale behavior.

A6. Define `CoachFeedEventV1` as a thin product event that references grounded observations/Coach response fields; no arbitrary generated coordinates.

A7. Run focused tests, then full relevant TS/Python suites. Commit each independently reviewable task.

A8. Push and write `docs/integration/claude-c2-contract-handoff.md` with exact exported interfaces and fixtures.

**C2 CONTRACT FREEZE:** Once A2-A6 are green and pushed, Claude must not silently change field names/types. Any later contract change requires an explicit migration commit and notification to the UI/backend lanes.

## Lane B — Codex/Luna: pure public MotionPacket only

After Q0, Luna may work only on the independent pure codec task. Do not touch Coach/Python/UI/Firebase/RAG files.

Recommended ownership:

- `lib/reels/motion-packet-v1.ts`
- `tests/motion-packet-v1.test.ts`
- optionally `scripts/build-motion-packet.ts` if it remains a pure local codec/fixture tool
- codec-format documentation under `docs/integration/`

Required behavior:

- versioned header;
- fixed 12-joint canonical order;
- shooting hand + canonical phase/anchor information sufficient for rendering;
- int16 quantized xyz render coordinates;
- deterministic encoding;
- strict decoding and malformed-input rejection;
- declared visual-error tolerance tested against representative fixtures;
- NO uncertainty/covariance/private capture evidence;
- NO Firestore changes;
- NO network/storage implementation;
- NO UI changes;
- NO new 3D engine/dependency.

If the Luna session cannot prove codec correctness with tests, stop after planning/tests rather than improvising production format changes.

**B1 Gate:** commit+push codec only, with tests and handoff. Do not call the whole Codex lane complete.

---

# Phase 2 — after C2 freeze: parallel product wiring + storage/security

## Claude product lane

Use the already verified `work/claude-hoop-hub-product-ui` @ `1957969` as the visual baseline. Create an integration branch/worktree rather than rewriting its history.

Inputs:

- C2 frozen Coach contracts/provider fixtures from Claude system-contract branch;
- B1 MotionPacket decoder if Codex finished it.

Claude owns:

- `CoachReel` feed item UI;
- `UserReel | CoachReel | ReferenceReel` rendering shell;
- Motion Lift primary grounded Coach cue;
- detail sheet/action using structured Coach response;
- haptics/reduced-motion/accessibility/compact-height behavior;
- fixture adapters replaced with frozen production interfaces;
- no Firestore/security schema design.

Default Reel remains video-first. CoachReel appears only when a meaningful feed event exists. Motion Lift AI is pull-based; CoachReel is push-based. Both share the same grounded Coach contract.

## Codex after advanced-model reset

Do not do the following with Luna if the advanced quota is still exhausted. Resume only when advanced access is available or when another strong model explicitly takes ownership.

Codex advanced owns:

1. public `reelPosts` + `savedReels` persistence boundary;
2. Firestore rules + emulator abuse/privacy tests;
3. object-storage references for video + compact motion packet;
4. Coach remote service auth/rate-limit/log-redaction/security hardening;
5. FormPath research-unit ingestion/RAG/evidence resolver;
6. scenario dataset generation and held-out evaluation;
7. first measured small-model/QLoRA experiment with reproducible run metadata;
8. final system-side integration review.

Do not train a model before the Coach contract and observation adapter are frozen.

---

# Phase 3 — serial integration gate

Integration must be serial even if implementation was parallel.

1. Freeze/push Claude C2 contract branch.
2. Verify Codex MotionPacket branch is independent and green; merge/cherry-pick it into an integration branch.
3. Integrate C2 contract/provider code.
4. Rebase/merge Claude product UI integration onto the combined interfaces.
5. Integrate Codex advanced persistence/service work.
6. Run full TypeScript typecheck/lint/unit suite, Python coach tests, Firestore emulator tests, Expo export/build checks.
7. Run actual iPhone Motion Lift/subject-lift/PR #4 gates separately; do not infer device success from web/jsdom tests.
8. Only after all gates, update HANDOFF and decide PR/merge order.

---

# Conflict firewall

## Claude must not edit during Phase 1

- `lib/reels/motion-packet-v1.ts`
- Firestore rules / Firebase public reel persistence
- RAG/corpus/training pipelines beyond schema parity work
- PR #4 reconstruction math/gates

## Codex/Luna must not edit before advanced reset

- `contracts/coach-*`
- `lib/coach/**`
- `ml/coach/**`
- `app/**`, `components/**`, UI hooks
- Firestore rules/security
- RAG/training

## Shared-file rule

If either lane discovers it must modify a file owned by the other lane, STOP and write the required interface/change to its handoff instead of editing the file.

---

# Priority if either agent runs out of quota again

Preserve these in order:

1. C2 shared Coach contract + parity tests.
2. Representative-profile observation adapter + privacy tests.
3. Provider/CoachFeedEvent boundary.
4. MotionPacket codec + tests.
5. Claude product integration with frozen interfaces.
6. Public persistence/security.
7. RAG/corpus/scenarios/evaluation.
8. Real model training.

A partially trained model is less valuable than a stable, tested contract that allows every other subsystem to continue.

---

# Current best next actions

1. Send Codex the Q0 + B1 bounded prompt below; let Luna salvage/push its plan, then work only on MotionPacket.
2. Send Claude the Phase-1 takeover prompt below; it creates a new system-contract worktree from `db129da7`, preserving the completed UI branch.
3. When Claude reports `C2 CONTRACT FREEZE`, allow UI integration to resume immediately.
4. When Codex advanced access resets, give it the Phase-2 advanced backend/ML prompt; do not ask it to redesign frozen contracts.
