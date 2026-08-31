---
name: fact-check
description: Independent post-generation verification for research claims and citations. Use after a synthesis/report is drafted, and before decision-relevant research is accepted. Never treat generation and verification as the same pass.
license: MIT-compatible adapter; upstream skill declares MIT
metadata:
  version: "1.1-formpath"
  adapted-from: "jwynia/agent-skills fact-check v1.0"
  category: research-verification
---

# FormPath Fact Check

This skill is a **separate verification stage**. Its job is not to improve prose. Its job is to try to falsify the research output against external evidence.

## Core rule

Do not verify a claim from memory, from the research summary itself, or from a search-result snippet. Re-open the underlying source or artifact. If the source cannot be inspected, mark the claim unverified.

## Inputs

- draft research synthesis/report;
- evidence ledger and citations/URLs;
- experiment artifacts when claims depend on measured results;
- exact date of verification.

## Phase 1 — Atomic claim extraction

Extract every decision-relevant verifiable claim. Split compound sentences when different parts require different evidence.

Classify each claim:

- `HARD_FACT`: number, date, version, name, quote, benchmark, price, legal status;
- `SOFT_FACT`: mechanism, process, generally established relationship;
- `ATTRIBUTION`: source/person is said to have stated or found something;
- `INFERENCE`: conclusion derived from several facts;
- `JUDGMENT`: recommendation or interpretation rather than an externally verifiable fact.

Prioritize **load-bearing claims**: if the claim changes the product, algorithm, architecture, experiment, legal position, market decision, or confidence rating, it must be checked.

## Phase 2 — Source audit

For every load-bearing claim:

1. open the exact cited source;
2. identify the smallest passage/table/figure/artifact that supports or refutes it;
3. verify scope, population/system, unit, date, version and qualifiers;
4. prefer primary/official evidence over summaries;
5. where feasible, seek an independent second source for non-trivial claims;
6. do not count mirrors, syndications or reposts as independent sources.

Statuses:

- `CONFIRMED` — the evidence directly supports the claim at the stated scope;
- `PARTIAL` — evidence supports only a narrower/weaker version;
- `CONTRADICTED` — inspected evidence conflicts with the claim;
- `UNVERIFIED` — adequate evidence was not found or could not be inspected;
- `OUTDATED` — historically supported but too old for the current claim;
- `INFERENCE_ONLY` — premises may be supported, but the conclusion is the agent's inference.

## Phase 3 — Independent candidate verification

When research used multiple independent rollouts, do **not** select an answer only because it is the majority view.

For each materially different candidate conclusion:

1. restate the candidate as a falsifiable claim;
2. perform a narrow independent re-search focused on that candidate;
3. issue `VALID`, `NOT_VALID`, or `UNCERTAIN`;
4. veto candidates contradicted by stronger evidence;
5. aggregate only among candidates that survive verification.

This verifier pass must not inherit an earlier rollout's reasoning as evidence.

## Phase 4 — Correction pass

After the ledger is complete:

- correct contradicted claims;
- narrow partially supported claims;
- add dates/version qualifiers to stale facts;
- label unresolved claims explicitly;
- lower the report confidence if a load-bearing conclusion remains unverified.

Never silently delete contradictory evidence just to make the report coherent.

## Required output

```markdown
# Fact Check — <research title>
Verified: YYYY-MM-DD

## Verdict
Overall reliability: High | Medium | Low | Unreliable
Load-bearing claims externally checked: N / M

## Claim ledger
| ID | Claim | Type | Status | Primary evidence | Independent support | Correction / note |
|---|---|---|---|---|---|---|

## Contradictions
...

## Corrections applied
...

## Residual uncertainty
...
```

## Persistence

- Decision-relevant audits: `docs/research/audits/<date>-<slug>-fact-check.md`.
- Temporary exploratory audits may remain under `.research/`.
- Do not overwrite the source research artifact; preserve the audit trail.

## Failure conditions

A fact-check is incomplete if any of these are true:

- generation and verification happened as one blended pass;
- a load-bearing claim was checked only against model memory;
- a citation was accepted because the URL exists without checking support;
- conflicting sources were hidden;
- unchecked claims are presented as verified.

## Provenance

Adapted for FormPath from `jwynia/agent-skills` → `skills/general/research/verification/fact-check/SKILL.md` (upstream metadata version 1.0, license declared MIT), with additional verifier-veto and project evidence-ledger rules derived from the 2026 deep-research meta-study.
