# Basketball Knowledge Miner Private Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, schema-validated inbox and distillation-support layer to `Rudwpahs/shooting-profile-coach-ios` without modifying the frozen Coach V1 contracts or the immutable RU-0061..RU-1000 Knowledge Machine.

**Architecture:** Public miner batches arrive as immutable JSONL files on a dedicated private data branch/path. The FormPath Coach package validates and loads only explicitly requested batches, performs authoritative duplicate/provenance checks against the existing corpus and pending states, and validates GPT-produced decisions into `DUPLICATE`, `REJECTED`, `REVIEW`, or `ACCEPTED-STAGING`. Canonical RU allocation is deliberately deferred to the promotion plan.

**Tech Stack:** Existing `ml/coach` Python package, Python 3.12, Pydantic 2.11+, SQLite read-only corpus access, pytest 8.4+, Ruff 0.12+, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-basketball-knowledge-miner-design.md`

## Global Constraints

- Base implementation on the branch containing B2-A.1, B2-B.1, and B2-B.2 behavior; do not edit frozen Coach schemas/contracts.
- The vendored Knowledge Machine v2 remains byte-exact until a later approved promotion PR regenerates it deterministically.
- RU-0001..RU-0060 are permanently discarded and must never be reconstructed.
- Incoming mined candidates use `CAND-*`; ingestion does not allocate RU numbers.
- New mined candidates should normally have `LINKED` provenance because URL/identifier is captured during discovery.
- Source prestige never determines evidence grade by itself.
- Coaching/interview evidence is not upgraded to experimental evidence.
- Raw/full articles, full transcripts, raw video, private Representative 4D evidence, force/torque/muscle claims, or actual metric 3D claims are not accepted into the candidate schema.
- Existing corpus, corpus-mapping, retrieval, B2-B.2 evaluation, and Representative 4D CI must remain green.

---

### Task 1: Add the private candidate and decision schemas

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_models.py`
- Create: `ml/coach/tests/test_miner_models.py`

**Interfaces:**
- Produces `MinerCandidateV1`, `DistillationDecisionV1`, `AcceptedStagingUnitV1`, and `DailyDistillationReportV1`.
- These schemas mirror the public export contract but are independently validated in the private repo.

- [ ] **Step 1: Write RED schema tests**

```python
from pydantic import ValidationError
from formpath_coach.miner_models import MinerCandidateV1


def test_candidate_requires_linked_https_provenance():
    payload = {
        "candidate_id": "CAND-0123456789abcdef",
        "adapter": "crossref",
        "source_type": "academic",
        "stable_id": "10.1234/example",
        "url": "http://example.org/paper",
        "title": "Basketball shooting biomechanics",
        "authors": ["A. Author"],
        "published_at": "2026-09-01",
        "summary": "A short metadata-derived summary.",
        "canonical_hash": "0" * 64,
        "topic_codes": ["SHOOTING"],
        "relevance_signals": ["basketball"],
        "provenance": "LINKED",
        "warnings": [],
        "discovered_at": "2026-09-09T00:00:00Z",
    }
    try:
        MinerCandidateV1.model_validate(payload)
    except ValidationError:
        return
    raise AssertionError("non-HTTPS URL must be rejected")
```

Also test `extra="forbid"`, 16-hex `CAND-*`, 64-hex hash, bounded summary, and allowed source types.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_models.py -q`

- [ ] **Step 3: Implement the schemas**

```python
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator

MinerSourceType = Literal["academic", "official", "coaching", "interview"]
DistillationStatus = Literal["DUPLICATE", "REJECTED", "REVIEW", "ACCEPTED-STAGING"]


