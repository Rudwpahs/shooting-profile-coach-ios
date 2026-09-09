# Basketball Knowledge Miner — Design Specification

Date: 2026-09-09 (Asia/Seoul)
Status: Approved in-chat architecture; implementation not yet started
Project: Hooper's Hub / FormPath
Parent repo: `Rudwpahs/shooting-profile-coach-ios`
Design branch: `design/basketball-knowledge-miner`

## 1. Purpose

Build a zero-incremental-cloud-spend knowledge acquisition subsystem that continuously discovers new basketball research and high-quality coaching material, converts it into auditable FormPath candidate knowledge, and feeds only validated candidates into the private Hooper's Hub corpus workflow.

The system is designed to behave like a "knowledge miner": scheduled virtual machines repeatedly scan allowed sources, remember progress, discard duplicates and noise, and accumulate useful evidence without requiring the user's Windows PC to remain powered on.

The miner is not allowed to write directly into the canonical FormPath corpus. It only creates candidates. A separate daily GPT distillation step classifies those candidates, and accepted items enter the canonical corpus only through a Draft PR and manual final merge.

## 2. Non-goals

V1 does not:

- crawl Reddit, generic social media, forums, or unrestricted web search;
- download or permanently store copyrighted full articles, full transcripts, or raw video;
- train or fine-tune the Coach model;
- modify frozen Coach V1 contracts;
- alter Representative 4D or PR #4 validation code;
- auto-merge knowledge into the canonical FormPath corpus;
- claim that a source is scientifically strong merely because it is famous, official, or produced by an elite coach;
- guarantee that GitHub's public-runner pricing or external API quotas remain free forever.

## 3. Cost target

Target: **$0 incremental cloud spend under current free GitHub-hosted runner and source-API policies**.

The design therefore avoids paid VM instances, paid search APIs, persistent hosted databases, GPU workers, and commercial vector databases.

If GitHub or any upstream source changes its free-use policy, the miner must fail closed or reduce frequency rather than silently incur paid usage. No billing-enabled cloud dependency is required for V1.

## 4. Repository boundary

### Public repository

Planned repository: `Rudwpahs/basketball-knowledge-miner`

Contains only:

- collection code;
- source adapter configuration;
- schemas that contain no private FormPath knowledge;
- source cursor/checkpoint state;
- rolling hashes/IDs required for deduplication;
- tests and GitHub Actions workflows;
- public allowlists for official/coaching sources.

It must not contain the private candidate corpus, FormPath research-unit text, private Coach data, or private application code.

### Private repository

Existing repository: `Rudwpahs/shooting-profile-coach-ios`

Private ingestion area is logically separated from the canonical 940-unit knowledge machine. Proposed layout:

```text
ml/coach/miner-data/
├── inbox/
├── review/
├── rejected/
├── accepted-staging/
├── reports/
└── provenance/
```

The existing RU-0061..RU-1000 corpus remains immutable during collection and distillation.

## 5. Source policy — Option B

V1 collects from two evidence families.

### B1. Academic and official sources

Preferred sources include:

- Crossref metadata;
- PubMed / NCBI metadata;
- Semantic Scholar when available within free limits;
- FIBA official material;
- NCAA official material;
- USA Basketball official material;
- other directly relevant governing-body or institutional basketball material added to an allowlist.

The miner prefers APIs, RSS/Atom feeds, sitemaps, and stable metadata endpoints. HTML crawling is used only when allowed and necessary.

### B2. High-quality coaching and direct expert material

Includes an explicit allowlist of:

- reputable basketball coaching education sites;
- coach-authored articles;
- known basketball education channels;
- direct elite coach interviews;
- player interviews when the material contains meaningful training, decision-making, tactical, or shooting information.

For YouTube V1, prefer channel RSS/metadata and stable public page metadata rather than unrestricted search scraping. Full video files are never downloaded by the miner. Full transcripts are not permanently copied into the corpus.

### Excluded in V1

- Reddit;
- X/Twitter;
- TikTok;
- Instagram scraping;
- generic forums;
- anonymous coaching blogs without an explicit allowlist;
- arbitrary web-search result scraping.

These may later exist as a separate low-trust discovery layer but must never share the same automatic acceptance policy as academic/official sources.

## 6. Scheduling and work budget

The public GitHub Actions miner runs every three hours using an off-peak minute, conceptually:

```yaml
cron: "17 */3 * * *"
```

This produces eight scheduled runs per day.

Each run has a hard maximum of **500 inspected candidate records** across all sources. Source adapters also impose independent rate limits, retry limits, timeouts, and per-source caps.

