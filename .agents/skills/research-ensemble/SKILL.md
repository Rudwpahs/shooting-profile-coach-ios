---
name: research-ensemble
description: Run diverse independent research rollouts, merge coverage pairwise, and verify candidate conclusions before final synthesis. Use for high-stakes, broad, ambiguous, or coverage-sensitive research where one trajectory may miss important evidence.
license: Project-authored methodology adapter; see provenance
metadata:
  version: "1.0-formpath"
  category: research-orchestration
---

# FormPath Research Ensemble

This skill addresses **path dependency**: one research trajectory can choose a weak decomposition early and miss an entire line of evidence.

Do not use it by default. Use it when missing an important fact would materially change a product, algorithm, architecture, validation, market, legal, or research decision.

## When to activate

Activate when at least one is true:

- the question has several plausible decompositions;
- information recall/coverage matters more than latency;
- prior searches disagree or appear incomplete;
- the decision is high-stakes;
- a novelty claim depends on not missing close prior work;
- the user explicitly requests exhaustive/deep research.

Skip for narrow facts, simple repository lookups, and tightly coupled tasks where independent agents cannot work without shared state.

## Phase 1 — Research contract

Define before spawning attempts:

- decision/question;
- required subquestions;
- evidence-quality rules;
- current-date/recency window;
- what would falsify the leading hypothesis;
- maximum rollout budget;
- stopping rule.

## Phase 2 — Independent rollouts

Run **2–4 independent attempts** for normal high-stakes work. Expand to more only when the marginal coverage gain justifies the cost.

Independence requirements:

- each rollout gets the same objective but a deliberately different search/decomposition strategy;
- do not reveal other rollout conclusions before the rollout finishes;
- vary search vocabulary, starting sources, perspective, or evidence lane;
- every rollout must preserve citations and unresolved contradictions.

Suggested diversity:

1. **Primary-source-first** — papers, standards, official docs, source code, filings;
2. **Landscape/coverage-first** — broad taxonomy and competing approaches;
3. **Contrarian/failure-first** — negative results, criticism, known-bad cases, limitations;
4. **Implementation/empirical-first** — repositories, benchmarks, datasets, reproducibility evidence.

If the runtime has no subagent support, run these as serial independent passes. Before each pass, restate the research contract and do not use the previous pass as evidence.

## Phase 3 — Coverage map

Before merging prose, compare what each rollout actually found.

```markdown
| Evidence item / subquestion | R1 | R2 | R3 | R4 | Conflict? | Needs re-search? |
|---|---|---|---|---|---|---|
```

Mark:

- unique evidence found by only one rollout;
- independent corroboration;
- direct contradictions;
- missing acceptance-rubric items.

## Phase 4 — Pairwise evidence-preserving merge

Merge two reports at a time rather than stuffing all reports into one context when reports are long.

Each merge must:

1. preserve unique factual evidence from both inputs;
2. deduplicate true overlap;
3. retain source links/provenance;
4. preserve unresolved conflicts as conflicts;
5. separate evidence from interpretation;
6. never discard a fact merely for stylistic brevity.

When four candidates exist, prefer `(R1 + R2) -> M1`, `(R3 + R4) -> M2`, then `(M1 + M2) -> Mfinal`.

## Phase 5 — Independent verifier veto

The merger does **not** decide truth by majority vote.

For every materially different candidate conclusion or load-bearing merged claim:

1. send the claim to the `fact-check` skill;
2. independently re-open/re-search the relevant evidence;
3. veto contradicted candidates;
4. mark unresolved candidates `UNCERTAIN`;
5. aggregate only among verified survivors.

A popular wrong answer is still wrong.

## Phase 6 — Gap-driven follow-up

After merging and verification, search only the remaining gaps:

- rubric item with no evidence;
- unresolved contradiction;
- single-source load-bearing claim;
- outdated current-state claim;
- novelty question with insufficient closest-prior-work coverage.

Do not restart broad research unless the evidence map shows a whole missed area.

## Phase 7 — Stop rule

Stop when all are true:

1. every required subquestion has an evidence candidate;
2. load-bearing claims are verified or explicitly unresolved;
3. major contradictions were investigated;
4. the last 2–3 targeted searches add no material independent evidence;
5. remaining uncertainty is better resolved by an experiment, source owner, or user decision than by more browsing.

Never spend the entire token/search budget merely because it is available.

## Required output

```markdown
# Research Ensemble — <question>
Verified: YYYY-MM-DD
Rollouts: N

## Research contract
...

## Coverage map
...

## Unique findings by rollout
...

## Conflicts and verifier verdicts
...

## Merged evidence synthesis
...

## Residual gaps
...

## Stop-rule check
...

## Confidence
N/10 — include externally verified load-bearing claim tally.
```

## Persistence

- Durable ensemble synthesis: `docs/research/`.
- Rollout scratch files: `.research/ensemble/<slug>/` unless they contain unique evidence worth preserving.
- Fact-check ledger: `docs/research/audits/`.

## Provenance

Project-authored adapter informed by current public deep-research evidence:

- AI21 (2026-06-24): agglomerative pairwise merging of diverse weaker research reports improved DeepResearch Bench II information recall and reached the reported top score at publication time.
- AI21 (2026-08-19): independent verifier research can outperform plain majority voting because correct candidates may already exist in the pool but be outvoted by repeated wrong answers.
- OpenAI BrowseComp (2025): repeated independent samples plus aggregation improved accuracy over a single attempt.
- Anthropic multi-agent research engineering notes: independent research lanes help breadth-first tasks but add substantial token cost and are weaker for tightly coupled tasks.
