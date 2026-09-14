# B2-C scenario/evaluation handoff — 2026-09-15

## Branch and implementation

- Branch: `work/codex-hoop-hub-b2c-scenario-eval`
- Exact base: `85c7ada7107e12f1a2c7ce6a5c2e381e1ba38297`
- Implementation commit: `8f7c5afa91654cf988975dfbfacc6a79bc5dc56f`
- Implementation pushed and remote SHA verified. This handoff is a subsequent
  documentation-only commit; obtain its exact final SHA with `git rev-parse HEAD`
  (also supplied in the owner-facing final report).
- Worktree: `C:/Users/USER/AppData/Local/Temp/hoophub-b2c-scenario-eval`
- Authoritative B2-B.2 remote was rechecked before commit and remained at the base.
  Old PyTorch commit `49a35243ef7030b614547afc2f979c4278bc6096` is an ancestor
  87 commits behind the base. No work returned to that branch.
- No PR, main merge, rebase or force-push. Preserve this worktree for owner review.

## Delivered files by responsibility

- Read-only corpus audit: `ml/coach/src/formpath_coach/scenarios/audit.py`.
- Grouping, specifications, bounded evidence selection and gold:
  `scenarios/splits.py`, `specs.py`, `build.py`, `gold.py`.
- Provider-independent validation/calibration: `scenarios/evaluate.py`.
- Versioned artifacts and CLI: `scenarios/artifacts.py`, `scenario_cli.py`.
- Legacy + frozen V1 loader compatibility: `ml/coach/src/formpath_coach/dataset.py`.
- 41 focused tests: `ml/coach/scenario_tests/`; test-package isolation avoids
  colliding with legacy tests' unqualified `conftest` imports.
- Seed/audit/manifest/baseline: `ml/coach/data/seed-v1/` (about 2.3 MB).
- Isolated workflow: `.github/workflows/b2c-scenario-eval-ci.yml`; direct tested
  dependency versions: `ml/coach/b2c-test-constraints.txt`.
- Design/limits: `docs/ai/b2c-seed-v1.md`; subsequent B3 plan:
  `docs/ai/b3-first-experiment-plan.md`; executed plan in `docs/superpowers/plans/`.

## Dataset and provenance

560 contract-valid synthetic scenarios: **400 train / 80 dev / 80 held-out**.
56 profile families, each with ten correlated behavioral perturbations; not 560
independent people. Each of eight frozen metrics has 70 intended cases. Missing
joint probes correctly use quality-only input: actual observations are 119
capture-quality and 63 for each of the other seven metrics.

Actions: set_shot 140, jump_shot 140, free_throw 140, unknown 140.
Gold confidence: very_low 112, low 280, medium 168; zero high/very_high.
Selected evidence occurrences: A 427, B 1,312, C 22, H 87; **0 LINKED / 1,848
ROW_ONLY**, 50 unique research units. 384 cases have a direct machine metric match.
These tiers/mappings do not establish causal prescription validity.

Whole corpus: **940 units, 40 LINKED / 900 ROW_ONLY**, six source records.
Mapped tiers: A 62, B 689, C 108, D 25, H 56. Safety-related 503.
Sentinels: UNMAPPED_METRIC 524, UNCLASSIFIED 114, GENERAL_GUIDANCE 390.
Duplicate IDs 0, canonical duplicate claims 0, missing required fields 0.
Domain/metric distributions and linked-source coverage are fully recorded in
`corpus-audit.json`; a concise human summary accompanies it. Corpus bytes unchanged.

Corpus SHA-256:

- DB: `c1e17824b8359e4655ebc664f7df325d3371e4e0e703bcd9bcaf4a63c6f6b039`
- JSONL: `9fd0b467919e15321e4e2ff13343a46aab270e7980a36d7a0aeec49927b9592f`
- Dataset manifest: `f025fa9d75adf5b9b796baa2d50e3f14e7a58f783ccaef1d6553391597c8b746`
- Baseline report: `e7ab3ce540f30212c58bce8d266a4d1799a2060eed9d5679fb9dd8c175091367`

## Leakage

All pairwise comparisons (train/dev, train/held-out, dev/held-out):
unit-ID overlap **0**, source-ID overlap **0**, normalized claim overlap **0**,
profile-family overlap **0**, exact request/response overlap **0**.
Metadata/source mismatch **0**. Partitioning binds known source/claim components;
the independent audit re-derives source membership from the corpus.

All ten behavioral templates recur across splits, deliberately disclosed.
Unknown source overlap among ROW_ONLY units and paraphrased claims remain
undetectable; this is known-evidence isolation, not proof of literature or
task/style generalization. Held-out must not be used for prompt/weight selection.

## Unchanged deterministic_v1 held-out baseline

Provider revision `service_baseline_v1`, 80 cases, two calls per case:

| Metric | Result |
|---|---:|
| Schema validity | 80/80 = 1.0 |
| Evidence reference grounding | 80/80 = 1.0 |
| Evidence utilization when evidence supplied | 0/72 = 0.0 |
| Unsupported evidence reference | 0/80 = 0.0 |
| High confidence with low measurement | 0/80 = 0.0 |
| ROW_ONLY overconfidence | 0/80 = 0.0 |
| Required safety preservation | 64/80 = 0.8 |
| Drill/retest completeness | 24/80 = 0.3 |
| Deterministic reproducibility | 80/80 = 1.0 |
| Contract-bounded output | 80/80 = 1.0 |
| Detected unsupported biomechanics/inference | 0/80 = 0.0 |
| Detected unsupported source claim | 0/80 = 0.0 |
| Failed-capture visual prescription | 7/80 = 0.0875 |
| Missing-evidence overconfidence | 8/80 = 0.1 |
| Contradiction overconfidence | 8/80 = 0.1 |

