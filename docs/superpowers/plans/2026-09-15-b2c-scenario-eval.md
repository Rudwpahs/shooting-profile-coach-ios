# B2-C Scenario and Held-Out Evaluation Implementation Plan

> Execute task-by-task with Superpowers TDD and verification-before-completion; preserve the branch for owner review.

**Goal:** Offline, reproducible behavior-training examples and independent held-out evaluation before any GPU experiment.

**Architecture:** Immutable corpus audit feeds source/claim-grouped evidence partitions. Contract V1 scenarios carry separate evaluation metadata and export plain request/response training rows. A provider-independent evaluator tests bounded structure, provenance, uncertainty and prohibited inference, with paired perturbations and adversarial responses.

**Tech stack:** Python standard library, existing Pydantic contracts/retrieval, pytest, Ruff; existing PyTorch loader only for compatibility verification.

**Spec:** Owner-approved B2-C request in this task (sections 0–30). No UI, Firebase, reconstruction, threshold, MotionPacket or frozen contract changes. No model downloads or training.

## Predeclared evaluation protocol

Engineering invariant benchmark, not a clinical or population efficacy study. Seed examples are synthetic measurements, not measured people or expert-validated prescriptions. Eight metrics come from the frozen schema; enum-valid actions and quality/evidence perturbations provide coverage. ROW_ONLY remains capped at medium. All source/duplicate-claim-connected units share one split; all variants of an evidence family share that split. Empty-evidence families are grouped by metric/action. Shared behavior templates across splits are disclosed: this tests evidence isolation, not unseen language/task generalization.

Schema, grounding, boundedness, safety and deterministic reproducibility targets are 1.0; unsupported references, overconfidence and unsupported inference targets are 0. Report denominator and per-case failures, including baseline weaknesses, without relaxing gates. Confidence tests are ordered-band metamorphic tests, not probabilistic calibration. Artificial conflict/source-loss probes must be marked synthetic and never invent provenance.

## Tasks

- [x] Audit: `scenarios/audit.py`, `scenario_tests/test_audit.py`. First assert 940 units, byte immutability, duplicate/missing-field detection and corrupt/empty rejection; run RED; implement read-only SQL/code audit; rerun GREEN; emit JSON/Markdown before generation.
- [x] Partition/generate: `scenarios/splits.py`, `specs.py`, `gold.py`, `build.py`; test stable IDs, group isolation, request/response schema, low-quality/ROW_ONLY caps and contradictions before implementation. Target 300–600 meaningful cases; report actual coverage rather than pad. Keep evidence metadata separate, never rewrite claims to create contradictions.
- [x] Loader: explicitly dispatch versioned request/response pairs to V1 validation plus grounding while preserving legacy rows. Tests reject mixed/unknown versions and pass existing collator prompt masking.
- [x] Evaluate: `scenarios/evaluate.py`; RED tests for unknown IDs, bad biomechanics (English/Korean), missing retest, confidence violations, invalid schema and fabricated source claims. Implement independent structural checks with conservative text probes and documented limits; compare repeated provider outputs and paired confidence perturbations.
- [x] Artifacts/CLI: `scenario_cli.py` implements audit/build/check/evaluate. Deterministic UTF-8 LF JSONL, separate metadata, manifest of inputs/config/generator source hash/artifact hashes; check regenerates bytes and rejects tampering/leakage. Test repeated builds and corrupt manifests.
- [x] CI/docs: isolated B2-C workflow runs full Coach/retrieval/evaluation tests, Ruff, deterministic regeneration, leakage and baseline evaluation offline after dependency install. Record results and precise B3 plan, then independent review and commit/push only this branch.

## Commands

```powershell
$env:PYTHONPATH='ml/coach/src'
python -m pytest ml/coach/scenario_tests -q
python -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests -q
python -m ruff check --config ml/coach/pyproject.toml ml/coach/src ml/coach/tests ml/coach/scenario_tests
python -m formpath_coach.scenario_cli audit --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli build --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli check --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli evaluate --output ml/coach/data/seed-v1
```

## Completion

Verify retrieval's 40 fixed cases retain their original metrics and honest provenance counts. Record exact base, source commit and final head; preserve raw per-case evaluation and limitations. B3 remains a separately approved task.

## Execution record

All six implementation tasks above were completed with test-first checks. Final
source-frozen suite: 347 passed (306 existing + 41 new), Ruff clean, deterministic
regeneration and all known split-overlap gates passed. Independent review findings
were reproduced and fixed. Implementation committed/pushed at
`8f7c5afa91654cf988975dfbfacc6a79bc5dc56f`; final handoff is
`docs/integration/b2c-scenario-eval-handoff.md`.

The unchanged deterministic provider fails several newly measured safety/retest
targets. Therefore software ready for owner review does not mean all-green B3
readiness. No model trained, no UI/main modification, no automatic B3 execution.
