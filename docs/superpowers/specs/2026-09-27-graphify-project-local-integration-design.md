# Graphify Project-Local Integration Design

Date: 2026-09-27
Branch: `work/hoophub-film-phase-space-v1`
Status: Approved design, implementation pending

## Goal

Make Graphify a reliable project-local codebase navigation aid for HoopHub/FormPath without changing application runtime behavior, Firestore schema, server storage structure, raw-video policy, or Expo bundle dependencies.

The integration must help agents trace cross-file architecture and dependency paths—especially around `RepresentativePose4DV2`, Phase Space, Film Space, Sequence/Motion fallbacks, and local-video association—while keeping Graphify output advisory rather than authoritative.

## Current State

The repository already documents Graphify as an agent workflow tool, currently using a `Graphify 0.5.0+` baseline. `graphify-out/` is already ignored by git. The repository does not currently contain a project-local Graphify skill under `.agents/skills/graphify/`, and generated graph artifacts are intentionally not tracked.

## Chosen Approach

Adopt Graphify as a project-local development aid with explicit instructions and a repeatable generation/query workflow.

This is preferred over:

1. manual-only CLI use, which is too easy for agents to skip or apply inconsistently; and
2. automatic post-commit regeneration, which would add noise and latency during active Phase Space / Film Space development.

Graph regeneration will therefore remain explicit and on-demand.

## Scope

### In scope

- Update the documented Graphify baseline to the currently adopted upstream package/repository.
- Add a project-local `.agents/skills/graphify/` skill that tells agents when and how to use Graphify.
- Preserve `graphify-out/` as untracked generated output.
- Document a repeatable workflow for:
  - generating or refreshing the graph;
  - checking graph freshness against current source state;
  - querying symbols and dependency paths;
  - verifying graph-derived architectural claims against source before code changes.
- Validate the workflow against the current HoopHub branch by tracing the key Phase Space / Film Space architecture.

### Out of scope

- No changes to React Native/Expo runtime code solely for Graphify.
- No Graphify production dependency.
- No Firestore schema or backend storage changes.
- No raw-video upload or storage changes.
- No automatic post-commit hook in this phase.
- No committed `graph.json`, `graph.html`, `GRAPH_REPORT.md`, or equivalent generated graph artifact by default.

## Repository Layout

The intended project-local structure is:

```text
.agents/
  skills/
    graphify/
      SKILL.md

docs/
  AGENT_TOOLCHAIN.md
  DEVELOPMENT_WORKFLOW.md
  superpowers/
    specs/
      2026-09-27-graphify-project-local-integration-design.md

graphify-out/           # generated locally, gitignored
```

No Graphify files should be imported by application code.

## Agent Behavior

Agents should use Graphify when:

- entering an unfamiliar subsystem;
- tracing dependencies across multiple files;
- preparing a refactor that spans module boundaries;
- checking architecture before broad code search;
- comparing a conceptual flow with the actual repository structure.

Agents should not treat Graphify output as final evidence. Any dependency, ownership, storage, or execution-flow claim that affects implementation must be verified in the underlying source files.

If graph output is stale relative to the current branch or recent commits, agents should regenerate it before relying on it.

## Generated Artifacts Policy

Generated artifacts belong under `graphify-out/` and remain local by default. The existing gitignore policy is retained.

A generated artifact may be committed only when a specific review explicitly requires a frozen graph snapshot. That exception must be deliberate and documented.

## Validation Target

The first validation run should inspect the active HoopHub branch and answer, from graph plus source verification:

1. Where `RepresentativePose4DV2` is defined and consumed.
2. How the 101 normalized phase representation flows into Phase Space rendering.
3. Where joint trajectories and sparse ghost skeletons are produced or consumed.
4. Where the anchors `ready`, `deepestDip`, `rise`, `releaseProxy`, and `followThrough` are defined or derived.
5. How rotate, zoom, and scrub interaction connects to the Phase Space view.
6. Where SequenceViewer and Motion viewer fallbacks remain available.
7. How Film Space associates a profile with local source video.
8. Where local cache and cleanup lifecycle are implemented.
9. How missing/deleted local video falls back safely.
10. Confirmation that no raw-video server upload path is introduced by this work.

Graph answers that cannot be corroborated in source should be marked uncertain rather than accepted.

## Versioning and Upstream Provenance

The existing repository baseline (`Graphify 0.5.0+`) should be updated only after checking the current upstream release, package name, CLI behavior, installation path, and license. Documentation should name the actual adopted upstream source and package rather than relying on an old alias or stale repository URL.

The project-local skill should record the adopted minimum version and any host-specific usage notes needed by Codex.

## Failure Handling

If Graphify is unavailable in a given environment:

- do not block normal repository work;
- fall back to source search and direct file inspection;
- state that graph-assisted discovery was unavailable;
- do not fabricate graph results.

If Graphify output conflicts with source, source wins.

If the environment contains a broken Python/Graphify shim, do not modify unrelated system configuration as part of this integration. Prefer a project-scoped invocation path or documented environment repair step.

## Testing / Verification

Implementation is complete only when all of the following are verified:

- project-local Graphify instructions exist and are readable by the agent workflow;
- toolchain documentation names the adopted upstream and version correctly;
- `graphify-out/` remains ignored;
- Graphify generation succeeds in a supported local environment, or any environment limitation is documented precisely;
- representative architecture queries return useful results;
- at least the validation targets above are cross-checked against source;
- no runtime package, Firestore schema, server storage, or raw-video behavior changed as a side effect;
- relevant existing tests/type checks still pass if any repository source/config file outside docs/agent tooling is touched.

## Acceptance Criteria

The integration is accepted when an agent can start from the current HoopHub branch, generate or refresh a local graph, query the Phase Space / Film Space architecture, verify the resulting claims against source, and continue coding without adding Graphify to the production application or committing generated graph data.

## Deferred Work

A post-commit or CI-based graph refresh may be reconsidered later if manual freshness becomes a recurring problem. It is intentionally excluded from this first integration to avoid interfering with active feature development.
