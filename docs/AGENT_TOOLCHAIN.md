# Agent Toolchain Baseline

Last reviewed: 2026-08-31

FormPath uses external agent skills as development aids. They are not application dependencies and must not be shipped inside the Expo runtime bundle.

## Current baseline

| Tool | Baseline | Role in FormPath |
| --- | --- | --- |
| Superpowers | v6.3.0+ | planning, subagent/task orchestration, implementation/review/verification discipline |
| UI UX Pro Max | v2.15.0+ | React Native UI design system, UX/accessibility, interaction and visual QA |
| Graphify | 0.5.0+ | repository knowledge graph, architecture discovery, dependency/path analysis |

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

## Upgrade policy

Before a major architecture sprint or UI redesign, check upstream releases for these tools. Update the baseline only after checking release notes for breaking changes and supported agent hosts. Do not silently copy third-party generated files into runtime source directories.

When a new baseline is adopted:

1. update this document and `AGENTS.md`;
2. verify that the new workflow still fits `docs/DEVELOPMENT_WORKFLOW.md`;
3. run a bounded pilot task before applying new behavior to a large refactor;
4. record any project-specific exception instead of weakening validation gates.
