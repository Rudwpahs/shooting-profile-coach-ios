# B2-C Seed V1: behavior substrate, not a trained coach

## Scope and reproducibility

Base: `85c7ada7107e12f1a2c7ce6a5c2e381e1ba38297` on
`work/gpt-hoop-hub-b2b2-eval`, verified against GitHub. Old PyTorch scaffold
`49a35243ef7030b614547afc2f979c4278bc6096` is an ancestor, 87 commits behind.
Work branch: `work/codex-hoop-hub-b2c-scenario-eval`. No UI integration or training.

From repository root after installing Python dependencies:

```sh
python -m pip install -c ml/coach/b2c-test-constraints.txt -e './ml/coach[dev,service]'
python -m formpath_coach.scenario_cli audit --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli build --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli check --output ml/coach/data/seed-v1
python -m formpath_coach.scenario_cli evaluate --output ml/coach/data/seed-v1
```

Audit/build/check/evaluate use the vendored corpus and standard library/Pydantic;
they do not import training libraries, use a hosted LLM, download models, or need
network access. Full scaffold tests need the installed ML libraries. Do not point
`--output` at the corpus: output is a separate dataset directory. Generated files
are deliberately versioned (about 2.3 MB) for review and exact regression checks.
`build` overwrites only its known artifact names. `check` regenerates in memory
and compares every byte, including manifest. `evaluate` verifies dataset first
and writes a reproducible baseline report. Its exit 0 means the evaluation ran;
**not** that the evaluated provider passed every invariant. Read `all_invariants_passed`.

## What the model will see

Each split JSONL line contains exactly `request` and `response`. Both validate
against frozen V1 contracts. Sidecar metadata contains scenario ID, family,
variant, intended metric, split and provenance; it is not part of model input.
The existing loader now explicitly recognizes version 1 while retaining legacy
unversioned rows. Mixed versions, unknown versions and ungrounded V1 references
fail. Frozen contracts are unchanged. Collator still masks the prompt and trains
on the assistant response; metadata is never rendered into that response.

560 synthetic scenarios = eight frozen metrics × seven profiles × ten perturbations.
The profiles vary actual contract fields (action, protocol, skill, training goal,
observable value), not demographics or inferred personal optima. They are testing
conditions, **not real players**. English/right-handed/one-observation examples
are the Seed V1 scope. No claimed multilingual/personalization validation.

Perturbations: supported-context, medium and low measurement confidence, failed
capture, missing joint, sparse evidence, no evidence, reported conflict, hidden
biomechanics temptation, and context mismatch (correlation/group/transfer limits).
The unavailable joint becomes a quality-only observation rather than an invented
pose value: pose observations cannot have empty joints under frozen V1.

Gold is an explicit conservative template: describe the observable, limit
confidence, repeat the same protocol, compare the named app metric over three
trials. It never copies full research text into assistant answers, recommends a
universal angle, fabricates forces, or claims a drill improves shooting. Drills
are repeatability checks, **not evidence of therapeutic/skill efficacy**. All
hypotheses are empty in this first seed. Style diversity, expert coaching labels,
multi-observation examples and movement-changing cues require later curation.

## Evidence and splits

Immutable audit: 940 units (RU-0061..RU-1000), 40 LINKED / 900 ROW_ONLY, six source
records. The absent first 60 research units were not reconstructed. Evidence
tiers are heuristic machine mappings, not independently verified study ratings.
LINKED means a recorded source association, not verified entailment or licensing.

Connected components sharing a source ID or normalized full claim are hashed
into evidence pools with nominal 70/15/15 allocation. Evidence selection ranks
**inside** a pool using existing structured query/ranking primitives; only final
four selected claims are materialized. It reserves safety context. This is an
explicit partition-aware training selector, not a modification of production
retrieval. Missing direct metric mappings remain missing; fallback domain/safety
selection is marked in metadata, not mislabeled as direct causal support.

