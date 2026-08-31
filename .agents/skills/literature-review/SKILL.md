---
name: literature-review
description: Systematic/scoping/rapid literature review workflow with reproducible search strategy, multi-database coverage, screening, citation snowballing, evidence tables, and bias assessment.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Pratikrishi97/sciagent-skills/tree/main/skills/literature-review
  upstream_version: "1.0.0"
  adapter_reviewed: 2026-08-31
---

# Literature Review

Adapted from SciAgent Skills `literature-review`.

## Use when

Use for systematic reviews, scoping reviews, technology literature surveys, citation-network exploration, meta-analysis planning, or when a technical question requires a defensible map of the published record rather than a few convenient papers.

## Workflow

1. Define the research question and inclusion/exclusion criteria. Use PICO/PECO/SPIDER where appropriate, otherwise define population/system, intervention/method, comparator, outcomes, and time window explicitly.
2. Build database-specific search terms. Do not blindly reuse one natural-language query everywhere.
3. Search multiple independent indexes where relevant: Crossref, OpenAlex, Semantic Scholar, PubMed, arXiv and domain databases. For software/engineering work, add source repositories, standards, patents, datasets, and proceedings.
4. Normalize records and deduplicate by DOI/identifier first, then title/year/author similarity.
5. Screen titles/abstracts, then full text where needed. Record exclusion reasons.
6. Snowball backward references and forward citations from high-value papers.
7. Extract an evidence table: method, dataset/sample, comparator, metrics, assumptions, limitations, code/data availability, and relevance to FormPath.
8. Assess evidence quality and risk of bias. Do not treat citation count as quality.
9. Synthesize convergences, disagreements, negative results, gaps, and the most promising unresolved questions.
10. Save exact search strings, dates, hit counts, inclusion decisions, and final source set so the review can be reproduced.

## Rules

- Prefer primary papers and the authors' released code/data for load-bearing claims.
- A review paper is a map, not automatically the final evidence.
- Do not merge metrics measured under incompatible protocols without explaining the mismatch.
- Track publication date and version/preprint status.
- Preserve negative or null findings; do not cherry-pick.
- For meta-analysis, verify that effect measures and study designs are actually poolable before calculating a pooled estimate.
