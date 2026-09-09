# Basketball Knowledge Miner Public Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the public `Rudwpahs/basketball-knowledge-miner` repository that discovers, normalizes, deduplicates, relevance-filters, and securely exports new basketball-source candidates every three hours with a hard cap of 500 inspected records per run.

**Architecture:** A small Python package runs on GitHub-hosted Ubuntu runners. Source adapters emit a common `SourceRecord`; deterministic normalization and relevance logic convert those into `CandidateRecord`s; a run orchestrator enforces the global budget and per-source limits; only relevance-passed candidates are sent to the private Hooper's Hub inbox. Public checkpoint state lives on a dedicated `miner-state` branch and contains no private FormPath text.

**Tech Stack:** Python 3.12, Pydantic 2.11+, httpx 0.28+, pytest 8.4+, Ruff 0.12+, GitHub Actions, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-09-09-basketball-knowledge-miner-design.md`

## Global Constraints

- Target $0 incremental cloud spend; do not add a billing-enabled cloud service.
- Schedule is `17 */3 * * *`; GitHub cron is not assumed exact to the minute.
- A run may inspect at most 500 source records total.
- Public code/state must not contain FormPath RU text, private Coach data, raw video, full transcripts, or full copyrighted articles.
- V1 sources are Option B: academic/official plus explicitly allowlisted high-quality coaching/direct-expert material; Reddit/social/forum scraping is excluded.
- Never use `pull_request_target` with export secrets.
- Routine CI must not require live network access.
- Private export failure must fail closed: do not advance the exported checkpoint.
- The miner assigns source class and topic/relevance signals only; it does not assign final FormPath evidence grade.

---

### Task 1: Bootstrap the public repository and package

**Files:**
- Create in new public repo: `pyproject.toml`
- Create: `src/basketball_miner/__init__.py`
- Create: `src/basketball_miner/models.py`
- Create: `tests/test_models.py`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces `SourceRecord`, `CandidateRecord`, `Checkpoint`, and `RunCounters` Pydantic models used by every later task.

- [ ] **Step 1: Create the public repository**

Create `Rudwpahs/basketball-knowledge-miner` as a **public** repository with default branch `main`. Do not initialize it with sample application code. This repository does not currently exist, so execution cannot proceed past this step until it exists.

- [ ] **Step 2: Write the failing model tests**

```python
from basketball_miner.models import CandidateRecord, SourceRecord


def test_candidate_rejects_non_https_url():
    source = SourceRecord(
        adapter="crossref",
        source_type="academic",
        stable_id="10.1234/example",
        url="https://doi.org/10.1234/example",
        title="Basketball shooting biomechanics",
        authors=["A. Author"],
        published_at="2026-09-01",
        summary="Release mechanics in basketball shooting.",
    )
    payload = source.model_dump()
    payload["url"] = "http://example.com/paper"
    try:
        CandidateRecord.model_validate({
            **payload,
            "candidate_id": "CAND-0123456789abcdef",
            "canonical_hash": "0" * 64,
            "topic_codes": ["SHOOTING"],
            "relevance_signals": ["basketball"],
            "provenance": "LINKED",
            "warnings": [],
            "discovered_at": "2026-09-09T00:00:00Z",
        })
    except ValueError:
        return
    raise AssertionError("non-HTTPS candidate URL must be rejected")
```

- [ ] **Step 3: Run the test and verify RED**

Run: `python -m pytest tests/test_models.py -q`

Expected: FAIL because `basketball_miner.models` does not exist.

- [ ] **Step 4: Implement the models**

```python
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

SourceType = Literal["academic", "official", "coaching", "interview"]
Provenance = Literal["LINKED"]


class SourceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    adapter: str
    source_type: SourceType
    stable_id: str
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    authors: list[str] = Field(default_factory=list, max_length=32)
    published_at: str | None = None
    summary: str | None = Field(default=None, max_length=1200)


class CandidateRecord(SourceRecord):
    candidate_id: str = Field(pattern=r"^CAND-[0-9a-f]{16}$")
    canonical_hash: str = Field(pattern=r"^[0-9a-f]{64}$")
    topic_codes: list[str] = Field(default_factory=list, max_length=12)
    relevance_signals: list[str] = Field(default_factory=list, max_length=16)
    provenance: Provenance
    warnings: list[str] = Field(default_factory=list, max_length=16)
    discovered_at: str

    @classmethod
    def model_validate(cls, obj, *args, **kwargs):
        candidate = super().model_validate(obj, *args, **kwargs)
        if candidate.url.scheme != "https":
            raise ValueError("candidate URL must use HTTPS")
        return candidate
