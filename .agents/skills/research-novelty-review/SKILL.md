---
name: research-novelty-review
description: Novelty gate and reviewer simulation for proposed algorithms, methods, experiments, and research contributions. Use before calling a FormPath idea novel, before a large validation program, or when deciding whether a method is publication-worthy or technically differentiated.
license: MIT adapter
metadata:
  version: "1.0-formpath"
  adapted-from: "ngtiendong/Academic-Research-Agent-Skill"
  category: research-review
---

# FormPath Research Novelty + Reviewer Gate

Use this skill after literature grounding and before making a strong novelty claim or committing to an expensive research program.

A **failed novelty gate blocks the novelty claim, not necessarily product implementation**. An engineering combination may still be useful even when it is not scientifically novel.

## Required inputs

- precise problem statement and non-goals;
- proposed contribution/mechanism;
- closest prior work and strongest baselines;
- planned evaluation and falsifiable hypothesis;
- known constraints of the FormPath capture/product environment.

## Gate A — Closest-prior-work matrix

Do not compare only with convenient baselines. Identify the closest work by mechanism and by objective.

For each closest work record:

| Work | Same problem? | Same mechanism? | Same inputs? | Same assumptions? | Same evaluation? | Key difference |
|---|---|---|---|---|---|---|

If closest prior work has not been inspected, the novelty gate cannot pass.

## Gate B — Contribution decomposition

Break the claimed contribution into atomic deltas. For each delta, label it:

- `KNOWN`: already established in close prior work;
- `COMBINATION`: known elements combined in a useful engineering system;
- `ADAPTATION`: existing method adapted to a new constraint/domain;
- `MECHANISTIC_NOVELTY`: new algorithmic mechanism/objective/estimator;
- `MEASUREMENT_NOVELTY`: new observable, protocol, or validation method;
- `EMPIRICAL_NOVELTY`: new evidence/result without a new mechanism;
- `UNCLEAR`: insufficient literature grounding.

Do not convert `COMBINATION` or `ADAPTATION` into a stronger novelty label without evidence.

## Gate C — Falsifiability and distinguishability

A strong contribution must have:

1. a measurable hypothesis;
2. an explicit mechanism for why the proposed delta should matter;
3. an experiment capable of distinguishing the method from the closest baseline;
4. appropriate ablations isolating the claimed contribution;
5. known failure conditions or conditions under which the method should lose.

If the planned experiment cannot distinguish the claimed novelty, return `CONDITIONAL` or `FAIL`.

## Gate D — Reality check before full execution

Before expensive implementation/experiments, require the smallest feasibility pilot that can kill the idea cheaply.

For FormPath algorithm work, typical pilots include:

- synthetic or controlled geometry before uncontrolled phone video;
- landmark-noise injection before full user testing;
- one bounded reconstruction sequence before dataset expansion;
- baseline comparison before UI/product integration.

Record the threshold that counts as pass/fail **before** running the pilot.

## Reviewer simulation

Run three independent review perspectives after the novelty assessment.

### Reviewer 1 — Supportive

Find the strongest defensible contribution. Identify what would make it valuable even if the novelty is modest.

### Reviewer 2 — Skeptical

Assume the headline is overstated. Search for the closest prior art, hidden assumptions, trivial reformulations, missing negative evidence, and cases where the contribution collapses to an existing method.

### Reviewer 3 — Methods-focused

Ignore marketing value. Audit operational definitions, measurement validity, null/baseline choice, sample/unit independence, ablations, metrics, uncertainty, and whether every headline claim maps to a specific experiment arm.

## Verdict

Return exactly one:

- `PASS` — clear defensible delta over inspected closest prior work, falsifiable, and distinguishable by the planned experiment;
- `CONDITIONAL PASS` — promising but requires named evidence/experiment/scope changes;
- `FAIL` — novelty claim is not currently defensible.

## Required output

```markdown
# Novelty & Reviewer Gate — <idea>
Verified: YYYY-MM-DD

## Novelty verdict
PASS | CONDITIONAL PASS | FAIL

## Closest prior work
...

## Atomic contribution map
...

## Why this is / is not novel
...

## Minimum falsification pilot
- Hypothesis:
- Baseline:
- Manipulation:
- Metric:
- Pass threshold:
- Fail threshold:

## Reviewer simulation
### Supportive reviewer
...
### Skeptical reviewer
...
### Methods reviewer
...

## Required fixes before stronger claims
...
```

## Persistence

Store durable gates under `docs/research/reviews/` and link them from the corresponding research/algorithm document.

## Provenance

Adapted from `ngtiendong/Academic-Research-Agent-Skill` (MIT). The upstream skill defines a novelty gate, Reality Gate, feasibility pilot and reviewer simulation; FormPath adds explicit contribution labels and the rule that a failed scientific-novelty gate does not automatically block a useful product implementation.
