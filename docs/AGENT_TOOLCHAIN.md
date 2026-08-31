# Agent Toolchain Baseline

Last reviewed: 2026-08-31

FormPath uses external agent skills as development aids. They are not application dependencies and must not be shipped inside the Expo runtime bundle.

## Current baseline

| Tool | Baseline | Role in FormPath |
| --- | --- | --- |
| Superpowers | v6.3.0+ | planning, subagent/task orchestration, implementation/review/verification discipline |
| UI UX Pro Max | v2.15.0+ | React Native UI design system, UX/accessibility, interaction and visual QA |
| Graphify | 0.5.0+ | repository knowledge graph, architecture discovery, dependency/path analysis |
| Humanize | upstream main | explicit prose-humanization workflow; API-backed and opt-in |
| Algorithmic Art | Anthropic official main | p5.js generative art, seeded randomness, interactive exploration |
| Nothing Design | v3.0.0 | explicit Nothing-inspired visual system; opt-in aesthetic layer |

## Superpowers

Source: https://github.com/obra/superpowers

Use it for development process, not product code. For small bounded changes, keep ceremony light. For architectural or multi-step work, preserve a clear spec-to-plan-to-implementation link. Independent review and evidence-based verification are required before calling work complete.

## UI UX Pro Max

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

The current baseline is v2.15.0. Every user-facing FormPath change should use the React Native guidance rather than generic web guidance. Apply it before implementation and again during visual QA.

Required review domains include hierarchy, typography, spacing, touch targets, navigation, loading/error/empty states, text scaling/reflow, accessibility, reduced motion, icons, feedback states, and mobile-safe layout. Use page/system-level consistency instead of one-off component styling.

If a local coding-agent host supports the CLI, update with the upstream-supported command rather than copying stale skill files into this repository. Keep host-specific skill installations outside the production dependency graph.

## Graphify

Source: https://github.com/safishamsi/graphify

The current package baseline is `graphifyy` 0.5.0; the installed CLI command is `graphify`. Use it when the task spans multiple modules, when architecture is unfamiliar, or when a refactor requires call/dependency tracing. Prefer an existing fresh graph before broad keyword hunting, but always verify graph-derived conclusions against the actual source.

Generated output is local working data. The default location `graphify-out/` is ignored by Git.

## Project-local skills

The following skills are vendored under `.agents/skills/` so compatible coding agents can discover project-specific capabilities without adding them to the Expo runtime.

### Humanize

Source: https://github.com/humanizerai/agent-skills/tree/main/skills/humanize

Installed at `.agents/skills/humanize/`. The upstream skill calls the HumanizerAI API and therefore requires `HUMANIZERAI_API_KEY`, network access, and service credits for actual API execution. It is opt-in: use only for explicit prose-humanization requests, not as a default software-development or research step. The upstream MIT license is retained locally.

### Algorithmic Art

Source: https://github.com/anthropics/skills/tree/main/skills/algorithmic-art

Installed at `.agents/skills/algorithmic-art/` from Anthropic's official public Agent Skills repository. The canonical `SKILL.md` and required `templates/viewer.html` are vendored locally, and the Apache-2.0 license is retained. The optional `templates/generator_template.js` path is present as a canonical-source reference because a repository write safety gate rejected copying the full optional reference file verbatim. The skill remains functional because `viewer.html` is the required starting template and the generator template is documented upstream as a best-practices reference.

Use this skill for generative/code art, p5.js, seeded randomness, particles, fields, and interactive parameter exploration. Generated artwork must be original rather than a copy of an existing artist's work.

### Nothing Design

Source: https://github.com/dominikmartn/nothing-design-skill

Installed at `.agents/skills/nothing-design/`, baseline v3.0.0. The skill, MIT license, and all three upstream reference files (`tokens.md`, `components.md`, `platform-mapping.md`) are vendored locally.

This skill must not auto-trigger for generic design work. It is an explicit aesthetic mode used only when the user asks for Nothing style/design. UI UX Pro Max remains the default FormPath UI quality/accessibility gate and continues to apply when Nothing Design is selected.

## Upgrade policy

Before a major architecture sprint or UI redesign, check upstream releases for the baseline tools and the current state of vendored project-local skills. Update only after checking release notes, source provenance, licenses, and supported agent hosts. Do not silently copy third-party generated files into runtime source directories.

When a new baseline is adopted:

1. update this document and `AGENTS.md`;
2. verify that the new workflow still fits `docs/DEVELOPMENT_WORKFLOW.md`;
3. run a bounded pilot task before applying new behavior to a large refactor;
4. record any project-specific exception instead of weakening validation gates.