```

Also define:

```python
class Checkpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")
    adapter: str
    last_checked_at: str | None = None
    cursor: str | None = None
    last_stable_id_hash: str | None = None


class RunCounters(BaseModel):
    inspected: int = 0
    duplicates: int = 0
    relevance_passed: int = 0
    exported: int = 0
    rate_limited: int = 0
    adapter_errors: int = 0
```

- [ ] **Step 5: Add package config and run GREEN**

Use a minimal `pyproject.toml` with Python `>=3.12`, runtime dependencies `pydantic>=2.11,<3` and `httpx>=0.28,<1`, and dev dependencies `pytest>=8.4` and `ruff>=0.12`.

Run:

```bash
python -m pip install -e '.[dev]'
python -m pytest tests/test_models.py -q
python -m ruff check src tests
```

Expected: tests pass and Ruff is clean.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml src tests .gitignore README.md
git commit -m "feat: bootstrap basketball knowledge miner"
```

### Task 2: Deterministic normalization, IDs, dedupe, and checkpoints

**Files:**
- Create: `src/basketball_miner/normalize.py`
- Create: `src/basketball_miner/state.py`
- Create: `tests/test_normalize.py`
- Create: `tests/test_state.py`

**Interfaces:**
- Produces `canonicalize_url(url: str) -> str`, `stable_candidate_id(record: SourceRecord) -> tuple[str, str]`, `fingerprint(record: SourceRecord) -> str`, `load_checkpoint(path: Path, adapter: str) -> Checkpoint`, `save_checkpoint(path: Path, checkpoint: Checkpoint) -> None`.

- [ ] **Step 1: Write failing normalization tests**

```python
from basketball_miner.normalize import canonicalize_url, stable_candidate_id
from basketball_miner.models import SourceRecord


def test_canonicalize_url_removes_tracking_and_fragment():
    assert canonicalize_url("https://example.org/a?utm_source=x&id=7#section") == "https://example.org/a?id=7"


def test_candidate_id_is_deterministic():
    record = SourceRecord(adapter="crossref", source_type="academic", stable_id="10.1/x", url="https://doi.org/10.1/x", title="Basketball", authors=[], published_at=None, summary=None)
    assert stable_candidate_id(record) == stable_candidate_id(record)
```

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_normalize.py tests/test_state.py -q`

Expected: import failure.

- [ ] **Step 3: Implement canonicalization and hashes**

Use `urllib.parse` to lowercase scheme/host, strip fragments, remove `utm_*`, `fbclid`, and `gclid`, sort remaining query pairs, normalize DOI to lowercase, and hash the canonical identity with SHA-256. Candidate ID is `CAND-` plus the first 16 hex characters.

```python
def stable_candidate_id(record: SourceRecord) -> tuple[str, str]:
    canonical_url = canonicalize_url(str(record.url))
    identity = f"{record.adapter}\n{record.stable_id.strip().lower()}\n{canonical_url}"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    return f"CAND-{digest[:16]}", digest
```

- [ ] **Step 4: Implement atomic checkpoint writes**

Write JSON to `path.with_suffix('.tmp')`, flush, then `replace(path)`. A malformed checkpoint must raise rather than silently reset.

- [ ] **Step 5: Run GREEN and commit**

```bash
python -m pytest tests/test_normalize.py tests/test_state.py -q
python -m ruff check src tests
git add src tests
git commit -m "feat: add deterministic miner state and dedupe"
```

### Task 3: Crossref academic adapter

**Files:**
- Create: `src/basketball_miner/sources/base.py`
- Create: `src/basketball_miner/sources/crossref.py`
- Create: `tests/fixtures/crossref.json`
- Create: `tests/test_crossref.py`

**Interfaces:**
- Produces protocol `SourceAdapter.fetch(checkpoint: Checkpoint, limit: int) -> AdapterBatch`.
- `AdapterBatch` contains `records: list[SourceRecord]`, `next_checkpoint: Checkpoint`, `rate_limited: bool`.

- [ ] **Step 1: Write fixture-based RED tests**

Test that a Crossref response with two basketball records produces two normalized `SourceRecord`s, strips HTML from abstracts, retains DOI as `stable_id`, and does not exceed the supplied limit.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_crossref.py -q`

- [ ] **Step 3: Implement adapter with bounded HTTP behavior**

Use one `httpx.Client(timeout=10.0, follow_redirects=True)` and query Crossref with basketball-focused terms. Send a descriptive `User-Agent`. Treat 429 as `rate_limited=True`; if `Retry-After` exists, record it in warnings but do not sleep beyond the run budget. Retry 5xx at most twice with delays 1s then 2s.