class MinerCandidateV1(BaseModel):
    model_config = ConfigDict(extra="forbid")
    candidate_id: str = Field(pattern=r"^CAND-[0-9a-f]{16}$")
    adapter: str
    source_type: MinerSourceType
    stable_id: str
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    authors: list[str] = Field(default_factory=list, max_length=32)
    published_at: str | None = None
    summary: str | None = Field(default=None, max_length=1200)
    canonical_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    topic_codes: list[str] = Field(default_factory=list, max_length=12)
    relevance_signals: list[str] = Field(default_factory=list, max_length=16)
    provenance: Literal["LINKED"]
    warnings: list[str] = Field(default_factory=list, max_length=16)
    discovered_at: str

    @model_validator(mode="after")
    def https_only(self):
        if self.url.scheme != "https":
            raise ValueError("candidate URL must use HTTPS")
        return self
```

`DistillationDecisionV1` must contain `candidate_id`, `status`, `reason_codes`, `claim`, `context_metric`, `coaching_implication`, `domain_codes`, `metric_codes`, `policy_codes`, `effect_code`, `proposed_evidence_code`, `source_title`, `source_url`, `contradiction_group`, and `limitations`. Fields required for accepted staging are optional at model level but enforced by a validator when status is `ACCEPTED-STAGING`.

- [ ] **Step 4: Add forbidden-content validation**

For `ACCEPTED-STAGING`, reject claim/coaching text that asserts unobservable quantities such as `ground reaction force`, `torque`, `muscle activation`, or labels the representative phase-fused estimate as actual/true 3D. Matching is a guardrail, not a scientific classifier; it supplements policy-code validation.

- [ ] **Step 5: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_models.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_models.py ml/coach/tests/test_miner_models.py
git add ml/coach/src/formpath_coach/miner_models.py ml/coach/tests/test_miner_models.py
git commit -m "feat(coach): add miner candidate and decision schemas"
```

### Task 2: Create the private inbox loader and data-branch contract

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_inbox.py`
- Create: `ml/coach/tests/test_miner_inbox.py`
- Create: `ml/coach/miner-data/README.md`

**Interfaces:**
- Produces `load_batch(path: Path) -> tuple[MinerCandidateV1, ...]`, `iter_inbox(root: Path) -> Iterator[tuple[Path, MinerCandidateV1]]`, and `batch_digest(candidates) -> str`.
- Public exporter targets `ml/coach/miner-data/inbox/YYYY/MM/DD/<batch-id>.jsonl` on private branch `miner/inbox-v1`.

- [ ] **Step 1: Write RED loader tests**

Create a temp JSONL with two valid candidates and assert both load in file order. Add malformed JSON, duplicate candidate IDs in one batch, and extra fields as hard failures.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_inbox.py -q`

- [ ] **Step 3: Implement explicit batch loading**

```python
def load_batch(path: Path) -> tuple[MinerCandidateV1, ...]:
    items = []
    seen = set()
    for line_no, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        item = MinerCandidateV1.model_validate_json(raw)
        if item.candidate_id in seen:
            raise ValueError(f"duplicate candidate_id in batch at line {line_no}")
        seen.add(item.candidate_id)
        items.append(item)
    return tuple(items)
```

Do not bulk-read or mutate canonical corpus files.

- [ ] **Step 4: Document branch/path separation**

`ml/coach/miner-data/README.md` must state that canonical code branches do not ingest `inbox/` automatically and that only accepted-staging files belong in a promotion PR. Raw inbox/review/rejected reports are operational data, not canonical knowledge.

- [ ] **Step 5: Create `miner/inbox-v1` branch during execution**

Base it from the current approved Coach integration head and create only `ml/coach/miner-data/inbox/.gitkeep` plus the README if required by Git mechanics. Do not merge this operational branch into the product branch.

- [ ] **Step 6: Run GREEN and commit code changes**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_inbox.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_inbox.py ml/coach/tests/test_miner_inbox.py
git add ml/coach/src/formpath_coach/miner_inbox.py ml/coach/tests/test_miner_inbox.py ml/coach/miner-data/README.md
git commit -m "feat(coach): add private miner inbox loader"
```

### Task 3: Authoritative duplicate and pending-state checks

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_dedupe.py`
- Create: `ml/coach/tests/test_miner_dedupe.py`

