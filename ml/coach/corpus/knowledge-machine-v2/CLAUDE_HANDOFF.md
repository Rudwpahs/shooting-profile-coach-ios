# CLAUDE HANDOFF — ZERO-CONTEXT CORPUS MODE

Do NOT open or summarize `units.machine.jsonl`.
Do NOT dump `formpath_knowledge.sqlite`.
Do NOT reconstruct RU-0001..0060. They are intentionally discarded.

Canonical corpus:
- RU-0061..RU-1000
- exactly 940 units

Use:
- `python validate.py`
- `python query_corpus.py stats`
- `python query_corpus.py domain SHOOTING --limit 20`
- `python query_corpus.py metric RELEASE_TIMING --limit 20`
- `python query_corpus.py policy DO_NOT_OVERINFER --limit 20`

Default query output is machine codes only.
Use `--text` only for a small subset that truly needs human inspection.

The database already contains normalized:
DOMAIN / METRIC / EFFECT / POLICY / EVIDENCE / SOURCE_ID / PROVENANCE.

So B2-A is code integration + validation, NOT corpus interpretation.
Do not start embedding/RAG/training unless explicitly instructed.
