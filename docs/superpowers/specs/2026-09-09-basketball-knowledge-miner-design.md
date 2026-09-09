# Basketball Knowledge Miner — Design Specification

Date: 2026-09-09 (Asia/Seoul)
Status: Approved in-chat architecture; implementation not yet started
Project: Hooper's Hub / FormPath
Parent repo: `Rudwpahs/shooting-profile-coach-ios`
Design branch: `design/basketball-knowledge-miner`

## 1. Purpose

Build a zero-incremental-cloud-spend knowledge acquisition subsystem that continuously discovers new basketball research and high-quality coaching material, converts it into auditable FormPath candidate knowledge, and feeds only validated candidates into the private Hooper's Hub corpus workflow.

The system behaves like a knowledge miner: scheduled GitHub-hosted virtual machines repeatedly scan approved sources, remember progress, discard duplicates/noise, and accumulate useful evidence without requiring the user's Windows PC to remain powered on.

The miner never writes directly into the canonical FormPath corpus. It creates candidates only. A separate daily GPT distillation step classifies those candidates. Accepted items can reach the canonical corpus only through `ACCEPTED-STAGING`, automated CI, a Draft PR, and manual final merge.

## 2. Non-goals

V1 does not:

- crawl Reddit, generic social media, forums, or unrestricted web search;
- download or permanently store copyrighted full articles, full transcripts, or raw video;
- train or fine-tune the Coach model;
- modify frozen Coach V1 contracts;
- alter Representative 4D or PR #4 validation code;
- auto-merge knowledge into the canonical FormPath corpus;
- treat source prestige as proof of scientific strength;
- guarantee that GitHub's public-runner pricing or external API quotas remain free forever.

## 3. Cost target

Target: **$0 incremental cloud spend under current free GitHub-hosted runner and source-API policies**.

The design avoids paid VM instances, paid search APIs, persistent hosted databases, GPU workers, and commercial vector databases. If GitHub or an upstream source changes its free-use policy, the miner must fail closed or reduce work rather than silently incur paid usage. No billing-enabled cloud dependency is required for V1.

## 4. Repository boundary

### Public repository

Planned repository: `Rudwpahs/basketball-knowledge-miner`

Contains only collection code, source adapter configuration, non-private schemas, source cursor/checkpoint state, rolling hashes/IDs for dedupe, tests, GitHub Actions workflows, and public source allowlists.

It must not contain private FormPath research-unit text, private candidate claims, private Coach data, or private application code.

### Private repository

Existing repository: `Rudwpahs/shooting-profile-coach-ios`

Proposed private ingestion layout:

```text
ml/coach/miner-data/
├── inbox/
├── review/
├── rejected/
├── accepted-staging/
├── reports/
└── provenance/
```

The current RU-0061..RU-1000 knowledge machine remains untouched during discovery and daily classification.

## 5. Source policy — Option B

V1 collects from two source families.

### B1. Academic and official

Preferred sources include Crossref, PubMed/NCBI, Semantic Scholar when available within free limits, FIBA, NCAA, USA Basketball, and other directly relevant governing-body or institutional sources added to an allowlist.

Prefer APIs, RSS/Atom, sitemaps, and stable metadata endpoints. HTML crawling is used only when allowed and necessary.

### B2. High-quality coaching and direct expert material

Use an explicit allowlist of reputable coaching education sites, coach-authored articles, known basketball education channels, direct elite-coach interviews, and player interviews containing meaningful training, decision-making, tactical, or shooting information.

For YouTube V1, prefer channel RSS/metadata and stable public-page metadata rather than unrestricted search scraping. Never download full video files. Do not permanently copy full transcripts.

### Excluded in V1

Reddit, X/Twitter, TikTok, Instagram scraping, generic forums, anonymous coaching blogs without an allowlist, and arbitrary web-search-result scraping are excluded. A future low-trust discovery layer may handle them, but it must never inherit the academic/official automatic-staging policy.

## 6. Schedule and work budget

The public miner runs every three hours using an off-peak minute, conceptually:

```yaml
cron: "17 */3 * * *"
```

That is eight scheduled runs per day. GitHub cron timing is not assumed to be exact to the minute.

Each run has a hard maximum of **500 inspected source records total**. Each adapter also has its own rate limit, per-run cap, timeout, retry budget, and backoff policy.

The 500-record cap means records inspected, not records accepted. Only new and relevant candidates are exported to the private repo.

## 7. Persistent public state

Public state is kept on a dedicated `miner-state` branch rather than mixed with product/source-code history on the default branch. The branch contains only latest checkpoint state such as:

