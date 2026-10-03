# Hoop Hub Compute-Efficient Coach TODO

Design: `docs/superpowers/specs/2026-10-01-hoophub-compute-efficient-coach-design.md`
Status: **architecture locked; implementation work remains**

## 2026-10-03 main-state reconciliation

Current integration base: `main@a9d717f` after PR #32.

- B2-C scenario/evaluation infrastructure is already on `main` (merge `3462c2f`): 560 versioned scenarios, train/dev/held-out isolation, leakage audit, evaluator, retrieval scaffold, frozen Python Coach V1 models and contract JSON Schemas.
- The repository currently lacks the TypeScript files referenced by the Python parity documentation (`lib/coach/contract.ts`, `tests/coach-parity.test.ts`).
- The app has `RepresentativePose4DV2` but no production `RepresentativePose4DV2 -> CoachRequestV1` bridge.
- Physical-iPhone/device-only QA is external / NOT EVIDENCED and is **not a prerequisite for continued software implementation**. Do not make it the next action.
- The next executable slice is `docs/superpowers/plans/2026-10-03-hoophub-coach-bridge-v1.md`: restore cross-language contract parity and implement the deterministic structured-evidence bridge.
- Do not start Qwen/QLoRA training in that slice. Training remains downstream of the frozen evaluation/gold review gate.


Execution plans:
- Coach Training v0: `docs/superpowers/plans/2026-10-01-hoophub-coach-training-v0.md`
- Personalization v1: `docs/superpowers/plans/2026-10-01-hoophub-personalization-v1.md`

Status legend:
- `[x]` exists today and was verified from the repository/documented state
- `[ ]` implementation or measurement still required
- `[ ] GATE` must pass before the next dependent phase

## Phase 0 — Freeze the benchmark contract

- [x] Lock architecture: Motion evidence → Decision Core → curated evidence → Coach → retest/personalization.
- [x] Keep Qwen3-4B-class as the first Coach baseline candidate; keep 8B as a benchmark candidate rather than the default.
- [x] Lock evidence boundaries: no force/torque/muscle activation/physical-3D claims from pose alone; no raw-video server upload authorized by this work.
- [ ] Define the frozen gold-scenario schema for evaluation.
- [ ] Define source-held-out and player/session-separated split rules.
- [ ] Define deterministic scoring for primary diagnosis, secondary diagnosis, `do_not_change`, unsupported claims, evidence consistency, contradiction handling, confidence calibration and retest validity.
- [ ] Define efficiency collection: p50/p95 latency, peak VRAM, generated tokens, GPU wall time and correct diagnoses per unit compute.
- [ ] GATE — evaluation protocol is frozen before training or model-size comparison begins.

## Phase 1 — Perception → Coach request bridge

- [x] Existing Coach request/response schemas and PyTorch SFT/inference scaffolds exist under `ml/coach/`.
- [ ] Define a typed structured motion-evidence contract consumed by Coach; do not pass raw video to the Coach model.
- [ ] Map the existing normalized shot-phase representation and available semantic anchors/trajectories into that contract without changing their evidence meaning.
- [ ] Carry measurement confidence and observation provenance end-to-end.
- [ ] Add explicit missing/low-confidence behavior: downstream diagnosis must reduce confidence or fail closed.
- [ ] Add contract tests proving unsupported physical quantities cannot be introduced by the bridge.
- [ ] GATE — representative real/synthetic fixtures produce deterministic, schema-valid Coach inputs.

## Phase 2 — Decision Core v1

- [ ] Implement a deterministic diagnosis contract with at least:
  - `primary_issue`
  - `secondary_issue[]`
  - `do_not_change[]`
  - `diagnosis_confidence`
  - `supporting_observation_ids[]`
  - `required_evidence_topics[]`
  - `contradictions[]`
- [ ] Separate measured observation from hypothesis and from coaching recommendation.
- [ ] Add fail-closed behavior for contradictory or insufficient motion evidence.
- [ ] Add tests for stable elbow / weak lower-body-transfer style cases where `do_not_change` matters.
- [ ] Add tests ensuring the language-model layer cannot silently overwrite a protected Decision Core conclusion without an explicit lower-confidence path.
- [ ] GATE — Decision Core improves the frozen diagnostic benchmark versus Coach-only baseline before it becomes the product default.

## Phase 3 — Curated HoopDB retrieval

- [x] A read-only canonical corpus package and conservative corpus compatibility mapping already exist in the Coach scaffold.
- [ ] Implement retrieval over canonical / accepted knowledge only.
- [ ] Preserve provenance, evidence tier, limitations and contradictory evidence.
- [ ] Prevent raw Miner candidates and unresolved REVIEW items from becoming prescription evidence.
- [ ] Add retrieval tests for duplicate, near-duplicate, contradictory and weak-provenance cases.
- [ ] Add source/citation validation to the generated Coach response.
- [ ] Coordinate with `Rudwpahs/hoopDB` so data-efficiency reporting includes:
  - usable canonical units / incoming candidates
  - duplicate / near-duplicate rate
  - rejection reason distribution
  - provenance-complete rate
  - contradiction rate
  - oldest pending age
  - usable corpus growth/day
- [ ] GATE — retrieval improves evidence consistency without increasing unsupported-claim rate.

## Phase 4 — Gold scenarios and SFT baseline

