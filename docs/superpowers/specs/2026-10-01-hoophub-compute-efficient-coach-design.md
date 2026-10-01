# Hoop Hub Compute-Efficient Coach Architecture — Design

Status: **DESIGN LOCKED — implementation is not implied by this document**
Date: 2026-10-01

## Goal

Build Hoop Hub's coaching intelligence so that accuracy improves primarily through better motion evidence, deterministic diagnosis, curated research evidence, and player feedback — not by scaling the language model first.

The architecture must make it possible to measure whether a larger model, knowledge distillation, or extra test-time compute is actually worth its cost.

## Locked architecture

```text
local source video
  -> perception / pose / shot-event pipeline
  -> structured motion evidence
       - existing normalized shot phase representation
       - semantic anchors / trajectories / context
       - measurement confidence + evidence boundary
  -> Decision Core
       - primary issue
       - secondary issue
       - do_not_change
       - diagnosis confidence
       - evidence requirements
  -> curated evidence retrieval
       - canonical HoopDB / Coach knowledge units only
       - no raw Miner candidate as prescription evidence
       - deduplicated / provenance-aware / contradiction-preserving
  -> Coach model
       - baseline candidate: Qwen3-4B-class + LoRA/QLoRA
       - schema-constrained response
       - explains the diagnosis; it is not the primary motion-measurement engine
  -> drill / cue / retest
  -> longitudinal player feedback
       - what changed after the recommendation
       - personalization only from observed history, not invented causality
```

## Decision 1 — Motion evidence comes before language-model reasoning

The Coach must not infer biomechanics directly from raw video in v1. The perception stack produces structured observations first.

Required properties:

- Preserve the existing evidence boundary: visible pose is not force, torque, muscle activation, measured physical 3D, synchronized physical time, or actual 4D unless such evidence genuinely exists.
- Carry measurement confidence into every downstream decision.
- Keep the existing Motion / Phase / Film presentation contracts independent from Coach reasoning.
- Raw video remains local under the current product policy; this design does not authorize raw-video server upload.

## Decision 2 — Decision Core is the central diagnosis layer

The Decision Core must reduce the problem given to the language model.

Minimum output contract:

```text
primary_issue
secondary_issue[]
do_not_change[]
diagnosis_confidence
supporting_observation_ids[]
required_evidence_topics[]
contradictions[]
```

The language model may phrase and explain these results, but it must not silently replace the Decision Core's diagnosis with an unsupported alternative.

The Decision Core must fail closed or reduce confidence when motion evidence is missing, contradictory, or low-confidence.

## Decision 3 — Research is retrieved evidence, not copied training text

Training examples are coaching scenarios. Research papers / knowledge units remain external evidence.

Allowed path:

```text
canonical knowledge unit
  -> retrieval
  -> evidence item with provenance / tier / limitations
  -> Coach request
```

Disallowed path:

```text
raw Miner scrape
  -> direct prescription rule
```

HoopDB quality is measured by usable canonical knowledge growth, not gross incoming count.

Primary data-efficiency metric:

```text
usable_canonical_units / incoming_candidates
```

Additional required metrics:

- duplicate / near-duplicate rate
- rejected rate by reason
- contradiction rate
- provenance-complete rate
- oldest pending age
- usable corpus growth per day

## Decision 4 — 4B is the baseline candidate, not a dogma

The current Coach scaffold's first real training target remains Qwen3-4B-class with LoRA/QLoRA.

This is a baseline because it matches the local deployment goal and current RTX 4060 8 GB constraints better than starting with a larger model. It is **not** a pre-decided final winner.

An 8B-class model is a benchmark candidate and is adopted only after the complete full-stack 4B baseline exists and the larger model demonstrates a justified quality/cost trade-off on the same held-out evaluation set.

No model-size escalation is allowed merely because a larger model exists.

## Decision 5 — Distillation is conditional

Knowledge distillation is introduced only after a supervised baseline exists.

KD is justified when the teacher provides signal that is not merely a rephrasing of the student's existing labels — for example stronger reasoning, better calibrated explanations, or useful synthetic scenarios that pass deterministic validation.

Required order:

```text
gold scenarios
  -> SFT baseline
  -> evaluate
  -> teacher/KD experiment
  -> evaluate against the same held-out set
```

