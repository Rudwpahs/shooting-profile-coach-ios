# Basketball Knowledge Miner Distillation and Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn daily GPT decisions into auditable `ACCEPTED-STAGING` records, deterministically promote approved staged knowledge to new RU numbers, regenerate the FormPath Knowledge Machine, open/update a single Draft PR, and keep final merge manual.

**Architecture:** ChatGPT performs daily semantic distillation over the private inbox but cannot directly mutate the canonical corpus. It writes only validated decision/staging JSON on a `miner/distill-YYYY-MM-DD` branch. Repository code then deterministically allocates RU IDs, rebuilds a temporary Knowledge Machine, regenerates SQLite/JSONL/source/manifest/vocabulary artifacts, and CI proves the result before the Draft PR is considered merge-ready. One active distillation PR at a time prevents RU collisions.

**Tech Stack:** Existing `ml/coach` Python package, Python 3.12, SQLite/FTS5, Pydantic 2.11+, pytest/Ruff, GitHub Actions, ChatGPT scheduled automation, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-09-09-basketball-knowledge-miner-design.md`

## Global Constraints

- Daily GPT automation may classify and stage; it may never auto-merge.
- Final canonical merge remains manual.
- RU-0001..RU-0060 remain permanently absent.
- Allocation starts after the actual current canonical maximum; do not hardcode 1001 once the corpus grows.
- Existing ontology/evidence codes and B2-A.1 mapping remain authoritative.
- New accepted mined knowledge must preserve LINKED source provenance; never invent DOI/title/URL/author/timestamp.
- Frozen Coach V1 contracts, Representative 4D, UI/Firebase/MotionPacket, and PR #4 validation are outside scope.
- B2-B.1 and B2-B.2 regressions must remain green after corpus growth.
- Generated corpus artifacts must be deterministic from base corpus + accepted staging input.
- CI failure returns the item/PR to review; never weaken a test to force acceptance.

---

### Task 1: Make corpus validation growth-safe without weakening the RU-0001..0060 gate

**Files:**
- Modify: `ml/coach/src/formpath_coach/corpus.py`
- Modify: `ml/coach/tests/test_corpus_v2.py`
- Create: `ml/coach/tests/test_corpus_growth.py`

**Interfaces:**
- Produces `canonical_range(corpus_dir=CORPUS_DIR) -> tuple[int, int, int]` returning `(first, last, count)` from validated manifest/vocabulary/DB agreement.
- Preserves `CANONICAL_FIRST_UNIT = 61` as an invariant; removes the assumption that the last unit must always be 1000.

- [ ] **Step 1: Write the RED growth test**

Copy the corpus fixture to a temp directory, append a synthetic RU-1001 consistently to DB/JSONL/manifest/vocabulary, then assert validation should accept contiguous RU-0061..RU-1001 while still rejecting any RU below 61.

```python
def test_validator_accepts_manifest_defined_contiguous_growth(tmp_path, corpus_copy):
    grown = append_synthetic_unit(corpus_copy, unit_no=1001)
    result = validate_corpus(grown)
    assert result["range"] == "RU-0061..RU-1001"
    assert result["units"] == 941
```

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_corpus_growth.py -q`

Expected: FAIL because current `validate_corpus()` requires exactly RU-0061..RU-1000 and 940 units.

- [ ] **Step 3: Replace hardcoded last/count validation with manifest agreement**

Keep `CANONICAL_FIRST_UNIT = 61`. Parse `canonical_unit_range` and `canonical_unit_count` from the manifest; require vocabulary `unit_range`/`unit_count`, DB min/max/count, JSONL line count, and sequential IDs to agree exactly. Explicitly require `ru_0001_0060_policy == "DISCARDED_BY_OWNER_DO_NOT_RECOVER"`.

```python
def canonical_range(corpus_dir: Path = CORPUS_DIR) -> tuple[int, int, int]:
    manifest = corpus_manifest(corpus_dir)
    vocabulary = controlled_vocabulary(corpus_dir)
    first, last = map(int, vocabulary["unit_range"])
    count = int(vocabulary["unit_count"])
    if first != 61 or count != last - first + 1:
        raise CorpusError("invalid canonical unit range")
    if manifest.get("canonical_unit_count") != count:
        raise CorpusError("manifest/vocabulary unit count mismatch")
    return first, last, count
```