```text
state/
├── crossref.json
├── pubmed.json
├── semantic_scholar.json
├── fiba.json
├── ncaa.json
├── usa_basketball.json
├── youtube.json
└── seen_hashes.jsonl
```

Allowed fields include `last_checked_at`, cursor/page token, last processed stable source ID, canonical URL hash, DOI/PMID/source-ID hash, and rolling dedupe hashes.

The public state branch must not contain FormPath claim text or private application data. V1 may use a rolling dedupe window to prevent unbounded growth. Private-side dedupe is authoritative, so expiration of an old public hash can cause redundant rediscovery but cannot corrupt the canonical corpus.

## 8. Candidate data model

Every candidate receives a stable content-derived ID such as `CAND-<sha256-prefix>`.

A candidate contains only what downstream audit/distillation needs: canonical source URL; DOI/PMID/other stable ID when available; title; authors/organization; publication/upload date; source type; source adapter; discovery timestamp; FormPath-aligned topic codes; relevance signals; canonical URL/source hash; provenance status; a short permitted summary/paraphrase; optional timestamp references for video/interview material; and extraction warnings/limitations.

The miner **does not assign the final FormPath evidence grade**. Source class and evidence strength remain separate concepts.

## 9. Copyright/content policy

The miner is an indexing and evidence-extraction system, not an archival mirror.

Default policy:

- store identifiers, metadata, URLs, hashes, and structured paraphrases;
- do not commit complete paywalled articles;
- do not commit full video transcripts;
- do not mirror complete coaching articles merely because they are public;
- keep any quoted audit excerpt short and source-linked;
- preserve enough provenance to reopen the original source during review.

If useful analysis would require reproducing substantial copyrighted text, store metadata plus a review pointer instead of the source content.

## 10. Three-hour miner pipeline

```text
DISCOVER
  ↓
NORMALIZE
  ↓
CANONICALIZE IDENTIFIERS/URL
  ↓
DEDUPE
  ↓
BASKETBALL RELEVANCE FILTER
  ↓
SOURCE/POLICY CHECK
  ↓
PRIVATE EXPORT
  ↓
CHECKPOINT UPDATE
```

Discovery adapters return normalized source records without making evidence claims. Normalization canonicalizes URLs, DOI/PMID IDs, names, dates, title whitespace, and source identifiers. Deduplication prefers stable IDs, then canonical URL, then conservative title/author/year fingerprints; fuzzy similarity may flag a review candidate but cannot automatically merge distinct scientific records.

The relevance filter asks only whether a source plausibly belongs in the basketball knowledge pool. It must not judge scientific correctness. Topic mapping should align where possible with current FormPath domains such as SHOOTING, BIOMECHANICS, DECISION, PERCEPTION_GAZE, FATIGUE, MOTOR_LEARNING, FOOTWORK, DEFENSE, PNR_TACTICS, SPACING_OFFBALL, YOUTH, POSE_VALIDATION, and COACHING_METHOD.

Only new relevance-passed candidates are exported. The public runner does not copy all 500 inspected records into the private repo.

## 11. Security model

The public repository is treated as untrusted relative to the private Hooper's Hub repository.

Required controls:

- private-repo credentials exist only as GitHub Actions secrets;
- use the narrowest available token/repository permission;
- never print credentials, authenticated URLs, or private candidate payloads to public logs;
- never use `pull_request_target` to execute untrusted contributor code with secrets;
- fork/external PR workflows receive no private export credentials;
- scheduled export executes only workflow code already present on the protected/default public branch;
- third-party Actions are minimized and pinned to immutable commit SHAs where practical;
- normal test/discovery jobs use job-level `contents: read` permissions;
- any job that updates the dedicated public state branch gets only the minimum job-level public-repo write permission needed for state;
- private export uses a separate credential path from public state updates;
- malformed candidate batches fail validation before private write;
- the private ingestion path is segregated from canonical corpus files.

GitHub Actions permissions are granted at workflow/job scope, not per step; implementation must not rely on fictional step-level permission isolation.

If a safe private export credential cannot be configured, discovery/testing may continue but export must report `blocked`. The system must never broaden credentials or expose private data merely to keep mining alive.

## 12. Daily GPT distillation

A ChatGPT scheduled task runs once per day, after the day's miner cycles in normal operation. The currently created reservation is a **pre-implementation/report-only preflight**: until the candidate pool exists, it is expected to report that distillation is blocked rather than invent results.

After the miner/private-ingestion implementation is verified, the scheduled task prompt is upgraded to the write-enabled distillation workflow defined here. That upgrade is an implementation step and must not be claimed before it occurs.

The distiller processes only candidates accumulated since its previous successful checkpoint.