Teacher output never bypasses schema validation, evidence checks, or human-reviewed gold evaluation.

## Decision 6 — Test-time compute is selective

Extra inference work is reserved for cases where it can change the decision.

Trigger candidates:

- low diagnosis confidence
- contradictory evidence
- two or more plausible diagnoses with similar support
- evidence retrieval disagreement

Selective path:

```text
initial diagnosis
  -> candidate alternatives
  -> evidence re-check
  -> contradiction / verifier pass
  -> final response
```

Routine high-confidence cases stay single-pass.

## Decision 7 — Personalization is the later moat

Personalization is based on repeated measured outcomes, not assumed player traits.

The minimum feedback record must be able to represent:

```text
baseline observation
recommendation / drill
retest observation
time interval / context
measurement confidence
change direction / magnitude when measurable
```

The system may learn that a cue appears more or less useful for a player only from repeated observed outcomes. It must not claim causality from one before/after pair.

## Evaluation contract — Hoop Hub Efficient Frontier

All architecture choices are compared on one frozen held-out gold set.

Required comparison ladder:

| Variant | Stack |
| --- | --- |
| A | Coach model only |
| B | Motion evidence + Coach |
| C | Motion + Decision Core + Coach |
| D | C + curated HoopDB retrieval |
| E | D + KD candidate |
| F | D/E + selective test-time compute |
| G | best small-model stack reproduced with 8B-class benchmark |

Required quality metrics:

- primary diagnosis accuracy
- secondary diagnosis accuracy / set agreement
- `do_not_change` violation rate
- unsupported-claim rate
- evidence consistency / citation validity
- contradiction handling accuracy
- confidence calibration
- drill/retest contract validity

Required efficiency metrics:

- p50 / p95 latency
- peak VRAM
- generated tokens / request
- wall-clock GPU time / request
- training GPU time for each candidate
- correct diagnoses per unit compute

The model-size decision is based on the quality/compute Pareto frontier. A larger model is not accepted as the default if the smaller full stack is Pareto-superior or the quality gain is not material enough to justify its recurring cost.

## Gold-set policy

The first benchmark must be source-held-out and player/session-separated where applicable.

Each gold scenario should contain, when knowable:

- player / shot context
- structured motion observations
- observation confidence
- primary issue
- acceptable secondary issues
- `do_not_change`
- required / permitted evidence
- forbidden inference classes
- acceptable coaching cue(s)
- retest requirement

Evaluation data must not be reused as synthetic training data.

## Current repository boundary

Existing `ml/coach/` code remains the starting scaffold. As of this design lock, the repository documentation states that the Coach is experimental, the real Qwen3-4B training run has not been executed, retrieval is not implemented, PlayerState/perception bridging is not implemented, and mobile integration is not implemented.

This design does not upgrade any of those items to implemented status.

## Non-goals / guardrails

- Do not pretrain a foundation model from scratch.
- Do not train the Coach on copied paper text as the main supervision format.
- Do not let the LLM directly decide measurement facts that the motion pipeline did not provide.
- Do not weaken measurement/evidence boundaries to improve benchmark scores.
- Do not upload raw user video to the server as part of this work.
- Do not change Firestore schemas merely to support the benchmark without a separately reviewed product need.
- Do not scale Miner collection rate as a proxy for knowledge quality.
- Do not adopt 8B, KD, or multi-pass inference before the simpler baseline has a measured score.

## Research basis used for this design

The design was checked against the following research directions before lock:

- Kaplan et al., *Scaling Laws for Neural Language Models* (arXiv:2001.08361)
- Hoffmann et al., *Training Compute-Optimal Large Language Models* / Chinchilla (arXiv:2203.15556)
- Lee et al., *Deduplicating Training Data Makes Language Models Better* (ACL 2022)
- Li et al., *DataComp-LM* (arXiv:2406.11794)
- Snell et al., *Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters* (arXiv:2408.03314)
- Liu et al., *Understanding Knowledge Distillation in Post-Training: When It Helps and When It Fails* (arXiv:2606.22942)

These papers motivate the experiments; they do not prove that a particular Hoop Hub model size will win. That decision remains empirical under the evaluation contract above.