- [ ] **Step 4: Preserve baseline assertions separately**

Existing tests may still assert that the currently committed baseline is 940/RU-1000 until a real promotion PR changes the artifact. Growth capability tests use temporary copies and do not erase the historical baseline test.

- [ ] **Step 5: Run GREEN and full corpus regressions**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_corpus_v2.py ml/coach/tests/test_corpus_growth.py ml/coach/tests/test_corpus_mapping.py -q
python -m ruff check ml/coach/src/formpath_coach/corpus.py ml/coach/tests/test_corpus_v2.py ml/coach/tests/test_corpus_growth.py
```

- [ ] **Step 6: Commit**

```bash
git add ml/coach/src/formpath_coach/corpus.py ml/coach/tests/test_corpus_v2.py ml/coach/tests/test_corpus_growth.py
git commit -m "refactor(coach): make corpus validator growth-safe"
```

### Task 2: Add deterministic staging and RU allocation

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_promotion.py`
- Create: `ml/coach/tests/test_miner_promotion.py`

**Interfaces:**
- Produces `PromotionInput`, `PromotedUnit`, `allocate_ru_ids(staging, current_last) -> tuple[PromotedUnit, ...]`, `source_id_for(url: str) -> str`.

- [ ] **Step 1: Write RED allocation tests**

```python
def test_allocate_ru_ids_is_sorted_and_sequential():
    staged = [accepted("CAND-bbbbbbbbbbbbbbbb"), accepted("CAND-aaaaaaaaaaaaaaaa")]
    promoted = allocate_ru_ids(staged, current_last=1000)
    assert [x.unit_id for x in promoted] == ["RU-1001", "RU-1002"]
    assert [x.candidate_id for x in promoted] == [
        "CAND-aaaaaaaaaaaaaaaa",
        "CAND-bbbbbbbbbbbbbbbb",
    ]
```

