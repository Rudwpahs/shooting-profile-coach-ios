# FormPath Deep Research Protocol v2

Last reviewed: 2026-08-31

This protocol is the default workflow for research that may change FormPath algorithms, architecture, validation, product strategy, legal assumptions, or market decisions.

It implements `docs/research/2026-08-31-deep-research-meta-study.md`.

## Core loop

**Research Contract → Landscape Search → Decomposition → Evidence Ledger → Gap-Driven Search → Independent Rollouts when justified → Pairwise Merge → Independent Verifier → Claim/Citation Audit → Contrarian + Reviewer Gate → Decision Synthesis → Falsifiable Next Test → Durable Storage**

## Mode selection

### Quick
- one research lane;
- primary source preferred;
- light verification;
- no ensemble unless evidence conflicts.

### Standard
- 2–3 evidence lanes;
- explicit evidence ledger;
- contrarian pass;
- fact-check all load-bearing claims;
- novelty/reviewer gate when a new algorithm or method is proposed.

### Deep
- 3–6 specialist evidence lanes OR 2–4 independent rollouts, depending on task structure;
- pairwise evidence-preserving merge for multiple full reports;
- independent verifier veto;
- full atomic claim/citation audit;
- reviewer simulation / novelty gate where applicable;
- durable research package under `docs/research/`.

Extra lanes or rollouts require a distinct evidence target or independent trajectory.

## Stage 0 — Research Contract

Write before browsing:

```markdown
Question / decision:
Why it matters:
Current date / recency window:
Known constraints:
Required subquestions:
Acceptance criteria:
Evidence that would change the leading answer:
Evidence that would falsify the leading hypothesis:
Maximum research mode / rollout budget:
Stop conditions:
```

Pin exact dates for current facts and exact versions for software, products, standards, or models where possible.

## Stage 1 — Landscape Search

Start broad enough to learn:

- canonical terminology;
- major approach families;
- primary/official source locations;
- recent reviews and benchmarks;
- controversies and failure modes;
- datasets, repositories, implementations, and standards.

Do not overcommit to a detailed decomposition before this pass unless the field is already mapped.

## Stage 2 — Decomposition

Split the question into independently answerable evidence targets.

For FormPath algorithm research typical lanes include:

- mathematical identifiability;
- closest prior methods;
- empirical error under realistic capture conditions;
- computational/mobile constraints;
- validation protocol;
- failure modes;
- licensing/data availability.

Use `deep-dive` when independent specialist lanes are natural. Use `research-ensemble` when path dependency is the larger risk and different complete research attempts may uncover different evidence.

## Stage 3 — Evidence Ledger

Maintain a structured ledger:

```markdown
| ID | Subquestion | Atomic claim/evidence candidate | Source | Tier | Date/version | Independent support | Conflict | Status |
|---|---|---|---|---|---|---|---|---|
```

Statuses:

- `LEAD` — discovered but not inspected;
- `SUPPORTED` — source inspected and supports claim;
- `CORROBORATED` — independently supported;
- `CONFLICTED` — credible evidence disagrees;
- `UNVERIFIED` — insufficient evidence;
- `OUTDATED` — not adequate for a current claim.

Search-result snippets remain `LEAD` until the source is inspected.

## Stage 4 — Gap-Driven Search

After each evidence batch, search what remains missing or conflicting.

Priority:

1. missing load-bearing subquestion;
2. contradiction affecting the decision;
3. single-source critical claim;
4. current claim with stale evidence;
5. useful supporting context.

Trace decision-relevant facts to primary evidence where possible.

## Stage 5 — Independent Rollouts

Use `.agents/skills/research-ensemble/` when coverage risk is high.

Normal budget:

- 2 attempts: moderate uncertainty;
- 3 attempts: high-stakes or broad technical decision;
- 4 attempts: only when genuinely different trajectories exist.

Keep rollouts independent until completion and vary search strategy rather than just wording. Do not use majority vote as truth.

## Stage 6 — Pairwise Evidence Merge

When multiple full reports exist:

- merge pairwise or hierarchically;
- preserve unique facts and citations;
- deduplicate real overlap;
- preserve unresolved conflicts;
- separate evidence from interpretation;
- do not discard evidence merely for stylistic brevity.

The merged report is provisional until verified.

## Stage 7 — Independent Verifier Veto

Run `.agents/skills/fact-check/` separately from generation.

For materially different candidate conclusions and every load-bearing merged claim:

- independently re-open or re-search the evidence;
- issue `VALID / NOT_VALID / UNCERTAIN` for candidate conclusions;
- issue `CONFIRMED / PARTIAL / CONTRADICTED / UNVERIFIED / OUTDATED / INFERENCE_ONLY` for report claims;
- remove contradicted candidates even if they are the plurality result.

## Stage 8 — Atomic Claim/Citation Audit

Check exact claim-to-source support, including:

- number and unit;
- date and version;
- population/system/context;
- causal versus correlational wording;
- benchmark comparability;
- quotation/attribution accuracy;
- whether the citation supports the whole claim or only part.

Apply corrections after the claim ledger exposes the full pattern of issues.

## Stage 9 — Contrarian + Novelty/Reviewer Gate

Every substantial research run gets a failure-mode/contrarian pass.

For algorithm or method proposals also run `.agents/skills/research-novelty-review/`:

- closest prior work;
- atomic novelty map;
- falsifiability;
- minimum feasibility pilot;
- supportive reviewer;
- skeptical reviewer;
- methods reviewer.

A novelty `FAIL` means the project must not claim scientific novelty yet. It does not automatically block a useful product implementation.

## Stage 10 — Decision Synthesis

Write from the verified evidence ledger, not from memory of the browsing trajectory.

Separate:

1. externally supported facts;
2. project measurements;
3. inference;
4. judgment/recommendation;
5. unresolved uncertainty.

A confidence number includes a ground-truth tally:

`N of M load-bearing conclusions are externally verified; K remain inference or uncertain.`

## Stage 11 — Stop Rule

Stop exploration when all applicable conditions are met:

1. required subquestions have evidence candidates;
2. load-bearing conclusions are verified or explicitly unresolved;
3. known contradictions were investigated;
4. the last 2–3 targeted searches add no material independent evidence;
5. the next useful information is more likely to come from an experiment, direct source inquiry, stakeholder input, or product test than from more browsing.

If an experiment is the better next step, hand off to `experimental-design` and `reproducible-research`.

## Stage 12 — Durable Storage

Use:

- `docs/research/` — durable validated research;
- `docs/research/audits/` — fact/citation audits;
- `docs/research/reviews/` — novelty/reviewer gates;
- `.research/` — temporary raw notes, rollout scratch, retrieval cache.

A durable entry states the question, scope, verification date, evidence, strongest objection, conflicts, confidence, ground-truth tally, unresolved questions, and next falsifiable test.

## Skill routing

| Need | Skill |
|---|---|
| default multi-source investigation | `research` |
| multi-lane thorough audit | `deep-dive` |
| independent attempts + merge | `research-ensemble` |
| systematic paper survey | `literature-review` |
| DOI/source metadata | `citation-management` |
| independent post-generation verification | `fact-check` |
| novelty + reviewer simulation | `research-novelty-review` |
| experiment design | `experimental-design` |
| run provenance/reproducibility | `reproducible-research` |
| technical write-up | `scientific-writing` |
| market/competitor/GTM research | `deep-market-research` |
