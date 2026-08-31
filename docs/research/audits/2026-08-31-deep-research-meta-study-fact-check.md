# Fact Check — Deep Research Meta-Study

Verified: 2026-08-31

Target: `docs/research/2026-08-31-deep-research-meta-study.md`

## Verdict

Overall reliability: **High for the five audited load-bearing architecture claims below.**

Load-bearing claims checked in this pilot: **5 / 5**

This is a bounded pilot of the new independent fact-check stage, not a claim that every sentence in the full meta-study has been re-audited here.

## Claim ledger

| ID | Claim | Status | Evidence checked | Notes |
|---|---|---|---|---|
| C1 | Anthropic reported its multi-agent research setup outperforming a single Opus setup by 90.2% on an internal research evaluation. | CONFIRMED | Anthropic, `How we built our multi-agent research system` | The source explicitly states 90.2%. This is an **internal evaluation**, not a universal multi-agent improvement rate. |
| C2 | Anthropic reported multi-agent research using roughly 15× the tokens of ordinary chat interactions and warned that tightly coupled/shared-context tasks are a weaker fit. | CONFIRMED | Anthropic, same engineering article | The article states agents use about 4× chat tokens and multi-agent systems about 15×, and explicitly notes limitations for highly dependent/shared-context tasks. |
| C3 | OpenAI BrowseComp found that aggregating 64 independent Deep Research samples with majority/weighted/best-of-N strategies improved accuracy by roughly 15–25% over a single attempt, with Best-of-N strongest in that experiment. | CONFIRMED | OpenAI, `BrowseComp: a benchmark for browsing agents` | Supported by OpenAI's benchmark write-up. This result is specific to BrowseComp and its hard-to-find/easier-to-verify task structure. |
| C4 | AI21 reported that pairwise/agglomerative merging of lower-ranked research reports reached a DeepResearch Bench II TotalScore of 64.38 and #1 at publication time, with merging four strong candidates already clearing the prior reported SOTA in its oracle analysis. | CONFIRMED | AI21, `Tipping the scales: Merging weak agents into a state-of-the-art deep researcher`, 2026-06-24 | The source reports 64.38 and explains pairwise merging preserved Information Recall better than larger merge groups. Leaderboard position is time-sensitive and should always be date-qualified. |
| C5 | AI21 later showed that an independent verifier can outperform plain majority voting because correct answers may exist in the candidate pool but be outvoted by repeated wrong answers. | CONFIRMED | AI21, `You don’t need a frontier model. You need a verifier`, 2026-08-19 | The source reports a generator ensemble at 83.3 under majority voting and 93.4 with a Claude Opus verifier on FACTS-Search. It also reports transfer experiments and explicitly frames selection/verification as the bottleneck. |

## Corrections / qualifications applied

1. **Do not generalize Anthropic's 90.2% figure** to all research tasks. It is an internal breadth-first research evaluation result.
2. **Do not present 15× token use as a fixed law.** It is Anthropic's reported observation for its architecture/data.
3. **Do not assume Best-of-N is always superior.** BrowseComp is unusually asymmetric: discovery is hard and verification is relatively easier.
4. **AI21's #1 statement requires the date** (2026-06-24) because research-agent leaderboards move quickly.
5. **Verifier gains are task/system dependent.** AI21's published FACTS-Search result supports the mechanism, not a guarantee of the same lift on FormPath research.

## Sources inspected

- Anthropic — https://www.anthropic.com/engineering/multi-agent-research-system
- OpenAI BrowseComp — https://openai.com/index/browsecomp/
- AI21 merger — https://www.ai21.com/blog/merging-weak-agents-into-a-state-of-the-art-deep-researcher/
- AI21 verifier — https://www.ai21.com/blog/you-need-a-verifier/

## Pilot conclusion

The new `fact-check` stage catches an important class of failure even when the headline claim is correct: **scope inflation**. Most of the audited claims were supported, but several needed explicit qualifiers about benchmark type, publication date, or architecture-specific measurement. That supports keeping verification as a distinct post-synthesis gate.