The 500-record budget means "records inspected", not "items accepted". A run may inspect hundreds of metadata rows and export only a handful of relevant candidates.

## 7. Persistent public state

The public repo stores only progress/checkpoint information, for example:

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

Allowed fields include:

- `last_checked_at`;
- provider cursor/page token;
- last processed stable source ID;
- canonical URL hash;
- DOI/PMID/source ID hash;
- rolling dedupe hashes.

The public state must not contain private FormPath claim text or private application data.

V1 may keep a rolling dedupe window rather than an indefinitely growing public hash ledger. Cross-run deduplication is also repeated on the private side so an expired public hash cannot corrupt the corpus.

## 8. Candidate data model

A discovered candidate receives a stable content-derived ID such as:

`CAND-<sha256-prefix>`

A candidate should contain only what is needed for audit and downstream distillation, for example:

- candidate ID;
- canonical source URL;
- DOI/PMID/other stable identifier when available;
- title;
- authors/organization;
- publication/upload date;
- source type;
- source adapter;
- discovery timestamp;
- normalized basketball topic codes;
- relevance signals;
- canonical URL/source hash;
- provenance status;
- short machine-generated or source-metadata summary when permitted;
- optional timestamp references for video/interview evidence;
- extraction warnings/limitations.

The miner does **not** assign the final FormPath evidence grade. Source class and evidence strength remain separate concepts.

## 9. Copyright and content-storage policy

The miner is a knowledge indexing and evidence-extraction system, not an archival mirror.

Default storage policy:

- store identifiers, metadata, URLs, hashes, and structured paraphrases;
- do not commit complete paywalled articles;
- do not commit full YouTube transcripts;
- do not store complete copies of coaching articles merely because they are publicly accessible;
- keep any quoted audit excerpt very short and source-linked;
- preserve enough provenance to reopen the original source during human or GPT review.

If a source cannot be processed without reproducing substantial copyrighted text, V1 stores metadata and a review pointer instead of the content.

## 10. Miner processing pipeline

Every three-hour run follows this fixed direction:

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

### Discovery

Each adapter returns normalized source records without making evidence claims.

### Normalization

Normalize URLs, DOI/PMID IDs, names, dates, title whitespace, channel/site identifiers, and source-type codes.

### Deduplication

Deduplicate primarily by stable identifiers, then normalized canonical URL, then a conservative title/author/year fingerprint. Fuzzy similarity alone may flag a possible duplicate but must not automatically merge scientifically distinct records.

### Relevance filter

The filter answers only whether a source plausibly belongs in the basketball knowledge candidate pool. It must not determine scientific correctness.

Target topic families align where possible with existing FormPath controlled domains such as SHOOTING, BIOMECHANICS, DECISION, PERCEPTION_GAZE, FATIGUE, MOTOR_LEARNING, FOOTWORK, DEFENSE, PNR_TACTICS, SPACING_OFFBALL, YOUTH, POSE_VALIDATION, and COACHING_METHOD.

### Private export

Only new, relevant candidates are exported. The 500 inspected records are not all copied to the private repo.

## 11. Security model

The public repository is untrusted with respect to the private Hooper's Hub repository.

Required controls:

- private-repo credentials exist only as GitHub Actions secrets;
- use the narrowest available token/repository permission;
- no credential value or authenticated URL is printed to logs;
- never use `pull_request_target` to execute untrusted contributor code with secrets;
- external/fork PR workflows receive no private export credentials;
- scheduled export runs execute only workflow code already present on the protected/default public branch;
- third-party Actions are minimized and pinned to immutable commit SHAs where practical;
- public workflow permissions default to `contents: read`; extra write capability is granted only to the specific state/export step that needs it;
- the private ingestion path is segregated from canonical corpus files;
- any malformed candidate batch is rejected before write.

If a safe private export token cannot be configured, the miner must still run discovery/testing but report export as blocked rather than expose private data or broaden credentials.

## 12. Daily GPT distillation

A ChatGPT scheduled task runs once per day after the majority of that day's miner cycles have completed. The current reservation is intentionally allowed to report `blocked` until the candidate-pool implementation exists.

The distillation task processes only candidates accumulated since its previous successful run.

Pipeline:

```text
PRIVATE INBOX
   ↓
DAILY GPT DISTILLATION
   ↓
DUPLICATE | REJECTED | REVIEW | ACCEPTED-STAGING
```

The distiller must:

- deduplicate against the existing 940 units and pending candidate pool;
- inspect available source metadata and provenance;
- distinguish source type from evidence strength;
- preserve contradictions instead of collapsing them into one "truth";
- detect forbidden or unsupported inference;
- preserve context such as shot type, player level, fatigue, defender presence, handedness, and capture limitations when relevant;
- use cautious language where the evidence is proxy/observational;
- never invent DOI, paper title, author, URL, timestamp, or evidence linkage;
- never recover RU-0001..RU-0060;
- never directly alter frozen Coach V1 contracts.

## 13. Option B acceptance policy

The daily distiller uses four states.

### DUPLICATE

The candidate is already represented by an existing RU/source or is a duplicate of another pending candidate.

### REJECTED

Examples:

- not actually about basketball or transferable basketball movement/decision science;
- low-information SEO content;
- unverifiable source identity;
- promotional claims without useful evidence;
- content that cannot support a distinct, auditable knowledge unit;
- unsafe or misleading inference that cannot be reframed into a supported observation.

### REVIEW

Default destination for ambiguous material, especially:

- coaching videos/interviews requiring interpretation;
- player anecdotes;
- conflicting claims;
- weak source provenance;
- useful source with unclear evidence level;
- candidate whose conclusion depends strongly on context;
- candidate whose extracted claim cannot be checked from accessible material.

### ACCEPTED-STAGING

Automatic staging is allowed only when all required gates pass. Typical high-trust cases are a traceable peer-reviewed/official source with stable provenance, a non-duplicate basketball-relevant claim, inspectable support, explicit limitations, and no forbidden inference.

`ACCEPTED-STAGING` means **eligible for a Draft PR**, not "scientifically proven" and not "already part of the canonical corpus".

Coaching/interview material may reach ACCEPTED-STAGING only when the claim is framed as direct expert guidance/experience rather than falsely promoted to experimental evidence.

## 14. Evidence and provenance compatibility

New accepted candidates must eventually map into the existing FormPath machine ontology and B2-A.1 compatibility layer rather than creating an independent evidence system.

The miner records source class. The distiller proposes the existing corpus evidence grade using the repository's deterministic rubric. B2-A.1 remains the final compatibility gate into frozen `CoachEvidenceItemV1` tiers.

Important rules:

- prestige does not automatically raise evidence strength;
- official guidance may be authoritative guidance without being experimental causal evidence;
- elite coach/player material is direct expert evidence, not a randomized trial;
- ROW_ONLY must not be presented as a verified citation;
- LINKED provenance is preferable for new mined knowledge because the miner is designed to capture URLs/identifiers at discovery time;
- confidence caps may only reduce confidence, never inflate it.

## 15. Canonical RU promotion

The existing canonical corpus is RU-0061..RU-1000. RU-0001..RU-0060 remain permanently discarded by owner instruction.

Staging records use `CAND-*` IDs. They do not become RU numbers merely because GPT accepted them.

When a Draft PR is generated, the promotion tool proposes sequential RU IDs beginning after the current canonical maximum. CI checks the canonical head and refuses duplicate or conflicting IDs.

To prevent multiple open daily PRs from independently claiming the same next RU IDs, V1 uses a **single-active-distillation-PR policy**. If an earlier distillation PR remains open, the next daily run appends newly accepted candidates to that existing staging PR/branch or reports that promotion is waiting for review. It does not create a second colliding canonical promotion.

## 16. Automatic Draft PR

Daily distillation may create/update one Draft PR in the private repository.

Example branch:

`miner/distill-YYYY-MM-DD`

The PR must show a compact audit report such as:

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

The PR contains only staged/accepted knowledge and required provenance/manifest changes, not every discarded raw discovery.

## 17. CI gates before canonical merge

A distillation PR cannot be considered merge-ready unless automated checks verify at least:

- canonical RU ID continuity/collision rules;
- exact schema validity;
- no RU-0001..RU-0060 recreation;
- source URL/identifier syntax and provenance fields;
- evidence-code compatibility through B2-A.1;
- duplicate detection against canonical and staging data;
- controlled-vocabulary validity or explicitly allowed sentinel handling;
- forbidden inference scan for actual metric 3D, force, torque, muscle activation, or other unsupported observations;
- retrieval regression tests;
- B2-B.2 retrieval evaluation regression;
- corpus validator;
- deterministic generation of the proposed machine artifact;
- no frozen Coach contract changes;
- no unexpected private application/UI/Firebase/MotionPacket changes.

A failed gate sends the item/PR back to REVIEW. CI does not weaken the test to make a candidate pass.

## 18. Human control boundary

There is no automatic merge in V1.

The maximum automatic authority is:

```text
Internet → Candidate → GPT decision → ACCEPTED-STAGING → CI → Draft PR
```

Final canonical merge remains manual.

This is the principal safety valve against long-term knowledge-base contamination.

## 19. Daily report