**Interfaces:**
- Produces `DuplicateResult(is_duplicate: bool, reasons: tuple[str, ...], matching_units: tuple[int, ...], matching_candidates: tuple[str, ...])` and `check_duplicate(candidate, pending, corpus_dir=CORPUS_DIR) -> DuplicateResult`.

- [ ] **Step 1: Write RED tests**

Cover exact DOI/stable-ID match, canonical URL match, exact normalized title+author+year match, pending candidate-ID match, and a near-title that must be flagged only as `possible_title_similarity` rather than auto-duplicate.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_dedupe.py -q`

- [ ] **Step 3: Implement private-side duplicate authority**

Use read-only `open_corpus()` and source metadata where available. Because the current 940-unit corpus has sparse provenance, do not claim an old unit is identical merely from topic codes. Exact stable identifier/URL is authoritative; normalized title-author-year is conservative; fuzzy title similarity only creates a REVIEW signal.

- [ ] **Step 4: Prove no mutation of canonical DB**

Test the corpus database SHA-256 before and after duplicate checks and assert it is unchanged.

- [ ] **Step 5: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_dedupe.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_dedupe.py ml/coach/tests/test_miner_dedupe.py
git add ml/coach/src/formpath_coach/miner_dedupe.py ml/coach/tests/test_miner_dedupe.py
git commit -m "feat(coach): add authoritative mined-source dedupe"
```

### Task 4: Validate GPT distillation decisions against FormPath ontology

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_policy.py`
- Create: `ml/coach/tests/test_miner_policy.py`

**Interfaces:**
- Produces `validate_decision(candidate: MinerCandidateV1, decision: DistillationDecisionV1) -> DistillationDecisionV1` and `decision_to_staging(candidate, decision) -> AcceptedStagingUnitV1`.
- Reuses `runtime_codes`, `map_evidence_tier`, and provenance rules from `corpus_mapping.py`; does not modify that file.

- [ ] **Step 1: Write RED acceptance-policy tests**

Test that `ACCEPTED-STAGING` fails when source URL changes from the candidate, source title is invented, domain/metric/policy code is unknown, evidence code is outside the existing 14 corpus codes, claim is empty, or coaching/interview material is falsely labeled as a randomized/experimental result.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_policy.py -q`

- [ ] **Step 3: Implement strict provenance equality**

```python
if str(decision.source_url) != str(candidate.url):
    raise ValueError("distillation may not replace source URL")
if decision.source_title and decision.source_title != candidate.title:
    raise ValueError("distillation may not invent source title")
```

For accepted staging, validate each ontology code using existing runtime vocabulary/sentinels. Validate proposed evidence code with existing `map_evidence_tier` to guarantee downstream B2-A.1 compatibility.

- [ ] **Step 4: Implement Option B status guards**

`academic` and `official` candidates may become accepted-staging only with stable provenance, inspectable claim text, explicit limitations, and valid ontology. `coaching`/`interview` candidates default to REVIEW unless their accepted claim is explicitly framed as direct guidance/experience and the policy includes contextual/limitation markers; they cannot be represented as causal experimental proof.

- [ ] **Step 5: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_policy.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_policy.py ml/coach/tests/test_miner_policy.py
git add ml/coach/src/formpath_coach/miner_policy.py ml/coach/tests/test_miner_policy.py
git commit -m "feat(coach): gate mined knowledge against FormPath policy"
```

### Task 5: Distillation checkpoint and daily report storage

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_reports.py`
- Create: `ml/coach/tests/test_miner_reports.py`
- Create: `ml/coach/miner-data/reports/.gitkeep`

**Interfaces:**
- Produces `load_distillation_checkpoint(path)`, `save_distillation_checkpoint(path, checkpoint)`, `build_daily_report(...) -> DailyDistillationReportV1`, and deterministic JSON serialization.

- [ ] **Step 1: Write RED tests**