- [x] Training v0 implementation plan is locked and linked above; it reuses B2-C and does not change the frozen Coach V1 contract.
- [ ] Build human-reviewed scenario JSONL from structured observations + curated evidence; do not use copied paper text as the supervision target.
- [ ] Keep held-out gold scenarios completely separate from training and synthetic generation.
- [ ] Run the first real Qwen3-4B-class SFT/QLoRA experiment using the existing scaffold.
- [ ] Record exact environment, model revision, tokenizer revision, quantization configuration, dataset hash, seed, commands, GPU/VRAM and elapsed time.
- [ ] Run the full frozen benchmark and save machine-readable results.
- [ ] Establish this result as **Baseline 4B Full Stack** only after Motion + Decision + retrieval are included.
- [ ] GATE — no KD, 8B adoption or multi-pass default before this baseline exists.

## Phase 5 — Knowledge-distillation experiment

- [ ] Choose a stronger teacher only if it can contribute novel, validated signal beyond the gold labels.
- [ ] Generate synthetic/teacher scenarios into a quarantined dataset with provenance.
- [ ] Validate every teacher output against the same schema/evidence boundaries; reject rather than repair unsupported outputs.
- [ ] Train a KD candidate from the SFT-initialized student.
- [ ] Compare SFT vs KD on the same held-out set.
- [ ] Reject KD if the benefit disappears after controlling for added data/compute or if unsupported claims rise.
- [ ] GATE — merge/adopt KD only when it moves the quality/compute frontier.

## Phase 6 — Selective test-time compute

- [ ] Define triggers for extra inference work: low confidence, evidence contradiction, near-tied diagnoses or retrieval disagreement.
- [ ] Implement candidate-diagnosis generation only for triggered cases.
- [ ] Add deterministic evidence re-check / verifier step.
- [ ] Keep high-confidence routine cases single-pass.
- [ ] Measure added latency, token count and GPU time separately from quality gain.
- [ ] GATE — selective test-time compute must outperform always-multi-pass behavior on the frozen efficiency metric.

## Phase 7 — 4B vs 8B benchmark

- [ ] Reproduce the best 4B stack exactly before changing model size.
- [ ] Run an 8B-class candidate with the same input contract, retrieval, Decision Core, held-out set and output schema.
- [ ] Compare quality and efficiency on the same report.
- [ ] Adopt 8B as default only if it provides a material quality gain that justifies recurring latency/VRAM/compute cost or otherwise Pareto-dominates the 4B stack.
- [ ] Keep 4B if the full small-model stack remains on the superior Pareto frontier.
- [ ] GATE — model-size decision is evidence-backed and recorded; no preference-by-parameter-count.

## Phase 8 — Personalization / longitudinal feedback

- [x] Personalization v1 logic and implementation plan is locked and linked above; it keeps numeric history local and does not require a Firestore schema change.
- [ ] Define a privacy-safe feedback record for baseline observation → recommendation/drill → retest observation → context/time interval → confidence.
- [ ] Keep personalization local-first where possible; any new server persistence requires separate review and must not be smuggled into this architecture work.
- [ ] Require repeated observed outcomes before learning player-specific cue effectiveness.
- [ ] Prevent single before/after pairs from being described as causal proof.
- [ ] Add cold-start fallback to the non-personalized full-stack Coach.
- [ ] Add regression tests for missing history, conflicting history and measurement-quality changes across sessions.
- [ ] GATE — personalized selection improves longitudinal evaluation without degrading safety/evidence calibration.

## Phase 9 — Efficient-frontier report

Run and preserve one comparable report for:

- [ ] A — Coach model only
- [ ] B — Motion evidence + Coach
- [ ] C — Motion + Decision Core + Coach
- [ ] D — C + curated HoopDB retrieval
- [ ] E — D + KD candidate
- [ ] F — best small-model stack + selective test-time compute
- [ ] G — same best stack with 8B-class benchmark

The report must include at least:

- [ ] primary diagnosis accuracy
- [ ] secondary diagnosis agreement
- [ ] `do_not_change` violation rate
- [ ] unsupported-claim rate
- [ ] evidence/citation consistency
- [ ] contradiction handling accuracy
- [ ] confidence calibration
- [ ] drill/retest validity
- [ ] p50/p95 latency
- [ ] peak VRAM
- [ ] generated tokens/request
- [ ] GPU wall time/request
- [ ] training compute record
- [ ] correct diagnoses per unit compute

## Explicitly deferred / forbidden shortcuts

- [ ] Do **not** pretrain a foundation model from scratch for this milestone.
- [ ] Do **not** scale Miner volume as a substitute for usable corpus growth.
- [ ] Do **not** feed raw Miner candidates directly into prescription logic.
- [ ] Do **not** train the Coach mainly on copied research prose.
- [ ] Do **not** let an LLM invent motion measurements absent from structured evidence.
- [ ] Do **not** upload raw source video to the server as part of this work.
- [ ] Do **not** change Firestore schema just to make the benchmark convenient.
- [ ] Do **not** adopt 8B, KD or always-on multi-pass inference before the relevant gate above passes.

## Next execution slice

Start with **Phase 0 + Phase 1 only**: freeze the evaluation contract, then implement the structured perception-to-Coach bridge. Do not begin model training in the same slice.