Also test duplicate candidate IDs, an attempt to allocate RU-0060, unknown ontology codes, and conflicting source URLs as hard failures.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_promotion.py -q`

- [ ] **Step 3: Implement deterministic ordering and source IDs**

Sort accepted staging by `candidate_id` before allocation. Build source IDs as `SRC-` plus the first 10 uppercase SHA-256 hex characters of the canonical HTTPS URL, matching the existing source-ID style.

```python
def source_id_for(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest().upper()
    return f"SRC-{digest[:10]}"
```

- [ ] **Step 4: Validate every promoted unit through B2-A.1-compatible codes**

Call the existing runtime-code checks and `map_evidence_tier()` before a promoted unit is emitted. Provenance must be `LINKED`.

- [ ] **Step 5: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_promotion.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_promotion.py ml/coach/tests/test_miner_promotion.py
git add ml/coach/src/formpath_coach/miner_promotion.py ml/coach/tests/test_miner_promotion.py
git commit -m "feat(coach): allocate deterministic mined RU promotions"
```

### Task 3: Build a deterministic Knowledge Machine regenerator

**Files:**
- Create: `ml/coach/src/formpath_coach/corpus_builder.py`
- Create: `ml/coach/tests/test_corpus_builder.py`

**Interfaces:**
- Produces `build_promoted_corpus(base_dir: Path, staging: Sequence[AcceptedStagingUnitV1], output_dir: Path) -> BuildReport`.
- Build report contains old/new range, inserted unit/source IDs, and SHA-256 values for generated DB/JSONL.

- [ ] **Step 1: Write RED deterministic-build test**

Build the same one-unit promotion twice into two temp directories and assert byte-identical `units.machine.jsonl`, `sources.jsonl`, `manifest.json`, `controlled-vocabulary.json`, and logically identical SQLite content. For SQLite byte identity, use deterministic PRAGMAs and `VACUUM INTO`; if byte identity is not stable across the same SQLite runtime, assert a deterministic logical dump hash and record the runtime version in the manifest/build report rather than pretending binary identity.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_corpus_builder.py -q`

- [ ] **Step 3: Implement copy-on-build, never in-place mutation**

Copy the base Knowledge Machine directory to `output_dir`. Open the copied DB read-write. Insert into:

```text
units(unit_no, unit_id, effect_code, evidence_code, evidence_method, provenance_code,
      claim, context_metric, coaching_implication, evidence_raw)
unit_domains(unit_no, code)
unit_metrics(unit_no, code)
unit_policies(unit_no, code)
sources(source_id, label, title, url)
unit_sources(unit_no, source_id)
unit_fts
```

Use `evidence_method="MINED_DISTILLATION_V1"` and `provenance_code="LINKED"` for new units. `evidence_raw` stores a compact audit string such as `source_type=<type>;candidate_id=<id>` rather than fabricated scientific detail.

- [ ] **Step 4: Append machine JSONL using the existing structure**

Emit keys in stable order matching existing records:

```python
{
    "id": promoted.unit_id,
    "n": promoted.unit_no,
    "domain_codes": list(promoted.domain_codes),
    "metric_codes": list(promoted.metric_codes),
    "effect_code": promoted.effect_code,
    "policy_codes": list(promoted.policy_codes),
    "evidence_code": promoted.evidence_code,
    "evidence_method": "MINED_DISTILLATION_V1",
    "provenance_code": "LINKED",
    "source_ids": [promoted.source_id],
    "payload": {
        "claim": promoted.claim,
        "context_metric": promoted.context_metric,
        "coaching_implication": promoted.coaching_implication,
        "evidence_raw": promoted.evidence_raw,
    },
    "origin": {
        "line": None,
        "occurrences": 1,
        "batch": "Basketball Knowledge Miner",
        "candidate_id": promoted.candidate_id,
    },
}
```

- [ ] **Step 5: Regenerate `sources.jsonl`, manifest counts, vocabulary range/count, and hashes**

Source rows follow the existing shape: `source_id`, `label`, `title`, `url`. Update domain/metric/policy/evidence counts from the generated DB rather than incrementing caller-supplied numbers. Update `canonical_unit_range`, `canonical_unit_count`, DB hash, JSONL hash, `unit_range`, and `unit_count`. Preserve vocabulary code lists and the discarded-RU policy.

- [ ] **Step 6: Rebuild FTS and validate output**

Insert new claim/context/coaching text into `unit_fts` using the existing schema. Run `validate_corpus(output_dir)` and fail the build if it does not pass.

- [ ] **Step 7: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_corpus_builder.py ml/coach/tests/test_corpus_growth.py -q
python -m ruff check ml/coach/src/formpath_coach/corpus_builder.py ml/coach/tests/test_corpus_builder.py
git add ml/coach/src/formpath_coach/corpus_builder.py ml/coach/tests/test_corpus_builder.py
git commit -m "feat(coach): deterministically rebuild promoted corpus"
```

### Task 4: Add single-active-Draft-PR promotion state

**Files:**
- Create: `ml/coach/src/formpath_coach/miner_pr_state.py`
- Create: `ml/coach/tests/test_miner_pr_state.py`

**Interfaces:**
- Produces `DistillationPrState(active_branch: str | None, active_pr: int | None, base_sha: str, staged_candidate_ids: tuple[str, ...])` and pure functions that decide create-vs-append-vs-block.

- [ ] **Step 1: Write RED state-machine tests**

Cases:
- no open distillation PR -> `CREATE`;
- one open Draft PR -> `APPEND` only to its branch;
- two matching open PRs -> `BLOCK`;
- base SHA changed and allocated RU range conflicts -> `BLOCK_REBASE_REQUIRED`;
- previously staged candidate appears again -> dedupe, not a second RU.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_pr_state.py -q`

- [ ] **Step 3: Implement pure state logic**

No GitHub network calls in this module. It consumes normalized PR metadata so it remains fixture-testable.

- [ ] **Step 4: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_pr_state.py -q
python -m ruff check ml/coach/src/formpath_coach/miner_pr_state.py ml/coach/tests/test_miner_pr_state.py
git add ml/coach/src/formpath_coach/miner_pr_state.py ml/coach/tests/test_miner_pr_state.py
git commit -m "feat(coach): enforce single active miner promotion PR"
```

### Task 5: Add distillation branch writer and generator workflow

**Files:**
- Create: `scripts/miner_generate_promotion.py`
- Create: `.github/workflows/miner-promotion-ci.yml`
- Create: `ml/coach/tests/test_miner_promotion_workflow.py`

**Interfaces:**
- `scripts/miner_generate_promotion.py --staging <jsonl> --base-corpus <dir> --output <dir>` generates the complete proposed Knowledge Machine into a temp/output path.
- A trusted workflow may commit generated artifacts to an existing `miner/distill-*` branch; it never merges the PR.

- [ ] **Step 1: Write RED workflow-policy tests**

Assert the workflow has no `pull_request_target`, does not run write steps for fork PRs, uses pinned checkout/setup-python actions, and contains no auto-merge command/API call.

- [ ] **Step 2: Verify RED**

Run: `PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_promotion_workflow.py -q`

- [ ] **Step 3: Implement generator CLI**

Read `accepted-staging/*.jsonl`, validate each record with private miner schemas, dedupe candidate IDs, call `canonical_range()` on the base, allocate IDs, build into a temporary directory, and print a non-sensitive JSON `BuildReport`.

- [ ] **Step 4: Add trusted generation workflow**

Trigger only via `workflow_dispatch` and/or push to `miner/distill-*` branches originating in this repository. Give the generation job only `contents: write` needed to commit regenerated corpus artifacts to that same branch. Never expose this write path to untrusted fork code.

- [ ] **Step 5: Commit only expected artifact paths**

Before commit, assert the diff is restricted to:

```text
ml/coach/corpus/knowledge-machine-v2/formpath_knowledge.sqlite
ml/coach/corpus/knowledge-machine-v2/units.machine.jsonl
ml/coach/corpus/knowledge-machine-v2/sources.jsonl
ml/coach/corpus/knowledge-machine-v2/manifest.json
ml/coach/corpus/knowledge-machine-v2/controlled-vocabulary.json
ml/coach/miner-data/accepted-staging/**
ml/coach/miner-data/reports/**
```

Plus explicitly approved validator/builder code already reviewed in the implementation branch. Abort on UI/Firebase/MotionPacket/frozen-contract changes.

- [ ] **Step 6: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_promotion_workflow.py -q
python -m ruff check scripts/miner_generate_promotion.py ml/coach/tests/test_miner_promotion_workflow.py
git add scripts/miner_generate_promotion.py .github/workflows/miner-promotion-ci.yml ml/coach/tests/test_miner_promotion_workflow.py
git commit -m "ci(coach): generate mined corpus promotions safely"
```

### Task 6: Add merge-readiness CI over corpus, retrieval, and frozen boundaries

**Files:**
- Modify: `.github/workflows/miner-promotion-ci.yml`
- Create: `ml/coach/tests/test_miner_merge_gate.py`

**Interfaces:**
- Produces a binary merge-ready gate only after every required engineering check passes; it does not perform merge.

- [ ] **Step 1: Write RED merge-gate tests**

Reject non-contiguous RUs, RU-0001..0060 appearance, unknown source ID, missing HTTPS source, missing LINKED provenance for newly mined units, unknown evidence code, duplicate candidate provenance, forbidden actual-3D/force/torque/muscle claims, and changes to frozen Coach contract fixtures.

- [ ] **Step 2: Add full CI commands**

Run at minimum:

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests -q
PYTHONPATH=ml/coach/src python -m pytest ml/coach/retrieval_tests -q
PYTHONPATH=ml/coach/src python -m pytest ml/coach/evaluation_tests/test_retrieval_evaluation.py -q
python -m ruff check ml/coach/src/formpath_coach ml/coach/tests ml/coach/retrieval_tests ml/coach/evaluation_tests scripts
```

Also invoke `validate_corpus()` on the generated corpus and execute existing repository typecheck/lint/unit/Firestore/web-export checks through the established Representative 4D CI path or equivalent required checks.

- [ ] **Step 3: Add retrieval-delta report without post-hoc threshold tuning**

Run the fixed B2-B.2 40-case benchmark on the promoted corpus and store the report. Existing acceptance thresholds remain unchanged. If a promotion causes failure, the PR is not merge-ready; do not tune weights/thresholds inside the same promotion PR merely to pass.

- [ ] **Step 4: Run GREEN and commit**

```bash
PYTHONPATH=ml/coach/src python -m pytest ml/coach/tests/test_miner_merge_gate.py -q
git add .github/workflows/miner-promotion-ci.yml ml/coach/tests/test_miner_merge_gate.py
git commit -m "ci(coach): gate mined knowledge promotion merges"
```

### Task 7: Upgrade the daily ChatGPT automation from preflight to write-enabled distillation

**Files:**
- Modify scheduled automation configuration, not repository runtime code.
- Create: `docs/integration/miner-daily-distillation-contract.md`

**Interfaces:**
- Scheduled ChatGPT run reads new private inbox batches since the last successful checkpoint and writes only validated decision/staging/report files to the active distillation branch.

- [ ] **Step 1: Keep the current automation in preflight mode until Tasks 1-6 are green**

Do not change it early. Until the schemas, private inbox, builder, and PR gates exist, the automation must continue reporting `blocked` rather than fabricating results.

- [ ] **Step 2: Replace the automation prompt with the exact write contract**

The run instruction must require this order:

```text
1. Read new private inbox batches since the last successful checkpoint.
2. Validate each candidate against MinerCandidateV1-equivalent fields.
3. Deduplicate against canonical and pending candidates.
4. Inspect original source/provenance when accessible; never invent missing metadata.
5. Emit exactly one status: DUPLICATE / REJECTED / REVIEW / ACCEPTED-STAGING.
6. For ACCEPTED-STAGING, provide claim/context/coaching implication + existing FormPath codes + existing evidence code + explicit limitations.
7. Validate source URL/title equality to the candidate.
8. Write decision JSONL and daily report to the one active miner/distill-* branch.
9. If accepted items exist, request/trigger the trusted promotion-generation workflow or leave the branch ready for that workflow.
10. Create/update one Draft PR only; never merge.
11. Advance the distillation checkpoint only after writes succeed.
12. Report measured counts and exact blockers; never fabricate collection or CI results.
```

- [ ] **Step 3: Preserve Option B semantics in the prompt**

Academic/official can auto-stage only when traceable and inspectably supported. Coaching/interview defaults to REVIEW unless phrased strictly as direct guidance/experience with context/limitations; it is never upgraded to experimental causal evidence by reputation.

- [ ] **Step 4: Update the scheduled automation with the new prompt**

Keep the cadence once daily in `Asia/Seoul`. Do not create a second overlapping distillation automation.

- [ ] **Step 5: Document the automation boundary**

`miner-daily-distillation-contract.md` must state that ChatGPT semantic judgment is not the canonical writer; repository validators and CI remain the final automated gate before manual merge.

### Task 8: Perform the first end-to-end mined-knowledge rehearsal

**Files:**
- Create: `docs/integration/miner-v1-end-to-end-handoff.md`
- Runtime output: one Draft `miner/distill-YYYY-MM-DD` PR.

**Interfaces:**
- Proves public discovery -> private inbox -> GPT distillation -> accepted staging -> deterministic corpus build -> CI -> Draft PR, with no auto-merge.

- [ ] **Step 1: Start with a synthetic linked academic candidate**

Use a clearly labeled integration source/candidate that cannot be confused with production knowledge. Drive it through the pipeline and ensure its final status is REVIEW or explicitly test-only staging; do not merge it into canonical corpus.

- [ ] **Step 2: Run one real candidate rehearsal without merging**

Choose one newly mined, traceable academic/official source. Let the daily distiller decide its status. If accepted-staging, generate the proposed corpus and run all merge gates. If REVIEW/REJECTED/DUPLICATE, treat that as a valid rehearsal result rather than forcing acceptance.

- [ ] **Step 3: Verify human control**

Confirm the resulting PR is Draft and open, no merge commit exists, and canonical base remains unchanged until explicit human action.

- [ ] **Step 4: Record measured evidence**

Handoff must include public miner run ID, private batch ID, candidate ID, decision status, proposed RU ID if any, generated corpus hashes, B2-B.2 result, full test counts, PR number/state, and explicit confirmation that no auto-merge occurred.

- [ ] **Step 5: Remove synthetic test staging and retain only auditable production decisions**

Do not rewrite genuine history. Remove only clearly tagged synthetic test artifacts from the active promotion branch before any real merge review.

- [ ] **Step 6: Final verification before declaring V1 ready**

Require all V1 success criteria from the design spec, including at least one working academic/official adapter and one coaching/direct-expert adapter, exact 500-record run cap, safe private export, daily four-state distillation, Draft PR generation, green corpus/B2-A.1/B2-B.1/B2-B.2 regressions, and manual-only final merge.