Assert the checkpoint advances only after all decisions for the selected batch set are durably written. If one decision write fails, checkpoint remains unchanged. Report counts must equal actual decision objects and cannot accept caller-supplied fabricated totals.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_reports.py -q`

- [ ] **Step 3: Implement measured reports**

Build counts from `Counter(decision.status for decision in decisions)`, derive provenance coverage from accepted/review items, and list source-processing failures explicitly. Use sorted JSON keys for reproducibility.

- [ ] **Step 4: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_reports.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_reports.py ml/coach/tests/test_miner_reports.py
git add ml/coach/src/formpath_coach/miner_reports.py ml/coach/tests/test_miner_reports.py ml/coach/miner-data/reports/.gitkeep
git commit -m "feat(coach): add distillation checkpoint and reports"
```

### Task 6: Add private-ingestion CI and regression boundaries

**Files:**
- Create: `.github/workflows/miner-ingestion-ci.yml`
- Create: `ml/coach/tests/test_miner_regression_boundaries.py`

**Interfaces:**
- CI validates miner modules plus existing Coach/corpus/retrieval gates.

- [ ] **Step 1: Write RED regression-boundary tests**

Capture SHA-256 of frozen Coach schema files and the vendored corpus manifest/database in fixtures, then assert miner tests do not require modifying them. Assert `CANONICAL_FIRST_UNIT == 61`, `CANONICAL_LAST_UNIT == 1000` before promotion exists.

- [ ] **Step 2: Verify RED**

Run the focused test before the workflow exists.

- [ ] **Step 3: Add workflow**

Use Python 3.12, pinned checkout/setup-python SHAs, `permissions: contents: read`, and run:

```bash
python -m pip install "pytest>=8.4" "pydantic>=2.11" "ruff>=0.12"
PYTHONPATH=ml/coach/src python -m pytest \
  ml/coach/tests/test_miner_models.py \
  ml/coach/tests/test_miner_inbox.py \
  ml/coach/tests/test_miner_dedupe.py \
  ml/coach/tests/test_miner_policy.py \
  ml/coach/tests/test_miner_reports.py \
  ml/coach/tests/test_miner_regression_boundaries.py -q
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests -q
python -m ruff check ml/coach/src/formpath_coach ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests
```

- [ ] **Step 4: Verify B2-B.2 explicitly**

Run `PYTHONPATH=ml/coach/src python -m pytest ml/coach/evaluation_tests/test_retrieval_evaluation.py -q` and require the existing acceptance report to remain green.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/miner-ingestion-ci.yml ml/coach/tests/test_miner_regression_boundaries.py
git commit -m "ci(coach): gate private miner ingestion"
```

### Task 7: End-to-end private inbox integration test

**Files:**
- Create: `ml/coach/tests/test_miner_end_to_end.py`
- Create: `docs/integration/miner-private-ingestion-handoff.md`

**Interfaces:**
- Accepts the public plan's `[MINER-INTEGRATION-TEST]` candidate and proves it can be loaded, deduped, classified, reported, and left outside canonical corpus.

- [ ] **Step 1: Write the end-to-end test**

Load one synthetic batch, create a deterministic REVIEW decision, build a daily report, and assert `corpus_stats()` still returns 940 units with min 61 and max 1000.

- [ ] **Step 2: Run the full private Coach suite**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests -q
python -m ruff check ml/coach/src/formpath_coach ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests
```

- [ ] **Step 3: Remove the synthetic inbox artifact from operational data**

Delete only the integration-test batch; do not rewrite unrelated inbox history.

- [ ] **Step 4: Write measured handoff**

Record branch/head, exact test counts, corpus checksum/status, B2-B.2 result, and any remaining operational prerequisite. Do not claim daily GPT write access or promotion exists yet.

- [ ] **Step 5: Commit**

```bash
git add ml/coach/tests/test_miner_end_to_end.py docs/integration/miner-private-ingestion-handoff.md
git commit -m "test(coach): verify private miner ingestion end to end"
```
