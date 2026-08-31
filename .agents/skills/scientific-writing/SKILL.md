---
name: scientific-writing
description: Turn completed research into rigorous technical/scientific reports with claim-evidence traceability, methods/results separation, limitations, reproducibility details, and publication-ready structure.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Pratikrishi97/sciagent-skills/tree/main/skills/scientific-writing
  upstream_version: "1.0.0"
  adapter_reviewed: 2026-08-31
---

# Scientific Writing

Adapted from SciAgent Skills `scientific-writing`.

## Trigger

Use after evidence gathering/experimentation when the user asks for a technical report, research memo, paper-style write-up, methods/results section, research summary, or publication-ready explanation.

## Structure

Default to a compact IMRaD-like structure where appropriate:

1. Question / objective.
2. Background and prior work.
3. Methods and protocol.
4. Results — facts and measured outputs only.
5. Discussion — interpretation, comparisons, mechanism, implications.
6. Limitations / threats to validity.
7. Conclusion and next experiments.
8. Sources / reproducibility record.

## Claim discipline

- Every quantitative or externally verifiable claim must trace to a cited source or recorded experiment.
- Keep Results separate from interpretation; do not smuggle assumptions into measured findings.
- Prefer primary sources and exact implementation versions.
- State uncertainty, negative results, and unresolved contradictions.
- Do not turn correlation into causation without the design to justify it.
- Never invent citations or metadata.

## FormPath research reports

For algorithm reports, include dataset/capture conditions, calibration assumptions, estimator/model versions, metrics, baselines, ablations, failure cases, compute/device context, and the exact commit/run used when available.

For research notes intended to guide implementation, end with: `What is established`, `What is plausible`, `What is still unknown`, and `Next falsifiable test`.

## Reproducibility

Where a report contains generated figures/tables/numbers, prefer machine-generated results over manually retyped values. Keep reusable research under `docs/research/` and link back to run manifests or source records.