- [ ] **Step 4: Prove malformed rows are skipped, not fatal**

Add a fixture row with no title or URL and assert the valid rows still return while `adapter_errors` is incrementable by the orchestrator.

- [ ] **Step 5: Run GREEN and commit**

```bash
python -m pytest tests/test_crossref.py -q
python -m ruff check src tests
git add src tests
git commit -m "feat: add Crossref basketball source adapter"
```

### Task 4: YouTube allowlisted coaching/direct-expert RSS adapter

**Files:**
- Create: `config/youtube_channels.json`
- Create: `src/basketball_miner/sources/youtube_rss.py`
- Create: `tests/fixtures/youtube_feed.xml`
- Create: `tests/test_youtube_rss.py`

**Interfaces:**
- Produces `YouTubeRssAdapter(channel_ids: tuple[str, ...])` implementing `SourceAdapter`.

- [ ] **Step 1: Write RED tests**

Assert that only channel IDs present in `config/youtube_channels.json` are requested, an Atom entry maps to `source_type="coaching"` or `"interview"`, and full transcript/video content is absent from the resulting model.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_youtube_rss.py -q`

- [ ] **Step 3: Implement XML parsing**

Use `xml.etree.ElementTree`; persist video ID as `stable_id`, canonical watch URL as source URL, title, published date, channel/author, and at most the short feed description allowed by `summary` length. Do not call transcript APIs and do not download video bytes.

- [ ] **Step 4: Run GREEN and commit**

```bash
python -m pytest tests/test_youtube_rss.py -q
python -m ruff check src tests
git add config src tests
git commit -m "feat: add allowlisted coaching RSS adapter"
```

### Task 5: Relevance filter and 500-record run orchestrator

**Files:**
- Create: `src/basketball_miner/relevance.py`
- Create: `src/basketball_miner/run.py`
- Create: `tests/test_relevance.py`
- Create: `tests/test_run.py`

**Interfaces:**
- Produces `classify_relevance(record: SourceRecord) -> RelevanceResult` and `run_miner(adapters: list[SourceAdapter], sink: CandidateSink, budget: int = 500) -> RunCounters`.

- [ ] **Step 1: Write RED tests for hard positives/negatives**

Include positives such as `basketball jump shot release angle`, `pick and roll decision making`, `basketball defensive closeout`, and negatives such as football shooting, generic knee surgery without basketball context, crypto mining, and unrelated AI papers.

- [ ] **Step 2: Write the budget test before implementation**

```python
def test_run_never_inspects_more_than_500(fake_adapter, fake_sink):
    fake_adapter.records = [make_source(i) for i in range(700)]
    counters = run_miner([fake_adapter], fake_sink, budget=500)
    assert counters.inspected == 500
```

- [ ] **Step 3: Verify RED**

Run: `python -m pytest tests/test_relevance.py tests/test_run.py -q`

- [ ] **Step 4: Implement conservative deterministic relevance rules**

Require at least one basketball anchor (`basketball`, `hoops`, `jump shot`, `free throw`, `pick and roll`, `layup`, `dribble`, `closeout`) and map matched terms to public topic codes such as `SHOOTING`, `BIOMECHANICS`, `DECISION`, `DEFENSE`, `FOOTWORK`, `MOTOR_LEARNING`, `FATIGUE`, `PNR_TACTICS`, `SPACING_OFFBALL`, `YOUTH`, `COACHING_METHOD`. The filter answers relevance only; it does not assign evidence quality.

- [ ] **Step 5: Implement fair budget allocation**

Round-robin adapters in bounded chunks so one source cannot consume all 500 slots. Stop immediately when `inspected == budget`. Advance an adapter checkpoint only after its exported relevance-passed records succeed.

- [ ] **Step 6: Run GREEN and commit**

```bash
python -m pytest tests/test_relevance.py tests/test_run.py -q
python -m ruff check src tests
git add src tests
git commit -m "feat: add bounded basketball relevance pipeline"
```

### Task 6: Secure private export contract

**Files:**
- Create: `src/basketball_miner/export.py`
- Create: `tests/test_export.py`
- Create: `tests/test_redaction.py`

**Interfaces:**
- Produces `GitHubPrivateRepoSink(repo: str, branch: str, token: str)` implementing `write_batch(batch_id: str, candidates: list[CandidateRecord]) -> ExportReceipt`.
- Private target path is `ml/coach/miner-data/inbox/YYYY/MM/DD/<batch_id>.jsonl`.

- [ ] **Step 1: Write fake-transport RED tests**

Assert the client uses `PUT /repos/Rudwpahs/shooting-profile-coach-ios/contents/<path>`, base64-encodes newline-delimited candidate JSON, never includes the token in exception text, and returns a receipt only for 2xx responses.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_export.py tests/test_redaction.py -q`

