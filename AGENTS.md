# FormPath Agent Rules

This repository uses a layered agent workflow. Treat these rules as the default for coding, research, review, UI, writing, and generative-art work.

## Toolchain baseline

- **Superpowers v6.3.0+** — development orchestration: classify work, keep spec/plan links, use test-first implementation where applicable, run independent review, and verify evidence before declaring completion.
- **UI UX Pro Max v2.15.0+** — UI/UX design intelligence: apply to every user-facing React Native/Expo screen, component, interaction, accessibility, typography, spacing, navigation, animation, icon, loading, error, and responsive-layout change.
- **Graphify 0.5.0+** — codebase knowledge graph: use for architecture discovery, cross-file dependency tracing, unfamiliar subsystems, refactors spanning multiple modules, and before broad code searches when a current graph exists.

These are agent workflow tools, not runtime application dependencies. Do not add them to the production Expo bundle.

## Project-local skills

Project-local Agent Skills live under `.agents/skills/` and are selected by task intent.

### Research stack

- **Research** — `.agents/skills/research/`. Default multi-source investigation for substantive technical/current questions. Requires decomposition, source triangulation, validation, a contrarian pass, synthesis, and reusable research storage.
- **Deep Dive** — `.agents/skills/deep-dive/`. Use for thorough audits, rigorous algorithm/strategy/design evaluation, and high-stakes research. Runs specialist lanes, synthesis, focused re-verification, and adversarial red-team review.
- **Research Ensemble** — `.agents/skills/research-ensemble/`. Use when path dependency/coverage risk justifies 2–4 independent research rollouts. Merge reports pairwise, preserve unique evidence/conflicts, and never use majority vote as truth without independent verification.
- **Fact Check** — `.agents/skills/fact-check/`. Mandatory separate post-generation verification for decision-relevant research. Re-open exact sources, audit atomic claims, and issue explicit confirmed/partial/contradicted/unverified/outdated states.
- **Research Novelty Review** — `.agents/skills/research-novelty-review/`. Use before claiming a new FormPath algorithm/method is novel or before a costly research program. Checks closest prior work, atomic contribution type, falsifiability, feasibility pilot, and supportive/skeptical/methods reviewer perspectives.
- **Literature Review** — `.agents/skills/literature-review/`. Use for systematic/scoping/rapid literature review, citation snowballing, evidence tables, and meta-analysis planning.
- **Citation Management** — `.agents/skills/citation-management/`. Use to verify DOI/source metadata, deduplicate references, and audit claim-to-source support.
- **Experimental Design** — `.agents/skills/experimental-design/`. Use before benchmarks, ablations, capture experiments, validation studies, or product experiments.
- **Reproducible Research** — `.agents/skills/reproducible-research/`. Use to preserve seeds, exact code/config/input provenance, run manifests, and regenerable outputs.
- **Scientific Writing** — `.agents/skills/scientific-writing/`. Use after research/experimentation to produce rigorous technical reports with results/interpretation separation and limitations.
- **Deep Market Research** — `.agents/skills/deep-market-research/`. Use for market size, competitors, pricing, GTM, demand, trend, and commercial due diligence with evidence tiers and stale-data checks.

Research routing and upstream/license provenance are documented in `docs/RESEARCH_SKILL_STACK.md`. The operating standard for substantial research is `docs/DEEP_RESEARCH_PROTOCOL_V2.md`. Validated durable findings belong in `docs/research/`; fact audits in `docs/research/audits/`; novelty/reviewer gates in `docs/research/reviews/`; local scratch/cache belongs in `.research/` and stays untracked.

### Other task skills

- **Humanize** — `.agents/skills/humanize/`. Use only when the user explicitly asks to humanize, naturalize, or rewrite prose with the HumanizerAI workflow. It requires network access and a valid `HUMANIZERAI_API_KEY` for API execution. Do not make it a default code, research, or product-copy step.
- **Algorithmic Art** — `.agents/skills/algorithmic-art/`. Use for generative/code art requests such as p5.js, seeded randomness, flow fields, particle systems, and interactive parameter exploration. Start from its required `templates/viewer.html`; create original work rather than copying an existing artwork.
- **Nothing Design v3.0.0** — `.agents/skills/nothing-design/`. Explicit aesthetic mode only. Generic UI work continues to use UI UX Pro Max as the default quality gate.

