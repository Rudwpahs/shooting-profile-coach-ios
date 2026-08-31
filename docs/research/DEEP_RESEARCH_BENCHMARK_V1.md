# FormPath Deep Research Benchmark v1

Created: 2026-08-31

Purpose: evaluate whether changes to the research workflow improve **coverage, factual support, decision usefulness and cost**, rather than merely producing longer reports.

## Compared configurations

### A — Baseline

`research` only, with the existing research quality gate.

### B — Verified

Baseline + independent `fact-check` of all load-bearing claims.

### C — Protocol v2

`research`/`deep-dive` as appropriate + `research-ensemble` when justified + pairwise merge + independent verifier + `research-novelty-review` where the task proposes a new method.

All configurations receive the same question, date, repository state and maximum external-source scope. Record actual search/tool calls and token/cost information when the runtime exposes them.

## Scoring

Score each task on a 0–5 scale per dimension.

| Dimension | Meaning |
|---|---|
| Information coverage | Did the report find the important evidence families and required facts? |
| Claim support | Do inspected sources support the exact load-bearing claims? |
| Primary-source quality | Are important claims traced to primary/official evidence where feasible? |
| Contradiction handling | Did the run actively find and preserve conflicting/negative evidence? |
| Recency/version accuracy | Are current claims tied to correct dates/versions? |
| Decision usefulness | Does the result materially answer what FormPath should do next? |
| Falsifiability | Does implementation-guiding research end with a test that can prove it wrong? |
| Calibration | Does confidence reflect verified evidence rather than prose certainty? |
| Efficiency | Did the workflow stop after diminishing information gain instead of consuming budget mechanically? |

### Hard failure flags

Any hard failure prevents a 4 or 5 overall research-quality rating:

- fabricated/nonexistent source;
- citation does not support a load-bearing claim;
- current-version/date claim is materially stale without warning;
- major contradictory evidence is known but omitted;
- project measurement is reported without run/config provenance;
- novelty is claimed while closest prior work is missing.

## Ten benchmark questions

### Q1 — Asynchronous front/side 3D reconstruction

**Question:** Under what mathematical and empirical conditions can two separately recorded front and side basketball-shot videos be combined into a useful approximate 3D joint-angle representation, and what error should FormPath expect when the two shots are not perfectly identical?

**Must cover:** identifiability assumptions, temporal/phase alignment, camera assumptions, landmark error, prior multi-view/weakly calibrated methods, failure cases, and a bounded validation experiment.

### Q2 — Phase alignment

**Question:** What is the best practical way to align separately recorded shooting motions before combining their geometry: normalized shot phase, event-based landmarks, DTW/soft-DTW, learned temporal alignment, or a hybrid?

**Must cover:** methods, robustness to shot-to-shot variation, computational cost, relevant sports/human-motion evidence, and measurable selection criteria.

### Q3 — Error propagation

**Question:** How do 2D keypoint localization errors propagate into joint-angle and approximate 3D reconstruction errors in FormPath's planned two-view pipeline?

**Must cover:** mathematical propagation or simulation approach, pixel/normalized-coordinate sensitivity, depth/view-angle degeneracy, occlusion, and an error-injection benchmark.

### Q4 — Mobile pose stack

**Question:** Which current pose-estimation stack is most appropriate for on-device or mobile-assisted basketball shooting analysis, considering accuracy, temporal stability, latency, licensing, iOS/React-Native integration and maintainability?

**Must cover:** exact current versions/models, official benchmarks where comparable, platform constraints, licenses, and a reproducible device benchmark plan.

### Q5 — Capture protocol sensitivity

**Question:** How sensitive are shooting-form metrics to camera height, yaw/pitch, distance, lens/FOV, crop, frame rate and lighting, and what minimum user capture instructions are necessary for reliable analysis?

**Must cover:** geometry, pose-estimation evidence, realistic phone constraints, thresholds to test, and user-facing capture protocol implications.

### Q6 — Which shooting metrics have evidence behind them?

**Question:** Which kinematic/kinetic features of basketball shooting have credible evidence linking them to shot outcome, repeatability or expert performance, and which commonly discussed metrics are mostly coaching convention rather than established evidence?

**Must cover:** peer-reviewed primary studies, population differences, causality limits, measurement methods, conflicting evidence, and recommended product wording.

### Q7 — Representative profile construction

**Question:** What is the most defensible way to construct a representative user shooting profile from multiple imperfect trials without pretending the result is simultaneously measured true 3D?

**Must cover:** robust aggregation, outlier handling, phase normalization, uncertainty representation, temporal consistency, and comparison against a simple median/mean baseline.

### Q8 — Social comparison validity and privacy

**Question:** What technical and privacy risks arise when FormPath lets users compare skeleton/pose representations with other users, and what data transformation/retention design minimizes risk while preserving useful comparison?

**Must cover:** pose/skeleton identifiability or biometric considerations, raw-video separation, metadata leakage, platform/privacy guidance, and product trade-offs. Legal conclusions must be jurisdiction- and date-qualified.

### Q9 — Cold-start and market design

**Question:** For a social shooting-form product with initially few users, which cold-start mechanisms are best supported by evidence/case studies, and what initial content/value loop can work before a meaningful social graph exists?

**Must cover:** comparable social/sports products, seeding strategies, non-social standalone utility, creator/influencer supply, retention mechanisms, counterexamples, and a small demand experiment.

### Q10 — Release validation gate

**Question:** What validation evidence should be required before FormPath enables the experimental two-view reconstruction/profile features by default?

**Must cover:** gold/reference measurement options, participant/trial design, accuracy/repeatability metrics, failure-rate thresholds, device diversity, calibration, confidence intervals, and go/no-go criteria stated before testing.

## Execution protocol

For each question:

1. Run configuration A, B and C independently where budget permits.
2. Preserve each raw report before seeing other configuration outputs.
3. Build a union evidence list across configurations.
4. Manually or independently audit a sample of at least five load-bearing claims per report; audit all if the report has fewer than five.
5. Score dimensions using the same rubric.
6. Record unique evidence found only by one configuration.
7. Record corrections introduced by the verifier.
8. Record whether ensemble merging added genuinely new evidence or just duplicated prose.
9. Record actual effort/cost metrics available from the host.
10. Decide whether C's quality gain justifies its extra cost for that task class.

## Promotion rule

Protocol v2 becomes the default for a task class only if it improves the mean of **Information coverage + Claim support + Decision usefulness** without creating a higher hard-failure rate, and its added cost is justified by the task's stakes.

For low-stakes/narrow queries, Quick or Standard mode may remain preferable even if Deep mode scores slightly higher.

## Result table template

| Q | Config | Coverage | Support | Primary | Contradictions | Recency | Decision | Falsifiability | Calibration | Efficiency | Hard failures | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|

## First pilot recommendation

Start with Q1, Q2 and Q10. They directly test the current algorithm direction, temporal alignment decision and feature-gating discipline, while covering mathematical research, literature retrieval and experimental-design handoff.
