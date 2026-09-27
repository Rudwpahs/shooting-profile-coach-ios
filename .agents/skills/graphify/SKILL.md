---
name: graphify
description: Use Graphify for broad or unfamiliar codebase questions, architecture discovery, cross-file dependency/path tracing, and multi-module refactors. Prefer an existing fresh graph; verify implementation-relevant claims against source.
---

# Graphify — FormPath project adapter

This project pins Graphify package `graphifyy==0.9.69` from `Graphify-Labs/graphify`.

## When to use

Use this skill before broad source searches when the task spans multiple modules, enters an unfamiliar subsystem, traces ownership/data flow, or prepares a refactor across file boundaries.

Do not use Graphify as authoritative evidence. Source code, tests, schema/rules, and recorded project measurements win if they disagree with the graph.

## Fast path

1. Check whether `graphify-out/graph.json` exists and is fresh for the current `git rev-parse HEAD`.
2. If fresh, ask the narrowest useful question with `graphify query`.
3. Use `graphify path` for a concrete A→B relationship and `graphify explain` for one symbol/node.
4. Open the exact source files implicated by the result and verify every implementation-relevant claim before editing code.

## Pinned invocation

Prefer `uvx` so the project does not depend on the machine's system Python shim:

```bash
uvx --from graphifyy==0.9.69 graphify .
uvx --from graphifyy==0.9.69 graphify . --update
uvx --from graphifyy==0.9.69 graphify query "<question>"
uvx --from graphifyy==0.9.69 graphify path "<A>" "<B>"
uvx --from graphifyy==0.9.69 graphify explain "<symbol>"
```

Generated data belongs under `graphify-out/` and is intentionally gitignored.

## Environment failure

If the pinned package cannot be installed or executed because Python/package-network access is unavailable:

- do not repair unrelated machine Python configuration;
- do not create CI/post-commit hooks as a workaround;
- fall back to direct repository/source inspection;
- explicitly mark graph-assisted evidence as unavailable/not executed;
- never fabricate EXTRACTED/INFERRED edges or Graphify query output.

## FormPath boundaries

Graphify is development tooling only. It must not add or change:

- `package.json` / `pnpm-lock.yaml` runtime dependencies;
- Expo/native application behavior;
- Firestore schema/rules or server storage;
- raw-video upload/storage paths;
- Phase Space / Film Space evidence boundaries or existing Sequence/Motion fallbacks.

## Upstream provenance

- Upstream: `https://github.com/Graphify-Labs/graphify`
- Package: `graphifyy==0.9.69`
- Release provenance commit: `4139885a1212956cf69a76946fbde0d181ab85e9`
- Official project install target: `graphify install --project --platform agents`
- Official installer destination: `./.agents/skills/graphify/SKILL.md` plus `references/` and `.graphify_version`

This adapter is intentionally concise. When network/package access is available, the pinned official installer may refresh this directory; project-specific safety rules in `AGENTS.md` still take precedence.

## References

See `references/` for project-scoped notes on query, update, exports, extraction, GitHub/merge, hooks, transcription, and watch behavior.
