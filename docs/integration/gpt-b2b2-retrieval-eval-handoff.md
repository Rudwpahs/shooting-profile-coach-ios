# B2-B.2 retrieval evaluation handoff

Date: 2026-09-09 (Asia/Seoul)

Status: **B2-B.2 RETRIEVAL EVALUATION READY — PROVENANCE LIMITATION FOUND**

## Branch and base

- Branch: `work/gpt-hoop-hub-b2b2-eval`
- Base: `work/gpt-hoop-hub-b2b1-retrieval` at `83972f1d67c7a7d63068c9c3da0049b288d3ff57`
- Verified evaluation implementation/config head: `c7922fe93dd26038759283ccd85e4f4c553b277b`
- GitHub Actions run: `34360134598`
- Job: `102494694568`
- Python: 3.12 on GitHub-hosted Ubuntu 24.04
- Vendored Knowledge Machine v2 and frozen Coach contracts were not modified.

## Hypothesis and pre-specified gate

Hypothesis: the B2-B.1 deterministic structured retriever should map every frozen Coach metric to the intended machine-code query plan and return at least one code-relevant unit in the final top-8 in at least 90% of fixed evaluation cases, without dropping safety evidence, changing output across repeated runs, exceeding the frozen evidence bound, or violating `CoachEvidenceItemV1`.

The 0.90 relevance threshold and all 40 cases were committed before the successful implementation run. They were not selected after reading benchmark results.

## Evaluation design

The suite contains exactly 40 fixed cases: eight frozen Coach metrics multiplied by five context/capture variants:

1. `jump_shot`, quality passed
2. `set_shot`, quality passed
3. `free_throw`, quality passed
4. `unknown` action, quality passed
5. `jump_shot`, quality failed

All eight frozen metrics therefore occur exactly five times. Failed-capture cases require `POSE_VALIDATION` in the query plan. Final evidence is capped at eight and validated against the frozen Coach evidence schema.

This is an engineering retrieval benchmark, not a statistical population study. No p-values, model judge, embedding model, vector database, or LLM reranker are used.

## Reproducible result

Command path is encoded in `.github/workflows/b2b2-eval-ci.yml`. The successful run emitted this metric summary:

```json
{
  "acceptance_failures": [],
  "acceptance_passed": true,
  "bounded_rate": 1.0,
  "case_count": 40,
  "contract_valid_rate": 1.0,
  "determinism_rate": 1.0,
  "linked_selection_count": 0,
  "plan_alignment_rate": 1.0,
  "relevance_hit_rate": 1.0,
  "row_only_selection_count": 320,
  "safety_preservation_rate": 1.0
}
```

Focused tests at the same code/config head: **5 passed**. Focused Ruff: **clean**.

## Interpretation

The result supports a narrow claim only: against this fixed machine-code benchmark, B2-B.1 deterministically produces bounded, frozen-contract-valid evidence sets whose selected code metadata aligns with the expected frozen metric/domain intent, and its safety-unit preservation logic succeeds in all 40 cases.

It does **not** establish that the natural-language claims are scientifically correct for every coaching situation, that the ranking is optimal, or that a trained Coach would produce correct advice.

### Material provenance limitation

All 320 selected evidence slots were `ROW_ONLY`; **zero** selected slots were `LINKED`.

This is not hidden or repaired by artificially boosting unrelated linked units. B2-A.1 policy therefore remains important: `ROW_ONLY` evidence may be retrieved, but it has no linked source title, cannot be the sole basis for a strong factual prescription, and caps downstream Coach confidence at `medium` when the evidence set is row-only.

Before claiming production evidence grounding, source/provenance coverage of the relevant corpus needs a separate improvement/audit. Semantic retrieval or model training does not solve missing provenance by itself.

## Files added by B2-B.2

- `ml/coach/src/formpath_coach/retrieval_eval.py`
- `ml/coach/evaluation_tests/test_retrieval_evaluation.py`
- `.github/workflows/b2b2-eval-ci.yml`
- this handoff

No corpus artifact, frozen Coach contract, UI, Firebase, MotionPacket, or PR #4 reconstruction code is changed.

## Deliberately not started

- source-provenance repair
- embeddings / vector DB
- LLM reranking
- train/dev/held-out coaching-response scenario generation
- QLoRA/SFT
- model weights
- physical-iPhone PR #4 validation

The next useful AI-data step is a provenance/source audit or a held-out coaching scenario/evaluation design. Model training should not be described as production-ready while the selected evidence remains entirely `ROW_ONLY`.