- [ ] **Step 3: Implement exporter**

The exporter must accept an injected `httpx.Client` for tests. Authorization uses `Bearer <token>` header only. Log only batch ID, item count, target path hash, HTTP status class, and elapsed time; never log candidate payloads or authenticated URLs.

- [ ] **Step 4: Prove fail-closed semantics**

Test 401, 403, 409, 429, and 5xx. Each must return/raise an export failure and leave the caller's checkpoint unchanged.

- [ ] **Step 5: Run GREEN and commit**

```bash
python -m pytest tests/test_export.py tests/test_redaction.py -q
python -m ruff check src tests
git add src tests
git commit -m "feat: add private candidate export sink"
```

### Task 7: GitHub Actions schedule, state branch, and security gates

**Files:**
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/mine.yml`
- Create: `tests/test_workflow_policy.py`
- Create: `scripts/run_miner.py`

**Interfaces:**
- Scheduled workflow calls `scripts/run_miner.py` with `HOOPHUB_MINER_TOKEN` only on `schedule` and manually trusted `workflow_dispatch`.

- [ ] **Step 1: Write workflow-policy RED tests**

Parse workflow text and assert: no `pull_request_target`; schedule contains `17 */3 * * *`; test job uses `contents: read`; export job is absent from `pull_request` execution path; checkout/setup-python are pinned to immutable SHAs; no command echoes the secret.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest tests/test_workflow_policy.py -q`

- [ ] **Step 3: Create routine CI**

`test.yml` runs `pytest -q` and `ruff check src tests scripts` on push/PR with `permissions: contents: read` and no secrets.

- [ ] **Step 4: Create the three-hour miner workflow**

Use:

```yaml
on:
  schedule:
    - cron: "17 */3 * * *"
  workflow_dispatch:

permissions:
  contents: read
```

The workflow checks out `main`, fetches the `miner-state` branch into a temporary state directory, runs the miner, exports candidates using `HOOPHUB_MINER_TOKEN`, and updates `miner-state` only after successful private export. State updates use a dedicated job with only the public-repo write permission required for that branch.

- [ ] **Step 5: Create `miner-state` branch with empty safe state**

Initialize only checkpoint JSON and `seen_hashes.jsonl`; verify no candidate title, URL, summary, or private FormPath text is committed there.

- [ ] **Step 6: Run GREEN and commit**

```bash
python -m pytest -q
python -m ruff check src tests scripts
git add .github scripts tests
git commit -m "ci: schedule secure three-hour knowledge mining"
```

### Task 8: End-to-end dry run and public handoff

**Files:**
- Modify: `README.md`
- Create: `docs/OPERATIONS.md`

**Interfaces:**
- Produces the operational contract consumed by the private-ingestion implementation plan.

- [ ] **Step 1: Run a no-secret dry run**

Run with fake sink and fixture adapters. Expected: at most 500 inspected, deterministic IDs, non-sensitive counters, and no network requirement.

- [ ] **Step 2: Run one trusted manual Action with export disabled**

Confirm live Crossref and allowlisted YouTube metadata can be discovered without storing full source content. Record fetched/inspected/relevance-pass counts only.

- [ ] **Step 3: Configure the fine-grained secret**

Create a fine-grained credential restricted to `Rudwpahs/shooting-profile-coach-ios` with only the repository content permission needed to create files under the private inbox. Store it as `HOOPHUB_MINER_TOKEN` in the public repo Actions secrets. Do not place the token in repo variables, YAML, state, logs, or docs.

- [ ] **Step 4: Run one trusted export dry run with a single synthetic candidate**

The synthetic candidate title must begin `[MINER-INTEGRATION-TEST]`; verify exactly one private inbox file is created, its schema is valid, and the public log contains no candidate payload or token-like value. Remove the synthetic inbox file after the private-ingestion tests consume it.

- [ ] **Step 5: Final verification**

```bash
python -m pytest -q
python -m ruff check src tests scripts
```

Expected: all tests pass. Confirm the public repository contains no private FormPath RU text and no full transcripts/articles.

- [ ] **Step 6: Commit handoff docs**

```bash
git add README.md docs/OPERATIONS.md
git commit -m "docs: document miner operations and security"
```
