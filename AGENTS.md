# FormPath Agent Rules

This repository uses a three-layer agent workflow. Treat these rules as the default for coding, research, review, and UI work.

## Toolchain baseline

- **Superpowers v6.3.0+** — development orchestration: classify work, keep spec/plan links, use test-first implementation where applicable, run independent review, and verify evidence before declaring completion.
- **UI UX Pro Max v2.15.0+** — UI/UX design intelligence: apply to every user-facing React Native/Expo screen, component, interaction, accessibility, typography, spacing, navigation, animation, icon, loading, error, and responsive-layout change.
- **Graphify 0.5.0+** — codebase knowledge graph: use for architecture discovery, cross-file dependency tracing, unfamiliar subsystems, refactors spanning multiple modules, and before broad code searches when a current graph exists.

These are agent workflow tools, not runtime application dependencies. Do not add them to the production Expo bundle.

## Order of operation

1. **Understand the repository.** For broad or unfamiliar work, consult an existing `GRAPH_REPORT.md`/Graphify graph first. If the graph is missing or stale and Graphify is available, refresh it before architectural conclusions.
2. **Define the change.** Use Superpowers-style problem classification and acceptance criteria. Keep small bounded work lightweight; use a written spec/plan for architectural or multi-step work.
3. **Design user-facing changes.** Before implementing visible UI, apply UI UX Pro Max guidance for the current React Native stack and derive a coherent page-level design system rather than styling components ad hoc.
4. **Implement narrowly.** Keep tasks independently reviewable. Do not mix unrelated refactors with product changes.
5. **Verify.** Run the relevant tests/type checks and inspect mobile behavior. UI changes require accessibility and interaction-state review, not just compilation.
6. **Review against intent.** Compare the diff with the acceptance criteria/spec, then report evidence, remaining uncertainty, and any gated follow-up.

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
