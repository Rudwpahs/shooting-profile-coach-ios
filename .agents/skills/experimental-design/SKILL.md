---
name: experimental-design
description: Design experiments before collecting data: hypotheses, controls, randomization, blocking, power/sample size, factorial/ablation designs, sequential testing, and analysis plans.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Pratikrishi97/sciagent-skills/tree/main/skills/experimental-design
  upstream_version: "1.0.0"
  adapter_reviewed: 2026-08-31
---

# Experimental Design

Adapted from SciAgent Skills `experimental-design` for FormPath algorithm and product validation work.

## Use when

Use before benchmarking a reconstruction method, tuning thresholds, comparing pose pipelines, testing capture protocols, designing ablations, validating latency/accuracy, or planning user/product experiments.

## Workflow

1. State the hypothesis and the smallest effect/difference that would matter in practice.
2. Define independent variables, outcomes, nuisance variables, controls, and exclusion criteria before running the test.
3. Choose the design: paired/repeated measures, randomized groups, full or fractional factorial, ablation matrix, response-surface design, or sequential/Bayesian optimization.
4. Randomize run/order where temporal drift could matter; block on known nuisance factors such as device, subject, session, lighting, distance, camera angle, or operator.
5. Estimate sample size/power where statistical inference is intended. For engineering validation, define target confidence intervals and minimum repeated runs even when formal power analysis is not appropriate.
6. Predefine the analysis: metrics, aggregation, outlier handling, multiple-comparison correction, uncertainty intervals, and failure thresholds.
7. Run a pilot to verify instrumentation and variance before committing the full test budget.
8. Report effect sizes and uncertainty, not only p-values or a single mean.

## FormPath-specific defaults

For shooting-form reconstruction, separate at least: person/session variance, front-vs-side capture variance, camera geometry, pose-estimator error, phase-alignment error, and reconstruction-model error. Use ablations to show what each correction/gate contributes.

Whenever two algorithms are compared, keep input clips and evaluation protocol identical where possible. Do not compare published benchmark numbers across incompatible datasets as if they were a head-to-head experiment.

## Integrity

Do not choose thresholds after looking at the test set and then report them as pre-specified. Preserve failed runs and null results. If the design changed midstream, document the deviation explicitly.