```text
PRIVATE INBOX
   ↓
DAILY GPT DISTILLATION
   ↓
DUPLICATE | REJECTED | REVIEW | ACCEPTED-STAGING
```

The distiller must deduplicate against canonical and pending knowledge; inspect source metadata/provenance; distinguish source type from evidence strength; preserve contradictions; detect forbidden/unsupported inference; preserve relevant context such as shot type, level, fatigue, defender presence, handedness, and capture limitations; use cautious language for proxy/observational evidence; never invent DOI/title/author/URL/timestamp/evidence linkage; never recover RU-0001..RU-0060; and never alter frozen Coach V1 contracts.

## 13. Option B acceptance policy

The daily distiller emits four states.

### DUPLICATE

Already represented by a canonical RU/source or another pending candidate.

### REJECTED

Use for non-basketball/no-transfer material, low-information SEO content, unverifiable source identity, promotional claims without useful evidence, material that cannot support a distinct auditable unit, or unsafe/misleading inference that cannot be reframed into a supported observation.

### REVIEW

Default for coaching videos/interviews requiring interpretation, player anecdotes, conflicting claims, weak provenance, unclear evidence level, strongly context-dependent conclusions, or claims that cannot be checked from accessible material.

### ACCEPTED-STAGING

Automatic staging is allowed only when all required gates pass. Typical high-trust candidates are traceable peer-reviewed or official sources with stable provenance, a distinct basketball-relevant claim, inspectable support, explicit limitations, and no forbidden inference.

`ACCEPTED-STAGING` means eligible for a Draft PR. It does not mean scientifically proven and does not mean already canonical.

Coaching/interview material may reach ACCEPTED-STAGING only when framed as direct expert guidance/experience rather than falsely upgraded into experimental evidence.

## 14. Evidence/provenance compatibility

New knowledge must map into the existing FormPath machine ontology and B2-A.1 compatibility layer instead of creating a parallel evidence taxonomy.

The miner records source class. The distiller proposes the existing corpus evidence grade under the repository rubric. B2-A.1 remains the compatibility gate into frozen `CoachEvidenceItemV1` tiers.

Rules:

- prestige does not raise evidence strength by itself;
- official guidance may be authoritative guidance without being experimental causal evidence;
- elite coach/player material is direct expert evidence, not randomized evidence;
- ROW_ONLY must not be presented as a verified citation;
- new mined knowledge should normally be LINKED because provenance is captured at discovery time;
- confidence caps can only lower confidence.

## 15. Canonical RU promotion

The canonical corpus currently spans RU-0061..RU-1000. RU-0001..RU-0060 remain permanently discarded by owner instruction.

Staging uses `CAND-*` IDs. GPT acceptance alone never allocates a canonical RU number.

When a Draft PR is generated, a deterministic promotion tool proposes sequential RU IDs after the current canonical maximum. CI reads the canonical base and rejects duplicate/conflicting IDs.

V1 uses a **single-active-distillation-PR policy** to prevent two daily PRs from claiming the same next RU range. If an earlier distillation PR is still open, the next run appends new accepted candidates to that existing staging branch/PR or reports promotion waiting for review. It does not create a second colliding canonical promotion.

## 16. Automatic Draft PR

After implementation, daily distillation may create/update one Draft PR in the private repository, with a branch such as `miner/distill-YYYY-MM-DD`.

The PR includes an audit summary such as:

```text
Inspected today:          2,841
New relevant candidates:   137
Duplicates:                 89
Rejected:                   26
Review:                     14
Accepted-staging:            8
Proposed new RUs:             8
Linked provenance:          8/8
Canonical collisions:         0
```

These numbers are examples only. Runtime reports must use measured values and must never fabricate collection statistics.

The PR contains staged/accepted knowledge plus required provenance/manifest changes, not every discarded discovery.

## 17. CI gates before canonical merge

A distillation PR is not merge-ready unless automated checks verify:

- canonical RU continuity/collision rules;
- exact schema validity;
- no RU-0001..RU-0060 recreation;
- source URL/identifier syntax and provenance fields;
- evidence-code compatibility through B2-A.1;
- duplicate detection against canonical and staging data;
- controlled-vocabulary validity or explicitly allowed sentinel handling;
- forbidden-inference checks for actual metric 3D, force, torque, muscle activation, and other unsupported observations;
- retrieval regression;
- B2-B.2 retrieval-evaluation regression;
- corpus validator;
- deterministic generation of proposed machine artifacts;
- no frozen Coach contract change;
- no unrelated UI/Firebase/MotionPacket/private-app change.

A failed gate returns the affected item/PR to REVIEW. Tests are not weakened to force a pass.

## 18. Human control boundary

There is no automatic merge in V1.

