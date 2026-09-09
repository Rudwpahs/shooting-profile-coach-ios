# B2-B.1 structured evidence retrieval handoff

Date: 2026-09-09 (Asia/Seoul)

Status: **B2-B.1 STRUCTURED RETRIEVAL READY**

## Branch and base

- Branch: `work/gpt-hoop-hub-b2b1-retrieval`
- Base: `work/claude-hoop-hub-b2a1-compat` at `3534746eea552cf113fb2d90114b05d7e60d36c1`
- Verified implementation head: `0caf19cc836ef019b1fe6dea79c4cde1aef058f7`
- Draft integration PR: #6
- Frozen Coach contract and vendored Knowledge Machine v2 were not modified.

## What B2-B.1 implements

The retrieval path is deterministic and machine-code-first:

```text
CoachRequestV1
  -> build_evidence_query_plan
  -> DOMAIN / METRIC / POLICY / fixed FTS terms
  -> retrieve_candidate_units (code-only, bounded)
  -> rank_evidence_candidates
  -> final max-8 research-unit ids
  -> load natural-language payload for those ids only
  -> B2-A.1 corpus_mapping
  -> frozen CoachEvidenceItemV1[]
```

No LLM sees or reranks the 940-unit corpus. Candidate retrieval uses the read-only
SQLite machine-code accessor added in B2-A. Natural-language claims are loaded
only after final research-unit ids have been selected.

## Query planning

Frozen Coach metrics map only to defensible Knowledge Machine codes. Examples:

- `release_elbow_angle_deg` -> `SHOOTING`, `BIOMECHANICS`, `JOINT_ANGLE`
- `release_wrist_height_sb` -> `SHOOTING`, `RELEASE_BALLISTICS`, `RELEASE_HEIGHT`
- `deepest_dip_knee_angle_deg` -> `SHOOTING`, `BIOMECHANICS`, `JOINT_ANGLE`
- `capture_quality` -> `POSE_VALIDATION`, `POSE_ERROR`

Known shot actions add a `SHOOTING` domain and fixed internal FTS terms. A failed
capture adds `POSE_VALIDATION`. No user-supplied free text is turned into an FTS
query.

The plan always carries the corpus safety policies:

- `DO_NOT_OVERINFER`
- `DO_NOT_INFER_UNOBSERVABLE`
- `REQUIRE_CONTEXT`
- `CONFIDENCE_GATE`
- `HYPOTHESIS_ONLY`
- `USE_PERSONAL_BASELINE`

## Deterministic ranking

The score is fixed and transparent:

- exact metric match: +100 each
- domain match: +30 each
- safety/policy match: +10 each
- mapped frozen evidence-tier strength: +2 per strength level
- `LINKED` provenance: +4
- fixed FTS hit: +8

Ties are resolved deterministically by provenance, mapped evidence strength and
research-unit number. Duplicate research-unit ids are removed before ranking.

Candidate retrieval defaults to 40 code-only units. Final evidence defaults to 8
and may never exceed the frozen Coach contract maximum of 16.

## Safety and provenance behavior

If the selected top-N would contain no safety/limitation unit while a bounded
candidate has one, the best available safety unit replaces the last selected
unit. This prevents performance evidence from systematically crowding out
limitations.

B2-A.1 remains authoritative for provenance and tier conversion:

- `LINKED` is preferred when otherwise comparable.
- `ROW_ONLY` remains retrievable, has `source_title = null`, carries provenance
  limitations and cannot raise Coach confidence beyond its frozen policy cap.
- Corpus evidence tiers are conservatively mapped to the frozen Coach V1 tiers.

## Failure behavior

Corpus absence or SQLite/I/O availability failure returns `evidence=[]`.
The Coach/provider path can therefore continue without evidence. Schema errors,
unknown corpus codes and mapping violations are deliberately not hidden as
availability failures; they remain strict failures during development.

## TDD evidence

Three red/green cycles were recorded in GitHub Actions:

1. Query plan: a hermetic red failure for missing `formpath_coach.retrieval`,
   followed by green.
2. Candidate/ranking: three red failures for missing ranking/retrieval functions,
   followed by green.
3. Final selection: five red failures for the missing selection/text-load
   boundary, followed by green.

The final focused suite contains 9 tests covering deterministic query planning,
metric-first ranking, `LINKED` preference, bounded machine-code candidate
retrieval, duplicate removal, final frozen-contract validation, selected-id-only
text loading, preservation of one safety unit, fail-open empty evidence, and the
contract evidence limit.

## Verification

At verified implementation head `0caf19c`:

- Focused B2-B.1 retrieval suite: **9 passed**
- Focused ruff: **clean**
- Full Coach suite including retrieval: **301 passed**
- Full Coach ruff (`ml/coach/src`, existing tests, retrieval tests): **clean**
- Representative 4D CI: **success** — typecheck, lint, hermetic unit tests,
  Firestore Rules emulator and Expo web export all completed successfully.
- `3534746..0caf19c` changed only the B2-B.1 workflow, retrieval implementation
  and retrieval tests. No `ml/coach/corpus/**` file and no frozen contract file
  changed.

## Deliberately not implemented

- embeddings
- vector database / semantic vector index
- LLM reranking
- scenario generation
- train/dev/held-out evaluation corpus
- QLoRA/SFT or model weights
- Coach contract migration
- corpus artifact mutation
- UI, Firebase, MotionPacket or PR #4 reconstruction changes

The next AI gate may build hybrid/semantic retrieval or evaluation on top of this
bounded deterministic baseline, but B2-B.1 stops here.