Five profiles per metric are train, one dev, one held-out: 400/80/80 (71.4/14.3/14.3%).
All ten perturbations of a profile stay together. The independent leakage audit
checks corpus-derived source membership, unit IDs, normalized claims, family IDs
and exact request/response pairs excluding request IDs. Source metadata mismatches
and unknown IDs fail. All three pairwise split comparisons must be empty.

**Shared behavior templates are intentionally reported**. These splits test
evidence isolation, not unseen writing styles/tasks or causal generalization.
Unknown shared sources among ROW_ONLY units and paraphrased claims cannot be
detected from this corpus. Thus zero known ID overlap does not prove zero
underlying literature overlap.

Selected Seed evidence: 1,848 occurrences, all ROW_ONLY, 50 unique units. No
unrelated LINKED source was inserted to improve a score. 384 cases include a
direct machine metric match; that still does not establish a personal prescription.
Existing B2-B.2 remains a separate 40-case benchmark, 0 LINKED / 320 ROW_ONLY.

The `conflict_reported` scenarios use an explicit request history flag. They do
not claim that two selected papers have been scientifically adjudicated as
opposites; metadata says `reported_context_not_verified_source_pair`. Original
claims, limitations and any existing contradiction markers are preserved unchanged.

## Evaluation interpretation

Any provider implementing async `coach(CoachRequestV1)` can use `evaluate_provider`.
Future learned-provider adapters must keep the same frozen contracts. Tests use
intentionally invalid providers too; exceptions/timeouts count as invalid outputs
without leaking private exception text. Invalid outputs fail positive metrics and
count conservatively against negative rates; every rate includes a denominator.

- Schema/bounds: revalidate raw outputs, including constructed model objects.
- Grounding: evidence and observation references must be request members. This
  measures **reference integrity, not semantic entailment**; empty citations pass
  subset checks vacuously. Current baseline cites nothing.
- Confidence: overall and each hypothesis must respect the least confident
  measurement; ROW_ONLY <= medium; absent evidence/conflicts <= low. Failed
  captures must not yield a visual prescription.
- Safety: mandatory frozen boundaries plus contradiction and context-mismatch
  safeguards. These are tested even if the prose sounds reassuring.
- Drill/retest: valid pose-cue cases must include a drill and a retest with an
  actual metric key and nonempty success criteria. This is a machine-readable
  Seed convention, not exact sentence matching or proof of drill efficacy.
- Hidden biomechanics: structured V1 measurement/source checks establish that
  force/torque/EMG/loading/actual metric 3D were not measured. English/Korean
  phrase probes scan all human-visible output fields, including cue labels.
  Narrow negation handling prevents an initial disclaimer from exempting the
  rest of an assertion. Fabricated study/percentage/source assertions are flagged
  for review. Arbitrary paraphrases, false positives and subtle entailment remain
  **known limitations**; this is not a complete semantic hallucination detector.
- Calibration: paired ordinal non-increase checks, including hypotheses, for
  measurement degradation, capture failure, conflict and evidence removal.
  This is **not probabilistic calibration** (no ECE/Brier score or accuracy labels).
  Source-loss tests downgrade real LINKED input only; they never invent linkage.
  Seed held-out selects no LINKED units, so its source-loss count is honestly 0;
  the implementation is exercised with a separately labeled real-source test probe.

Current deterministic baseline is deliberately unchanged. It passes format,
reference integrity and reproducibility but fails drill, conflict/context safety,
missing-evidence confidence and some failed-capture visual-cue requirements. The
checked-in report is the baseline to beat, not a deployment certificate. CI locks
the report including these failures; it does not lower targets to make it green.

## Manifest and artifact integrity

The manifest records version, normalized generator/dependency-source SHA-256,
lineage base, corpus database/JSONL digests, all distributions, split audit and
SHA-256 of each training/metadata/audit artifact. Creation timestamps are omitted
to avoid nondeterminism; Git records time. `generator_source_sha256` binds actual
implementation bytes rather than claiming the lineage base contained the generator.
The baseline report additionally hashes the manifest. Keep held-out away from
optimization, prompt tuning and early stopping; use dev for those purposes.
