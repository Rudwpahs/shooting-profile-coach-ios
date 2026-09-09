# Claude B2-A.1 handoff — corpus compatibility gate

Status: **B2-A.1 CORPUS COMPATIBILITY FROZEN**

Date: 2026-09-09 · Branch: `work/claude-hoop-hub-b2a1-compat` · Base: `work/claude-hoop-hub-b2a-corpus` @ `cca3b6d`

Scope, as ordered: a runtime compatibility adapter **outside** the corpus artifact and **outside** the frozen Coach
contract. The vendored Knowledge Machine v2 is unchanged byte for byte (section 5); `schemas.py` and every other
contract file are unchanged. No embedding, vector index, RAG, scenario generation, model training or contract
migration was started, and the corpus natural language was not read wholesale (text is touched only for the one
unit being converted).

## 1. What was added

| Path | Content |
| --- | --- |
| `ml/coach/src/formpath_coach/corpus_mapping.py` | fallback-sentinel policy, evidence-tier mapper, provenance policy, `CorpusUnit -> CoachEvidenceItemV1` conversion |
| `ml/coach/tests/test_corpus_mapping.py` | 24 tests (section 4) |
| `ml/coach/README.md` | IMPLEMENTED row for the adapter; the planned list no longer lists the evidence mapping |

## 2. Rules the adapter applies

**Fallback sentinels — official runtime codes.** `UNCLASSIFIED` (domains), `UNMAPPED_METRIC` (metrics) and
`GENERAL_GUIDANCE` (policies) are accepted wherever the vocabulary list for that dimension is consulted
(`runtime_codes`, `is_runtime_code`, `assert_runtime_codes`). Any other code that is not in
`controlled-vocabulary.json` is rejected with `ValueError`. The vocabulary file itself is not edited.

**Evidence tier — conservative downgrade onto the frozen enum.** Exactly the owner's table; every one of the 14
vocabulary codes maps to exactly one of the 7 frozen tiers, and no other input is accepted.

| Corpus code | A+ | A | A- | B+ | B | B- | C+ | C | C- | D+ | D | D- | E | U |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Coach tier | A | A | A- | B+ | B | C | C | C | D | D | D | H | H | H |

**Provenance policy** (`provenance_policy`, `evidence_set_policy`, `cap_coach_confidence`):

| | `LINKED` | `ROW_ONLY` |
| --- | --- | --- |
| retrieval candidate | yes | yes |
| evidence candidate | yes | yes |
| may be the sole evidence for a strong prescription | yes | **no** |
| `source_title` | first linked source title, ≤ 200 chars | **always `null`** |
| max Coach confidence the evidence can carry | `very_high` | **`medium`** |

`evidence_set_policy(provenances)` is the downstream metadata: with at least one `LINKED` unit it allows
`very_high` and sole-evidence prescription; with only `ROW_ONLY` units (or none) it returns
`max_coach_confidence = "medium"`, `may_prescribe_from_sole_evidence = False` and a reason
(`row_only_evidence_only` / `no_evidence`). `cap_coach_confidence(band, policy)` only ever lowers a band, so
`high` and `very_high` cannot be reached on ROW_ONLY evidence alone. Unknown provenance codes are rejected.

**`CorpusUnit -> CoachEvidenceItemV1`** (`to_coach_evidence_item`; DB-backed `coach_evidence_item_for_unit(n)`,
`coach_evidence_items(ns)`): `research_unit_id` = unit number; `claim` whitespace-normalised and bounded to 300
(a truncation adds the limitation `claim_truncated`); `evidence_tier` from the table; `source_title` per the
provenance table; `supported_inferences` = `METRIC:EFFECT` code pairs; `forbidden_inferences` = the unit's
restricting policy codes (`DO_NOT_OVERINFER`, `DO_NOT_INFER_UNOBSERVABLE`, `HYPOTHESIS_ONLY`,
`SEPARATE_DIMENSIONS`); `limitations` = `provenance:<code>`, `evidence_code:<code>`, then the unit's other policy
codes; `contradiction_group` = `null`. Lists are capped at 8 and the result is validated by the frozen
`CoachEvidenceItemV1` before it is returned, so nothing outside the contract can leave the function.

## 3. Verification

| Suite | Result |
| --- | --- |
| `pytest tests/test_corpus_mapping.py` | 24 passed |
| `pytest` (ml/coach, `.[dev,service]`) | 292 passed (268 before + 24) |
| `ruff check src tests` | clean |
| `pnpm lint` | 0 problems (TypeScript untouched) |

## 4. Required tests, where each lives (`tests/test_corpus_mapping.py`)

| Requirement | Test |
| --- | --- |
| every corpus evidence code maps to exactly one Coach tier | `test_every_corpus_evidence_code_maps_to_exactly_one_frozen_tier` (set equality with `controlled_vocabulary()["evidence_codes"]`, 14 entries, equals the owner's table) |
| mapping never leaves the frozen enum | `test_mapping_never_leaves_the_frozen_enum` (every output validated by `CoachEvidenceItemV1`) |
| B-, C-, D-, E, U never promoted | `test_mapping_is_a_conservative_downgrade_never_an_upgrade` (rank comparison per code plus monotonicity over the whole table) |
| 3 fallback sentinels allowed | `test_the_three_fallback_sentinels_are_official_runtime_codes` |
| unknown code strictly rejected | `test_unknown_evidence_codes_are_rejected` (8 cases incl. `H`, lowercase, empty) and `test_unknown_dimension_codes_are_strictly_rejected` |
| ROW_ONLY → `source_title` null | `test_row_only_unit_converts_with_a_null_source_title_and_a_valid_frozen_document` (a supplied title is dropped) |
| LINKED source mapping | `test_linked_unit_carries_its_source_title` and `test_two_explicit_units_convert_end_to_end` (real LINKED unit via `unit_sources → sources.title`) |
| vendored corpus SHA byte-exact = B2-A manifest | `test_vendored_corpus_is_byte_exact_against_the_b2a_manifest` |
| whole corpus passes the adapter on codes only | `test_real_corpus_codes_all_map_without_reading_any_text` (940 units, 40 LINKED / 900 ROW_ONLY) |

Also covered: provenance policy fields, confidence capping, strictness of the conversion (unknown codes, empty
claim, >8 metrics rejected by the frozen model, `E` rejected by the frozen model).

## 5. Corpus immutability evidence

`git diff cca3b6d -- ml/coach/corpus` is empty. Git blob ids of the four governing files are identical in the base
commit and the worktree, and the sha256 sums equal the manifest:

| File | SHA-256 |
| --- | --- |
| `formpath_knowledge.sqlite` | `c1e17824b8359e4655ebc664f7df325d3371e4e0e703bcd9bcaf4a63c6f6b039` (= manifest `db_sha256`) |
| `units.machine.jsonl` | `9fd0b467919e15321e4e2ff13343a46aab270e7980a36d7a0aeec49927b9592f` (= manifest `jsonl_sha256`) |
| `controlled-vocabulary.json` | `df35fc21653382fd4d6fe86bba01118cf4bac7e110ca045764e664b0bd1112f5` |
| `manifest.json` | `9c93739eb19ce213cda83abaabf36a4f63bdf7cd592dc31ba321d73dff10b70d` |

## 6. Not done (by instruction)

Retrieval / unit selection for a request, embedding, vector index, RAG, scenario generation, training, any change
to `CoachEvidenceItemV1` or the other frozen contracts, any change to the corpus files. B2-B was not started.
