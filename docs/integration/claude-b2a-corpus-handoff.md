# Claude B2-A handoff — corpus integration and validation

Date: 2026-09-09 · Branch: `work/claude-hoop-hub-b2a-corpus` · Base: `work/claude-hoop-hub-b1-integration` @ `484e2fa`
Worktree: `C:/Users/USER/Projects/shooting-profile-coach-ios-b2a`

Scope, as the package handoff (`CLAUDE_HANDOFF.md`) defines it: **code integration + validation of the
FormPath Knowledge Machine v2, not corpus interpretation.** No embedding, retrieval, RAG, scenario generation or
training was started. `units.machine.jsonl` was neither opened nor summarized; the database was not dumped;
RU-0001..RU-0060 were not reconstructed.

## 1. What was integrated

| Path | Content |
| --- | --- |
| `ml/coach/corpus/knowledge-machine-v2/` | the package as shipped: `formpath_knowledge.sqlite`, `units.machine.jsonl`, `manifest.json`, `controlled-vocabulary.json`, `SCHEMA.sql`, `sources.jsonl`, `validate.py`, `query_corpus.py`, `CLAUDE_HANDOFF.md` |
| `.gitattributes` | `ml/coach/corpus/knowledge-machine-v2/** -text` so every file stays byte-exact and the manifest checksums hold on any checkout |
| `ml/coach/src/formpath_coach/corpus.py` | read-only accessor and validator (below) |
| `ml/coach/tests/test_corpus_v2.py` | 9 tests |

Package checksums, verified after the copy and again from the worktree:

| File | SHA-256 |
| --- | --- |
| `formpath_knowledge.sqlite` | `c1e17824b8359e4655ebc664f7df325d3371e4e0e703bcd9bcaf4a63c6f6b039` (= manifest `db_sha256`) |
| `units.machine.jsonl` | `9fd0b467919e15321e4e2ff13343a46aab270e7980a36d7a0aeec49927b9592f` (= manifest `jsonl_sha256`) |

## 2. Accessor (`formpath_coach.corpus`)

- `open_corpus()` — SQLite opened with `mode=ro`; a write raises `readonly`.
- `corpus_stats()` → `{"units": 940, "min": 61, "max": 1000, "sources": 6}`.
- `unit_codes(n)`, `units_by_domain(code, limit)`, `units_by_metric(code, limit)`, `units_by_policy(code, limit)`,
  `search_units(query, limit)`, `iter_unit_codes()` → `CorpusUnitCodes` (machine codes only: `n, id, effect,
  evidence, provenance, domains, metrics, policies, sources`).
- `unit_text(n)` → `CorpusUnitText` for one explicitly named unit; the only path that returns natural language.
- `validate_corpus()` → the report below or `CorpusError`.
- CLI: `python -m formpath_coach.corpus validate | stats | domain CODE | metric CODE | policy CODE | unit N [--text]`.

## 3. Validation results

```
python -m formpath_coach.corpus validate
{"status": "OK", "units": 940, "range": "RU-0061..RU-1000", "sources": 6,
 "db_sha256": "c1e178…b039", "jsonl_sha256": "9fd0b4…92ef", "vocabulary_version": "2.0",
 "fallback_codes": {"domains": ["UNCLASSIFIED"], "metrics": ["UNMAPPED_METRIC"], "policies": ["GENERAL_GUIDANCE"]}}
```

Checked: both checksums; exactly 940 units numbered 61..1000 with ids `RU-0061`..`RU-1000`, all distinct, none
below 61; every domain/metric/policy code in the controlled vocabulary or the manifest counts; per-code domain,
metric, policy and evidence counts equal to the manifest; every effect, evidence and provenance code in the
vocabulary; every `unit_sources` row references a known source (6 sources); 940 non-empty JSONL lines. The shipped
`validate.py` and `query_corpus.py stats` agree with the module.

| Suite | Result |
| --- | --- |
| `pytest tests/test_corpus_v2.py` | 9 passed |
| `pytest` (ml/coach, `.[dev,service]`) | 268 passed (259 before + 9) |
| `ruff check src tests` | clean |
| `pnpm lint` | 0 problems (TypeScript untouched) |

## 4. Findings for the corpus owner (recorded, not resolved)

1. **Fallback codes outside the vocabulary lists.** The database uses `UNCLASSIFIED` (114 units), `UNMAPPED_METRIC`
   (524) and `GENERAL_GUIDANCE` (390); the manifest counts them but `controlled-vocabulary.json` (version 2.0) lists
   18 domains, 26 metrics and 10 policies without them. The validator accepts codes the manifest counts and reports
   them as `fallback_codes`. Either the vocabulary should list them or the manifest should not count them.
2. **Evidence codes versus the frozen Coach contract.** Units use evidence codes `A, B, C, D, E, U` (the vocabulary
   lists 14). The frozen `CoachEvidenceItemV1.evidence_tier` is `A, A-, B+, B, C, D, H`. `E` and `U` have no place in
   the contract, and the corpus has no `A-`, `B+` or `H`. Turning a unit into `CoachEvidenceItemV1` therefore needs an
   explicit mapping and a contract migration commit; it is **not** done here (that would be interpretation and a
   contract change).
3. `unit_sources` is empty for the sampled units although 6 sources exist; provenance is `ROW_ONLY` on those rows.
   Not a validation failure; noted for B2-B provenance work.

## 5. Not started (by instruction)

Embedding, retrieval index, RAG evidence resolver, scenario generation, held-out evaluation, QLoRA/SFT, model
weights. The next unit (B2-B) can build retrieval over `search_units` / the FTS table and define the evidence
mapping above, after the owner decides the two findings.
