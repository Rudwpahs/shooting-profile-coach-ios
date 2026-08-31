# Agent Toolchain Baseline

Last reviewed: 2026-08-31

FormPath uses external agent skills as development aids. They are not application dependencies and must not be shipped inside the Expo runtime bundle.

## Current baseline

| Tool | Baseline | Role in FormPath |
| --- | --- | --- |
| Superpowers | v6.3.0+ | planning, subagent/task orchestration, implementation/review/verification discipline |
| UI UX Pro Max | v2.15.0+ | React Native UI design system, UX/accessibility, interaction and visual QA |
| Graphify | 0.5.0+ | repository knowledge graph, architecture discovery, dependency/path analysis |
| Research | adapter from v0.2.7 | persistent multi-source investigation, triangulation, contrarian validation |
| Deep Dive | current upstream adapter | multi-lane rigorous investigation, synthesis, verification, red-team |
| Literature Review | SciAgent v1.0.0 adapter | systematic/scoping review, citation snowballing, evidence synthesis |
| Citation Management | SciAgent v1.0.0 adapter | DOI/reference verification and claim-to-source audit |
| Experimental Design | SciAgent v1.0.0 adapter | benchmarks, ablations, sample/power/design discipline |
| Reproducible Research | SciAgent v1.0.0 adapter | deterministic runs, data/code/config provenance, repeatability |
| Scientific Writing | SciAgent v1.0.0 adapter | rigorous technical research reporting |
| Deep Market Research | v2.8.0 adapter | market/competitor/GTM/pricing research with evidence tiers |
| Humanize | upstream main | explicit prose-humanization workflow; API-backed and opt-in |
| Algorithmic Art | Anthropic official main | p5.js generative art, seeded randomness, interactive exploration |
| Nothing Design | v3.0.0 | explicit Nothing-inspired visual system; opt-in aesthetic layer |

## Core development tools

### Superpowers

Source: https://github.com/obra/superpowers

Use it for development process, not product code. For small bounded changes, keep ceremony light. For architectural or multi-step work, preserve a clear spec-to-plan-to-implementation link. Independent review and evidence-based verification are required before calling work complete.

### UI UX Pro Max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

The current baseline is v2.15.0. Every user-facing FormPath change should use the React Native guidance rather than generic web guidance. Apply it before implementation and again during visual QA.

Required review domains include hierarchy, typography, spacing, touch targets, navigation, loading/error/empty states, text scaling/reflow, accessibility, reduced motion, icons, feedback states, and mobile-safe layout.

### Graphify

Source: https://github.com/safishamsi/graphify

The current package baseline is `graphifyy` 0.5.0; the installed CLI command is `graphify`. Use it when the task spans multiple modules, architecture is unfamiliar, or a refactor requires dependency tracing. Generated output belongs in `graphify-out/` and stays out of git by default.

## Research stack

Routing, storage policy, source provenance, and license notices are maintained in [`RESEARCH_SKILL_STACK.md`](RESEARCH_SKILL_STACK.md).

The research stack is deliberately layered rather than one monolithic prompt:

- `research` is the normal default for multi-source questions;
- `deep-dive` escalates broad/high-stakes investigations into specialist lanes + synthesis + verification + red-team;
- `literature-review` and `citation-management` handle the scholarly evidence chain;
- `experimental-design` and `reproducible-research` turn research conclusions into defensible tests and repeatable evidence;
- `scientific-writing` turns completed evidence into a rigorous report;
- `deep-market-research` handles market, competitor, pricing, demand, GTM, and commercialization questions.

Durable validated findings belong in `docs/research/`; `.research/` is reserved for local scratch/cache and is gitignored.

## Other project-local skills

### Humanize

Source: https://github.com/humanizerai/agent-skills/tree/main/skills/humanize

Installed at `.agents/skills/humanize/`. The upstream skill calls the HumanizerAI API and therefore requires `HUMANIZERAI_API_KEY`, network access, and service credits for actual API execution. It is opt-in.

### Algorithmic Art

Source: https://github.com/anthropics/skills/tree/main/skills/algorithmic-art

Installed at `.agents/skills/algorithmic-art/` from Anthropic's official public Agent Skills repository. The canonical `SKILL.md` and required `templates/viewer.html` are vendored locally, and the Apache-2.0 license is retained. The optional `templates/generator_template.js` is represented by a canonical-source reference because a repository write safety gate rejected copying the full optional reference file verbatim.

### Nothing Design

Source: https://github.com/dominikmartn/nothing-design-skill

Installed at `.agents/skills/nothing-design/`, baseline v3.0.0. The skill, MIT license, and upstream references (`tokens.md`, `components.md`, `platform-mapping.md`) are vendored locally. It is an explicit aesthetic mode; UI UX Pro Max remains the default FormPath UI/accessibility gate.

## Upgrade policy

Before a major architecture sprint, UI redesign, or deep research campaign, check upstream releases for the baseline tools and the current state of project-local skills. Update only after checking release notes, provenance, licenses, supported hosts, and any new host-specific requirements.

When a new baseline is adopted:

1. update this document and `AGENTS.md`;
2. update `RESEARCH_SKILL_STACK.md` when research tooling changes;
3. verify the workflow still fits `docs/DEVELOPMENT_WORKFLOW.md`;
4. run a bounded pilot before applying new behavior to a large refactor or research campaign;
5. record project-specific exceptions instead of weakening validation gates.