Each distillation produces a human-readable report containing:

- total candidate count since previous run;
- candidate counts by source family;
- duplicates;
- rejected;
- review;
- accepted-staging;
- provenance coverage;
- most important proposed knowledge units;
- contradiction alerts;
- processing failures or unavailable sources;
- whether a Draft PR was created/updated;
- whether all CI gates passed.

If no candidate pool is accessible, the report says so. It must never fabricate daily collection numbers.

## 20. Failure handling

### Upstream outage

Retry with bounded exponential backoff. After the per-source retry budget is exhausted, continue other sources and leave the failed source cursor unchanged.

### Rate limiting

Respect `Retry-After` where provided and end that adapter's work for the run if necessary. Never defeat rate limits using proxy rotation or identity evasion.

### robots/terms restriction

Skip the HTML collector and retain only legally/technically available public metadata routes.

### Private export unavailable

Keep a small ephemeral run artifact/report if allowed, do not print private data, and leave the checkpoint such that the unexported batch can be rediscovered. Never mark it successfully exported.

### GPT distillation unavailable

Leave inbox candidates untouched and process them on the next successful daily run.

### CI failure

Do not auto-merge, do not suppress the failing gate, and surface the exact failure in the daily report/PR.

## 21. Testing strategy

### Public miner

Tests include:

- source adapter fixture tests;
- deterministic URL/identifier normalization;
- cursor/checkpoint tests;
- exact hard cap of 500 inspected records;
- per-source rate-limit behavior;
- duplicate fingerprint tests;
- relevance-filter fixtures including hard negatives;
- secret/log redaction tests;
- malformed upstream data tests;
- private export contract tests using a fake sink.

Network integration tests must be separate from deterministic unit tests so routine CI does not depend on live internet behavior.

### Private ingestion/distillation

Tests include:

- candidate schema validation;
- canonical-corpus duplicate checks;
- deterministic evidence/provenance mapping;
- accepted/review/rejected rule fixtures;
- contradiction preservation;
- no invented provenance fields;
- sequential RU promotion/collision tests;
- single-active-PR policy;
- corpus validator and B2-A.1/B2-B.1/B2-B.2 regressions.

### Security tests

At minimum verify that fork/PR events cannot invoke the private export path with credentials and that logs do not contain token-like values or configured private payload fields.

## 22. Observability

Each miner run publishes non-sensitive counters only, such as:

- records fetched per adapter;
- inspected count;
- duplicate count;
- relevance-pass count;
- exported count;
- rate-limit count;
- adapter error count;
- elapsed time.

Raw private claims and full candidate payloads are not printed to the public Actions log.

## 23. Success criteria for V1

The subsystem is successful when all of the following are demonstrated:

1. The public GitHub Action completes on a three-hour schedule without a paid cloud dependency.
2. No run inspects more than 500 source records.
3. At least one academic/official adapter and one coaching/direct-expert adapter work end-to-end.
4. Duplicate records are stable across repeated runs.
5. Private candidate export succeeds without exposing private candidate text or credentials in public logs.
6. Daily distillation deterministically produces DUPLICATE/REJECTED/REVIEW/ACCEPTED-STAGING outcomes for test fixtures.
7. High-trust accepted candidates preserve provenance and map through existing FormPath evidence compatibility.
8. A Draft PR can be generated/updated without modifying frozen Coach contracts.
9. Canonical FormPath remains unchanged until manual merge.
10. Existing B2-A.1, B2-B.1, and B2-B.2 tests remain green.

## 24. Implementation decomposition

This architecture is intentionally split into separately testable phases:

1. public miner core and schemas;
2. academic/official source adapters;
3. coaching/RSS/direct-expert adapters;
4. normalization, dedupe, checkpoint and relevance filter;
5. secure private export contract;
6. private inbox/candidate schema;
7. deterministic distillation support and acceptance-policy fixtures;
8. scheduled GPT integration;
9. accepted-staging → canonical promotion tool;
10. automatic Draft PR generation and CI gates;
11. end-to-end dry run and security audit.

Implementation must follow TDD where applicable and should not begin until this written design is reviewed and approved by the user.

## 25. Deferred extensions

Possible later work, not part of V1:

- Reddit/community discovery in a separate low-trust queue;
- semantic/embedding retrieval for candidate dedupe;
- citation graph snowballing;
- source-frequency driven provenance repair of old RU-0061..1000;
- automated contradiction clusters;
- multilingual source discovery;
- model-assisted source prioritization;
- automatic held-out Coach scenario generation from newly accepted units;
- paid/cloud scaling if the zero-cost runner ceiling becomes the actual bottleneck.