```text
Internet → Candidate → GPT decision → ACCEPTED-STAGING → CI → Draft PR
```

Final canonical merge remains manual. This is the principal safety valve against long-term knowledge-base contamination.

## 19. Daily report

Each distillation reports total candidates since the previous run, counts by source family, duplicates, rejected, review, accepted-staging, provenance coverage, the most important proposed knowledge units, contradiction alerts, processing failures/unavailable sources, Draft PR status, and CI status.

If no candidate pool is accessible, the report must say so and must not invent numbers.

## 20. Failure handling

### Upstream outage

Use bounded exponential backoff. After retry exhaustion, continue other adapters and leave the failed source cursor unchanged.

### Rate limiting

Respect `Retry-After` when provided and stop that adapter for the run when necessary. Never evade limits with proxy rotation or identity evasion.

### robots/terms restriction

Skip restricted HTML collection and use only available metadata routes.

### Private export unavailable

Do not mark the batch exported. Keep only the minimum non-sensitive retry/checkpoint state needed for rediscovery and avoid public payload logging.

### GPT distillation unavailable

Leave inbox candidates untouched and process them on the next successful run.

### CI failure

Do not auto-merge or suppress the failing gate. Surface the failure in the report/PR.

## 21. Testing strategy

### Public miner

Test source-adapter fixtures, deterministic URL/identifier normalization, cursor/checkpoint behavior, exact 500-record hard cap, per-source rate-limit handling, duplicate fingerprints, relevance fixtures including hard negatives, secret/log redaction, malformed upstream data, and the private-export contract using a fake sink.

Live-network integration tests are separate from deterministic unit tests so routine CI does not depend on current internet behavior.

### Private ingestion/distillation

Test candidate schema validation, canonical duplicate checks, deterministic evidence/provenance mapping, acceptance-policy fixtures, contradiction preservation, no invented provenance, sequential RU promotion/collisions, single-active-PR policy, and existing corpus/B2-A.1/B2-B.1/B2-B.2 regressions.

### Security

Verify fork/PR events cannot invoke private export with credentials and public logs do not contain token-like values or configured private payload fields.

## 22. Observability

Public run logs expose non-sensitive counters only: fetched per adapter, inspected, duplicate, relevance-pass, exported, rate-limited, adapter errors, and elapsed time. Raw private claims/full candidate payloads are not printed to public Actions logs.

## 23. V1 success criteria

V1 is successful when:

1. the public GitHub Action operates on the three-hour schedule without a paid cloud dependency;
2. no run inspects more than 500 records;
3. at least one academic/official adapter and one coaching/direct-expert adapter work end-to-end;
4. dedupe results are stable across repeated runs;
5. private export works without exposing private candidate text/credentials in public logs;
6. daily distillation produces deterministic policy outcomes for fixtures;
7. high-trust accepted candidates preserve provenance and map through existing FormPath compatibility;
8. a Draft PR can be generated/updated without changing frozen Coach contracts;
9. canonical FormPath remains unchanged until manual merge;
10. B2-A.1, B2-B.1, and B2-B.2 remain green.

## 24. Implementation decomposition

1. Public miner core and schemas.
2. Academic/official adapters.
3. Coaching/RSS/direct-expert adapters.
4. Normalization, dedupe, checkpoint, relevance filter.
5. Secure private export contract.
6. Private inbox/candidate schema.
7. Deterministic distillation support and acceptance-policy fixtures.
8. Upgrade scheduled GPT task from preflight to live distillation.
9. Accepted-staging → canonical promotion tool.
10. Automatic Draft PR generation and CI gates.
11. End-to-end dry run and security audit.

Implementation follows TDD where applicable and does not begin until this written design is reviewed and approved by the user.

## 25. Deferred extensions

Not part of V1: Reddit/community low-trust discovery; embedding/vector candidate dedupe; citation-graph snowballing; source-frequency-driven provenance repair of old RU-0061..1000; automated contradiction clusters; multilingual discovery; model-assisted source prioritization; automatic held-out Coach scenario generation from newly accepted units; or paid/cloud scaling.

## 26. Self-review result

Self-review completed before implementation planning:

- no `TBD`/`TODO` placeholders remain;
- the cost goal is explicitly a current-policy target, not a forever-free guarantee;
- public state writes are isolated to a dedicated branch and permissions are correctly described at job/workflow scope rather than step scope;
- the already-created daily ChatGPT reservation is explicitly distinguished from the future write-enabled distillation workflow;
- automatic staging, Draft PR creation, and manual merge boundaries are consistent;
- canonical RU allocation has a single-active-PR collision policy;
- no part of the design bypasses the existing FormPath evidence compatibility layer or PR #4 physical-iPhone gate.
