---
name: research
description: Persistent, source-grounded multi-source research for substantive questions, current comparisons, technical investigations, and evidence synthesis. Use when a question needs more than a quick lookup.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/hec-ovi/research-skill
  upstream_release: v0.2.7
  adapter_reviewed: 2026-08-31
---

# Research

Project-local adapter of `hec-ovi/research-skill`, tailored for FormPath and portable across Codex, Claude, and other Agent Skills hosts.

## Trigger

Use for substantive research questions, especially: latest methods, compare approaches, evaluate tools, investigate how a technique works, or deep research that spans multiple independent sources. Do not invoke for a one-source fact or a small code lookup.

## Core workflow

1. **Retrieve before re-researching.** Check committed `docs/research/` and any local `.research/` scratch index for a strong topic match.
2. **Decompose.** Turn the question into explicit sub-claims and state what evidence would settle each.
3. **Gather broadly.** Prefer primary/official sources, papers, standards, source repositories, release notes, filings, datasets, and direct measurements. Use secondary sources to discover primary evidence, not as a substitute for it.
4. **Triangulate.** Seek at least two independent sources for each load-bearing non-trivial claim. If only one exists, label the claim single-sourced.
5. **Validate.** Re-check exact numbers, dates, versions, equations, benchmark conditions, and whether the cited source actually says what the synthesis claims.
6. **Contrarian pass.** Actively search for failure cases, criticism, deprecation, negative results, contradictory measurements, and reasons the favored conclusion may be wrong.
7. **Extract insight.** Separate raw facts from causal interpretation, comparison, and inference. Mark inference as inference.
8. **Synthesize.** Answer every named part of the question, list residual disagreements, and state a confidence level grounded in evidence quality.
9. **Store.** Put reusable validated findings in `docs/research/<topic>/`; local/raw scratch may live in `.research/` and stay untracked.

## Evidence rules

- Current claims require current sources and explicit dates.
- Primary evidence outranks summaries, vendor marketing, reposts, and social posts.
- Independent means different origin, not mirrors of the same source.
- Never fabricate citations, DOI metadata, benchmark conditions, or source access.
- Preserve disagreement instead of forcing consensus.
- A polished synthesis is not a substitute for coverage: completeness and source support come first.

## Research record

For durable findings, record: question, date verified, scope, sources, findings, objections/failed approaches, confidence, unresolved questions, and what evidence would change the conclusion.
