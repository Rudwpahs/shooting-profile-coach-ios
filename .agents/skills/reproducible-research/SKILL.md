---
name: reproducible-research
description: Make algorithm and experimental research reproducible through deterministic runs, environment/version capture, data provenance, run manifests, immutable inputs, and repeatable reports.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Pratikrishi97/sciagent-skills/tree/main/skills/reproducible-research
  upstream_version: "1.0.0"
  adapter_reviewed: 2026-08-31
---

# Reproducible Research

Adapted from SciAgent Skills `reproducible-research`.

## Goal

A result is not complete until another run can reproduce how it was obtained. Apply this skill to algorithm benchmarks, dataset conversions, calibration experiments, pose/reconstruction evaluations, simulation work, and research reports.

## Minimum run record

Every decision-relevant experiment should record:

- experiment/run ID and timestamp;
- git commit SHA and dirty-tree status;
- input dataset/video IDs and hashes or immutable provenance;
- device/camera/model/runtime versions;
- random seed and deterministic settings where applicable;
- configuration/feature flags/thresholds;
- command or script used;
- metrics plus per-sample/raw outputs needed to recompute them;
- failures/exclusions and reason;
- environment information sufficient to recreate the run.

## Workflow

1. Freeze the hypothesis and protocol using `experimental-design` when applicable.
2. Pin code and configuration to an exact commit/run manifest.
3. Keep raw inputs immutable; derived data gets a documented transformation and version.
4. Seed all supported RNGs and note operations that remain nondeterministic.
5. Prefer scripted pipelines over hand-edited outputs. A figure/table should be regenerable from stored results.
6. Store machine-readable metrics (JSON/CSV/Parquet) before formatting them into prose.
7. Re-run a representative subset from a clean environment before declaring reproducibility.
8. When results change after a code/data update, preserve the old run and explain the delta rather than overwriting history.

## FormPath rule

Algorithm claims in `docs/research/` should link to the exact implementation commit and, where practical, the validation artifact/run ID that produced the reported number. Research conclusions derived only from manual visual inspection must say so explicitly.

## Scope

Do not add heavy workflow managers or container tooling to the production Expo runtime. Research infrastructure stays in scripts/dev tooling and should only be introduced when it materially improves repeatability.
