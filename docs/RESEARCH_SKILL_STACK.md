# FormPath Research Skill Stack

Last reviewed: 2026-08-31

These are project-local Agent Skills under `.agents/skills/`. They are research/development instructions only and are never Expo runtime dependencies.

The operating standard is `docs/DEEP_RESEARCH_PROTOCOL_V2.md`.

## Routing

| Intent | Primary skill | Compose with |
| --- | --- | --- |
| Current technical question, compare methods/tools, investigate a claim | `research` | `fact-check`; `deep-dive` when high-stakes |
| Thorough audit / comprehensive investigation / algorithm or strategy validation | `deep-dive` | `research`, `fact-check`, `experimental-design`, Graphify for codebase structure |
| Coverage-sensitive/high-stakes question where one search trajectory may miss evidence | `research-ensemble` | `research`, `fact-check`, `deep-dive` when specialist lanes are also useful |
| Post-generation claim/citation verification | `fact-check` | any decision-relevant research output |
| Novel algorithm/method/contribution claim or research-plan review | `research-novelty-review` | `literature-review`, `fact-check`, `experimental-design` |
| Systematic/scoping/rapid paper survey | `literature-review` | `citation-management`, `fact-check`, `scientific-writing` |
| DOI/source verification, bibliography, reference metadata | `citation-management` | any research skill |
| Benchmark, ablation, capture protocol, validation experiment | `experimental-design` | `reproducible-research`, `research-novelty-review` for contribution claims |
| Repeatable algorithm/experiment pipeline and run provenance | `reproducible-research` | `experimental-design` |
| Technical report / manuscript-style research write-up | `scientific-writing` | `citation-management`, `fact-check`, `reproducible-research` |
| Market, competitor, pricing, GTM, demand, trend, due diligence | `deep-market-research` | `research`, `research-ensemble`, `fact-check` for major decisions |

## Protocol v2 composition

For substantial research, the preferred sequence is:

1. research contract;
2. broad landscape discovery;
3. evidence-target decomposition;
4. evidence ledger;
5. gap-driven searches;
6. `research-ensemble` only when path-dependency/coverage risk justifies independent complete attempts;
7. pairwise evidence-preserving merge for long independent reports;
8. independent `fact-check` / verifier veto;
9. contrarian pass;
10. `research-novelty-review` for new algorithm/method claims;
11. decision synthesis from verified evidence;
12. handoff to `experimental-design` when a falsifying experiment has more value than further browsing.

More searching is not automatically deeper research. Explicit stop conditions are required.

## Research storage policy

- `docs/research/` is the durable, reviewable, committed knowledge base for validated findings worth carrying forward with the project.
- `docs/research/audits/` stores independent fact/citation verification ledgers.
- `docs/research/reviews/` stores novelty and reviewer-simulation gates.
- `.research/` is local scratch/cache for retrieval indexes, raw notes, or rollout artifacts and remains untracked.
- A durable research entry should state: research question, date verified, scope, sources, findings, strongest objection, confidence, unresolved questions, and next falsifiable test.
- Decision-relevant experimental numbers should additionally link to exact code commit/config/run provenance where available.

## Cross-skill rules

1. Source discovery, synthesis and verification are separate stages.
2. Search-result snippets are leads, not evidence.
3. Primary evidence outranks summaries and marketing. Mirrors do not count as independent sources.
4. Load-bearing non-trivial claims should normally have independent corroboration where feasible or be labeled single-sourced/unverified.
5. A working citation URL is not sufficient; the exact source must support the exact claim.
6. Every substantial investigation gets a contrarian/failure-mode pass.
7. Current claims use current evidence and explicit dates/versions.
8. Preserve disagreement and null/negative results; do not force consensus.
9. Independent research rollouts are useful for coverage but must remain independent until merge.
10. Pairwise/hierarchical merge should preserve unique evidence and explicit conflicts rather than optimizing only for concise prose.
11. Majority/plurality is not a truth criterion; candidate conclusions can be vetoed by independent verification.
12. Research that guides implementation ends with a concrete falsifiable next test.
13. Novelty claims require closest-prior-work inspection and a distinguishable evaluation plan.
14. Stop when the marginal information value of another search is lower than a direct experiment, source inquiry, or stakeholder/product test.

## Benchmarking

`docs/research/DEEP_RESEARCH_BENCHMARK_V1.md` defines ten FormPath-specific test questions and three workflow configurations:

- A: baseline research;
- B: baseline + independent fact check;
- C: Protocol v2 with ensemble/merge/verification/novelty gate where applicable.

Promotion depends on information coverage, exact claim support and decision usefulness, not response length.

## Upstream provenance

### Research

Adapted from `hec-ovi/research-skill`, latest published release verified as **v0.2.7**. Upstream is MIT licensed.

Copyright (c) 2026 Hector Oviedo.

### Deep Dive

Adapted from `nelsonwerd/deep-dive-skill`. Upstream documents direct Claude and OpenAI Codex support and a multi-lane → synthesis → verification → red-team → briefing method. MIT licensed.

Copyright (c) 2026 Drew Nelson.

### Fact Check

`.agents/skills/fact-check/` is adapted from `jwynia/agent-skills` → `skills/general/research/verification/fact-check/SKILL.md`, whose metadata declares MIT and version 1.0. FormPath adds candidate-verifier veto, atomic evidence-ledger states and project persistence rules.

### Research Novelty Review

`.agents/skills/research-novelty-review/` is adapted from `ngtiendong/Academic-Research-Agent-Skill` (MIT; copyright 2026 Research Agent Skill contributors). Upstream concepts used include the novelty gate, Research Reality Gate, feasibility pilot and three-perspective reviewer simulation.

### Research Ensemble

`.agents/skills/research-ensemble/` is project-authored from the deep-research meta-study rather than copied from one upstream skill. Methodological evidence includes:

- AI21, 2026-06-24: pairwise/agglomerative merging of diverse research reports to improve DeepResearch Bench II coverage;
- AI21, 2026-08-19: independent verifier research can outperform majority voting for agentic search candidate selection;
- OpenAI BrowseComp: independent samples plus aggregation improved performance over a single attempt;
- Anthropic multi-agent research engineering: independent lanes help breadth-first tasks but increase token cost and are weaker for tightly coupled tasks.

### SciAgent Skills

`literature-review`, `citation-management`, `experimental-design`, `reproducible-research`, and `scientific-writing` are adapted from `Pratikrishi97/sciagent-skills` v1.0.0 skill definitions. The upstream repository describes 40 open Agent Skills for science and engineering and is MIT licensed.

Copyright (c) 2025 Scientific Agent Skills Contributors.

### Deep Market Research

Adapted from `Rain3Dmetrology/deep-market-research` **v2.8.0**. MIT licensed.

Copyright (c) 2026 SOTA Research Workflow Contributors.

## Upstream sources

- https://github.com/hec-ovi/research-skill
- https://github.com/nelsonwerd/deep-dive-skill
- https://github.com/jwynia/agent-skills
- https://github.com/ngtiendong/Academic-Research-Agent-Skill
- https://github.com/Pratikrishi97/sciagent-skills
- https://github.com/Rain3Dmetrology/deep-market-research
- https://www.ai21.com/blog/merging-weak-agents-into-a-state-of-the-art-deep-researcher/
- https://www.ai21.com/blog/you-need-a-verifier/
- https://openai.com/index/browsecomp/
- https://www.anthropic.com/engineering/multi-agent-research-system