40 ordinal calibration comparisons, zero increases/violations, zero skips.
Held-out source-loss pairs: **0**, because no selected source was LINKED. A separate
test using a genuine linked corpus unit verifies source-loss detection and safety
of the degraded output. These are ordinal checks, not probabilistic calibration.

`all_invariants_passed = false`. The baseline returns no drills/citations, does
not reduce confidence for conflicts/no evidence, and can retain a visual cue on
failed capture. It was **not changed to improve benchmark results**. Citation
subset integrity is vacuous when nothing is cited; it is not entailment/knowledge use.

## Verification evidence

Windows; Python 3.11.15. New isolated venv, actual editable install via:

```powershell
uv venv --python 3.11 .venv
uv pip install --python .venv/Scripts/python.exe -e 'ml/coach[dev,service]'
uv pip check --python .venv/Scripts/python.exe
```

Result: 88 packages checked, all installed packages compatible. Venv uses uv and
does not contain pip; `python -m pip --version` therefore fails locally. The CI
setup-python environment supplies pip. No models were downloaded by installation.
Direct actual package versions are recorded in the constraints file (including
torch 2.13.0, transformers 5.17.0, PEFT 0.20.0, Pydantic 2.13.5).

Final source-frozen validation:

```powershell
.venv/Scripts/python.exe -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests ml/coach/scenario_tests -q
```

**347 passed, 2 deprecation warnings, 157.46 seconds.** This comprises 306 existing
Coach/retrieval/evaluation tests and 41 new B2-C tests. Warnings are existing
FastAPI/Starlette httpx TestClient and AnyIO BlockingPortal deprecations.

```powershell
.venv/Scripts/python.exe -m ruff check ml/coach/src ml/coach/tests ml/coach/scenario_tests ml/coach/retrieval_tests ml/coach/evaluation_tests
.venv/Scripts/python.exe -m formpath_coach.scenario_cli build --output ml/coach/data/seed-v1
.venv/Scripts/python.exe -m formpath_coach.scenario_cli check --output ml/coach/data/seed-v1
.venv/Scripts/python.exe -m formpath_coach.scenario_cli evaluate --output ml/coach/data/seed-v1
git diff --cached --check
```

Results: Ruff clean; build 560 / 400–80–80; check byte-identical and leakage passed;
evaluation reproduced the metrics above; whitespace check clean. Repeated builds
and evaluations are also tested, including hash/manifest tampering rejection.

Existing retrieval benchmark command:

```powershell
.venv/Scripts/python.exe -c "from formpath_coach.retrieval_eval import run_retrieval_evaluation; import json; r=run_retrieval_evaluation().to_dict(); print(json.dumps({k:v for k,v in r.items() if k != 'cases'},sort_keys=True))"
```

40 cases: plan alignment, relevance, safety preservation, determinism, boundedness,
contract validity all **1.0**; acceptance true; **0 LINKED / 320 ROW_ONLY**, unchanged.

RED→GREEN evidence: audit tests failed for missing implementation then passed;
V1 loader initially rejected valid V1 rows; evaluator mutants exposed cue/negation,
3D/source-claim/hypothesis-calibration/claim-leakage and source-loss gaps, each
covered by regression tests and fixed. Windows asyncio requires loopback socketpair,
so the offline guard allows that internal mechanism but rejects external sockets.
Combined test collection initially hit a conftest name collision; isolated package
fixed it. One reviewer regeneration run crossed concurrent source edits; rerun
after source freeze passed. No thresholds were weakened to address these failures.

Independent review: no outstanding Important findings after correction. Final
targeted source-loss + CLI determinism recheck: 2 passed in 18.20 seconds.
Remote CI: workflow run `34865401690` **succeeded** for the implementation commit
on a fresh Ubuntu/Python 3.11 checkout. Dependency installation, focused tests,
existing Coach/retrieval tests, Ruff, deterministic dataset/leakage check, and
byte-identical baseline-report reproduction all succeeded. Completed
2026-09-15 00:58:15 KST (2026-09-14 15:58:15 UTC).
Run: https://github.com/Rudwpahs/shooting-profile-coach-ios/actions/runs/34865401690

## Safety and ownership audit

Changed reconstruction math: **No**. V2 thresholds: **No**. Privacy contracts:
**No**. Firestore/storage rules or Firebase behavior: **No**. UI: **No**.
MotionPacket: **No**. Frozen Coach API contracts: **No**. Corpus bytes: **No**.
Existing production deterministic provider and retriever: **No**.
No model weights, embeddings, hosted LLM calls or training runs. No DONE marker.

## Readiness and next decision

**NOT READY FOR B3** under the requested all-green safety targets. B2-C's software,
inspectable seed, leakage gates and evaluation system are implemented and locally
verified for owner review, but baseline safety/retest targets are not all met.
Do not describe this as a trained model or deployment-ready basketball coach.

Before GPU spend, owner must review the revealed baseline gaps and Seed's limited
repeatability labels, decide how to address safety failures, and approve the
separate B3 experiment plan. Source entailment adjudication, real contradiction
pairs and broader gold behavior remain curation limitations. Existing ROW_ONLY
data cannot independently support strong biomechanical prescriptions. The B3
plan records a tiny experiment, exact revision/config/VRAM/runtime/held-out gates;
it has not been executed.