When a project-local skill conflicts with repository safety, provenance, accessibility, validation, or explicit acceptance criteria, the repository/project gate wins.

## Order of operation

1. **Understand the repository.** For broad or unfamiliar work, consult an existing Graphify result first when fresh, then verify claims against source.
2. **Define the change or research question.** Use Superpowers-style problem classification and acceptance criteria. Keep small bounded work lightweight; use a written spec/plan for architectural or multi-step work.
3. **Select task skills.** Research questions route through the research stack; visible UI through UI UX Pro Max; explicit Nothing style adds Nothing Design; generative-art requests use Algorithmic Art.
4. **Choose research mode.** Quick for narrow facts, Standard for bounded comparisons/design questions, Deep for high-stakes/exhaustive research. Follow `docs/DEEP_RESEARCH_PROTOCOL_V2.md` rather than equating depth with raw search count.
5. **Research before implementation when design depends on uncertain external facts.** Prefer `research`; use `deep-dive` for genuinely independent specialist lanes; use `research-ensemble` when independent complete trajectories reduce coverage/path-dependency risk.
6. **Verify research separately.** After synthesis, run `fact-check` on load-bearing claims. For algorithm/method novelty, also run `research-novelty-review`. A popular conclusion does not survive if the independent verifier rejects it.
7. **Design user-facing changes.** Apply UI UX Pro Max guidance for the current React Native stack before implementation.
8. **Implement narrowly.** Keep tasks independently reviewable. Do not mix unrelated refactors with product changes.
9. **Verify implementation.** Run relevant tests/type checks and inspect mobile behavior. Experimental numbers need provenance; UI changes need accessibility and interaction-state review.
10. **Review against intent.** Compare the diff or research verdict with acceptance criteria, then report evidence, uncertainty, and the next falsifiable step.

## Research quality gate

For decision-relevant research:

- begin with a research contract and explicit acceptance criteria;
- maintain an evidence ledger; search-result snippets are leads, not evidence;
- prioritize primary/official evidence and exact versions/dates;
- seek independent corroboration for load-bearing claims where feasible;
- preserve contradictory, null, and negative evidence;
- perform a contrarian/failure-mode pass;
- distinguish externally sourced fact, project measurement, inference, and model judgment;
- do not treat mirrors/reposts as independent sources;
- when coverage risk is high, use independent rollouts and pairwise evidence-preserving merge rather than one ever-longer trajectory;
- run a separate verifier/fact-check after generation; citation existence alone does not establish claim support;
- do not use majority/plurality as truth when candidate conclusions can be independently verified;
- record reproducibility/provenance for experimental numbers;
- stop when targeted searches add no material independent evidence and an experiment/direct source is the higher-value next step;
- end implementation-guiding research with a falsifiable next test.

For a confidence score of 6/10 or higher, most load-bearing conclusions should stand on inspectable external evidence, code/tests, or reproducible project measurements. State the verified/total load-bearing claim tally.

## UI quality gate

For UI changes, explicitly check:

- visual hierarchy and consistency with the FormPath product direction;
- spacing, typography, touch targets, safe areas, and compact-screen reflow;
- contrast, focus/selection state, reduced-motion behavior where relevant, loading/error/empty states, and screen-reader semantics;
- platform-appropriate React Native patterns rather than web-only conventions;
- motion/animation only when it improves comprehension or feedback;
- no decorative complexity that obscures the shooting-analysis content.

A successful TypeScript build alone is not sufficient evidence that UI work is complete.

## Graphify policy

Generated graph data belongs in `graphify-out/` and should stay out of version control unless a specific review requires a committed artifact. `GRAPH_REPORT.md` may be used as an agent navigation aid, but architectural claims must still be checked against source code before implementation.

## Existing project gates

Continue to follow `docs/DEVELOPMENT_WORKFLOW.md` and project-specific validation protocols. Where instructions conflict, safety/data provenance and explicit project acceptance criteria take precedence over generic agent recommendations.
