# Graphify Project-Local Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Graphify a pinned, project-local, query-first development aid for HoopHub/FormPath without changing Expo runtime behavior, Firestore/server storage, or raw-video policy.

**Architecture:** Keep Graphify completely outside the application dependency graph. Vendor the official project-scoped Agent Skills bundle under `.agents/skills/graphify/`, keep generated knowledge-graph artifacts under gitignored `graphify-out/`, and make `AGENTS.md`/toolchain docs define query-first behavior plus mandatory source verification. Validate the integration against the active Phase Space / Film Space architecture and preserve a small source-verified validation record.

**Tech Stack:** Graphify `graphifyy==0.9.69` (CLI `graphify`), generic Agent Skills project target, React Native/Expo repository, Git, pnpm/Vitest/TypeScript for regression checks only if non-tooling source/config changes occur.

**Spec:** `docs/superpowers/specs/2026-09-27-graphify-project-local-integration-design.md`

## Global Constraints

- Adopt the official upstream `Graphify-Labs/graphify` and package `graphifyy==0.9.69`; CLI command remains `graphify`.
- Version `0.9.69` was released on 2026-09-26; PyPI provenance points to upstream commit `4139885a1212956cf69a76946fbde0d181ab85e9`.
- Upstream package license expression is `Apache-2.0`; upstream also retains historical `LICENSE-MIT` / `NOTICE` material.
- Python requirement is 3.10+; prefer `uv`/`uvx` so the repository does not depend on the machine's broken `python`/`py` shim.
- Graphify is a development aid only; do not add it to `package.json`, `pnpm-lock.yaml`, Expo/native runtime, Firestore schema, server storage, or raw-video paths.
- Project-local skill location is `.agents/skills/graphify/`; generated graph data stays under `graphify-out/` and remains untracked.
- Do not add automatic post-commit/CI graph regeneration in this phase.
- Graph output is advisory. Any implementation-relevant dependency, ownership, storage, or execution-flow claim must be checked against source.
- Preserve existing Sequence/Motion fallback behavior and all Phase Space / Film Space evidence boundaries; this plan changes developer tooling only.

## Review Focus

- **Stale graph vs current branch:** graph freshness must be checked against the current HEAD before architecture conclusions are used; Task 3 records HEAD and regeneration evidence.
- **Broken or unavailable Graphify/Python environment:** the workflow must fail open to direct source search, never fabricate graph results, and must not repair unrelated system configuration; Tasks 2 and 3 exercise the pinned `uvx` path and fallback wording.
- **Installer writes outside the intended project-local skill tree:** only `.agents/skills/graphify/**` may be accepted from the installer in Task 2; unexpected `.codex/`, hook, or runtime-file changes fail the task.
- **Generated artifacts accidentally committed:** `graphify-out/` must remain ignored and absent from `git ls-files`; Task 3 verifies both conditions after generation.
- **INFERRED graph edges treated as facts:** validation must record whether evidence is EXTRACTED/INFERRED and cite the confirming source path; Task 4 rejects unsupported graph-only claims.

---

### Task 1: Pin upstream provenance and repository policy

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/AGENT_TOOLCHAIN.md`
- Modify: `docs/DEVELOPMENT_WORKFLOW.md`
- Local-only verification marker: `.git/graphify-integration-base`

**Interfaces:**
- Consumes: approved design spec; official Graphify package/repository facts.
- Produces: one repository-wide Graphify policy: `graphifyy==0.9.69`, `Graphify-Labs/graphify`, `.agents/skills/graphify/`, query-first usage, source-verification rule, and explicit no-runtime-dependency rule.

- [ ] **Step 1: Record the implementation base and stale-policy assertions before editing docs**

Run:

```bash
git rev-parse HEAD > .git/graphify-integration-base
rg -n "Graphify 0\.5\.0|safishamsi/graphify" AGENTS.md docs/AGENT_TOOLCHAIN.md docs/DEVELOPMENT_WORKFLOW.md
```

Expected: the current HEAD is stored locally for final diff verification, and at least the old `Graphify 0.5.0+` baseline is found.

- [ ] **Step 2: Update `AGENTS.md` Graphify baseline and behavior**

Set the baseline to `graphifyy==0.9.69` from `Graphify-Labs/graphify`. Keep the existing policy that Graphify is not an Expo/runtime dependency. Add that agents should prefer `graphify query`, then `graphify path` / `graphify explain` for scoped architecture discovery when a fresh graph exists, and verify implementation-relevant claims against source.

- [ ] **Step 3: Update `docs/AGENT_TOOLCHAIN.md`**

Replace the old upstream/package/version information with:

```text
Source: https://github.com/Graphify-Labs/graphify
Package: graphifyy==0.9.69
Release: 2026-09-26
Provenance commit: 4139885a1212956cf69a76946fbde0d181ab85e9
License: Apache-2.0 (historical MIT material retained upstream)
CLI: graphify
Python: 3.10+
Project skill: .agents/skills/graphify/
```

Document the project install command as `uvx --from graphifyy==0.9.69 graphify install --project --platform agents`. State that the generic Agent Skills target is intentional because this repository standardizes project-local skills under `.agents/skills/`; do not enable post-commit hooks in this phase. Add the host note that Codex invokes the skill as `$graphify`, while terminal verification uses the `graphify` CLI directly.

- [ ] **Step 4: Update `docs/DEVELOPMENT_WORKFLOW.md`**

Replace `Graphify 0.5.0+` with the pinned baseline. In Stage 0 / broad-refactor guidance, require: fresh graph check → scoped query/path/explain → direct source verification. Preserve the existing fallback when Graphify is unavailable.

- [ ] **Step 5: Verify the stale baseline is gone and runtime manifests are untouched**

Run:

```bash
! rg -n "Graphify 0\.5\.0|safishamsi/graphify" AGENTS.md docs/AGENT_TOOLCHAIN.md docs/DEVELOPMENT_WORKFLOW.md
rg -n "0\.9\.69|Graphify-Labs/graphify|graphify query|Apache-2\.0" AGENTS.md docs/AGENT_TOOLCHAIN.md docs/DEVELOPMENT_WORKFLOW.md
git diff -- package.json pnpm-lock.yaml
```

Expected: first command exits 0 via shell negation, new provenance/query-first text is found, and runtime manifest diff is empty.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md docs/AGENT_TOOLCHAIN.md docs/DEVELOPMENT_WORKFLOW.md
git commit -m "docs: pin Graphify 0.9.69 workflow"
```

---

### Task 2: Vendor the official project-local Graphify skill

**Files:**
- Create: `.agents/skills/graphify/SKILL.md`
- Create: `.agents/skills/graphify/.graphify_version`
- Create: `.agents/skills/graphify/references/add-watch.md`
- Create: `.agents/skills/graphify/references/exports.md`
- Create: `.agents/skills/graphify/references/extraction-spec.md`
- Create: `.agents/skills/graphify/references/github-and-merge.md`
- Create: `.agents/skills/graphify/references/hooks.md`
- Create: `.agents/skills/graphify/references/query.md`
- Create: `.agents/skills/graphify/references/transcribe.md`
- Create: `.agents/skills/graphify/references/update.md`

**Interfaces:**
- Consumes: pinned `graphifyy==0.9.69` installer.
- Produces: discoverable project-local skill named `graphify`, with progressive-disclosure references and version stamp `0.9.69`.

- [ ] **Step 1: Record the allowed-path baseline**

Run:

```bash
git status --short
```

Expected: no uncommitted installer artifacts under `.codex/`, `graphify-out/`, `package.json`, `pnpm-lock.yaml`, `firebase*`, `server/`, or `app/` before installation.

- [ ] **Step 2: Run the pinned project-local installer**

Run from repository root:

```bash
uvx --from graphifyy==0.9.69 graphify install --project --platform agents
```

Expected: skill is installed under `.agents/skills/graphify/`; the installer reports a project-scoped install. If `uvx` is unavailable, install `uv` using the platform-supported method, but do not modify or repair the unrelated system Python shim.

- [ ] **Step 3: Verify exact version and release bundle**

Run:

```bash
test "$(cat .agents/skills/graphify/.graphify_version)" = "0.9.69"
test -f .agents/skills/graphify/SKILL.md
for f in add-watch.md exports.md extraction-spec.md github-and-merge.md hooks.md query.md transcribe.md update.md; do test -f ".agents/skills/graphify/references/$f"; done
rg -n "name: graphify|graphify query|graphify path|graphify explain" .agents/skills/graphify/SKILL.md .agents/skills/graphify/references/query.md
```

Expected: all checks pass. The eight reference filenames are the files shipped by the verified `0.9.69` provenance commit.

- [ ] **Step 4: Reject unintended installer side effects**

Run:

```bash
git status --short
```

Expected: new files are confined to `.agents/skills/graphify/**`. If `.codex/hooks.json`, runtime files, Firebase/server files, or generated graph data appear, remove those unintended changes before continuing. Do not accept an automatic hook in this phase.

- [ ] **Step 5: Commit**

```bash
git add .agents/skills/graphify
git commit -m "chore: add project-local Graphify skill"
```

---

### Task 3: Build a fresh local graph without tracking generated artifacts

**Files:**
- Generated only, untracked: `graphify-out/graph.json`
- Generated only, untracked: `graphify-out/GRAPH_REPORT.md`
- Generated only, untracked: `graphify-out/graph.html`
- Generated sidecars under `graphify-out/` as produced by Graphify

**Interfaces:**
- Consumes: `.agents/skills/graphify/`, current branch source at a known HEAD.
- Produces: a fresh local graph queryable by `graphify query`, `graphify path`, and `graphify explain`; no tracked generated output.

- [ ] **Step 1: Capture the source revision and verify ignore policy**

Run:

```bash
git rev-parse HEAD
git check-ignore -v graphify-out/graph.json
```

Expected: HEAD SHA is printed and `graphify-out/graph.json` is ignored by the existing `.gitignore` rule.

- [ ] **Step 2: Build the graph with the pinned Graphify version**

Run:

```bash
uvx --from graphifyy==0.9.69 graphify .
```

Expected: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` exist; HTML may also be generated by default. If a docs semantic pass cannot run in the current host, do not fabricate it—record the limitation and ensure code AST extraction still completes.

- [ ] **Step 3: Smoke-test scoped graph commands**

Run:

```bash
uvx --from graphifyy==0.9.69 graphify explain "RepresentativePose4DV2"
uvx --from graphifyy==0.9.69 graphify query "How does RepresentativePose4DV2 feed Phase Space and what fallbacks remain?"
uvx --from graphifyy==0.9.69 graphify query "How is Film Space associated with local source video and how does missing video fall back?"
```

Expected: commands return scoped graph results rather than requiring a full raw-file scan. Results may contain EXTRACTED and INFERRED edges; neither is accepted as final implementation evidence yet.

- [ ] **Step 4: Verify generated outputs remain untracked**

Run:

```bash
! git ls-files graphify-out | grep -q .
git status --short --ignored graphify-out
```

Expected: no `graphify-out/**` path is tracked; generated files appear only as ignored content.

- [ ] **Step 5: Do not commit generated graph data**

No commit for `graphify-out/`. Proceed directly to Task 4 with the current graph available locally.

---

### Task 4: Source-verify the Phase Space / Film Space graph and preserve validation evidence

**Files:**
- Create: `docs/GRAPHIFY_VALIDATION_2026-09-27.md`

**Interfaces:**
- Consumes: fresh `graphify-out/graph.json`, query/path/explain results, current repository source.
- Produces: a compact validation matrix with `graph evidence`, `edge confidence`, `source verification`, and `status` for all ten design-spec targets.

- [ ] **Step 1: Create the validation matrix with all required targets**

Create `docs/GRAPHIFY_VALIDATION_2026-09-27.md` with these rows:

1. `RepresentativePose4DV2` definition and consumers.
2. 101 normalized phase → Phase Space rendering flow.
3. Joint trajectories and sparse ghost skeleton production/consumption.
4. `ready` / `deepestDip` / `rise` / `releaseProxy` / `followThrough` anchors.
5. Rotate / zoom / scrub interaction wiring.
6. SequenceViewer / Motion viewer fallback availability.
7. Film Space profile ↔ local source-video association.
8. Local cache and cleanup lifecycle.
9. Missing/deleted local-video safe fallback.
10. No raw-video server-upload path introduced by this Graphify work.

Use columns: `Target`, `Graph command/result`, `Confidence`, `Source path(s)`, `Verified status`, `Notes`.

- [ ] **Step 2: Query each target before reading broad source**

Use the smallest applicable command for each row:

```bash
uvx --from graphifyy==0.9.69 graphify query "<target question>"
uvx --from graphifyy==0.9.69 graphify explain "<symbol>"
uvx --from graphifyy==0.9.69 graphify path "<symbol A>" "<symbol B>"
```

Record whether relevant edges are `EXTRACTED`, `INFERRED`, or ambiguous.

- [ ] **Step 3: Verify every implementation-relevant claim against source**

For each row, open the exact source files named by Graphify and confirm the relationship directly. Mark status only as `confirmed`, `partial`, `contradicted`, or `unverified`; never upgrade an INFERRED edge to confirmed without source support.

- [ ] **Step 4: Verify the no-runtime/no-storage boundary**

Run:

```bash
BASE=$(cat .git/graphify-integration-base)
git diff "$BASE"..HEAD -- package.json pnpm-lock.yaml firestore.rules firebase.json server app lib
git diff --name-only "$BASE"..HEAD | rg -n "^(package\.json|pnpm-lock\.yaml|firestore\.rules|firebase\.json|server/|app/|lib/)" || true
```

Expected: no product runtime, Firestore, server, or application source change belongs to this Graphify integration.

- [ ] **Step 5: Verify validation completeness**

Run:

```bash
for term in RepresentativePose4DV2 "101 normalized" "ghost skeleton" ready deepestDip rise releaseProxy followThrough rotate zoom scrub SequenceViewer "Motion viewer" "local source" cache cleanup "missing/deleted" "raw-video"; do rg -qi "$term" docs/GRAPHIFY_VALIDATION_2026-09-27.md || { echo "missing: $term"; exit 1; }; done
rg -n "confirmed|partial|contradicted|unverified|EXTRACTED|INFERRED" docs/GRAPHIFY_VALIDATION_2026-09-27.md
```

Expected: every required target is represented and evidence/status terminology is present.

- [ ] **Step 6: Commit**

```bash
git add docs/GRAPHIFY_VALIDATION_2026-09-27.md
git commit -m "docs: validate Graphify against HoopHub architecture"
```

---

### Task 5: Final integration verification

**Files:**
- Verify only; modify files only to fix a discovered integration defect.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: evidence that the integration is project-local, reproducible, source-verified, and runtime-neutral.

- [ ] **Step 1: Verify project-local discovery and pinned version**

Run:

```bash
test -f .agents/skills/graphify/SKILL.md
test "$(cat .agents/skills/graphify/.graphify_version)" = "0.9.69"
rg -n "graphifyy==0\.9\.69|Graphify-Labs/graphify" AGENTS.md docs/AGENT_TOOLCHAIN.md docs/DEVELOPMENT_WORKFLOW.md
```

Expected: all checks pass.

- [ ] **Step 2: Verify graph commands against the local graph**

Run:

```bash
uvx --from graphifyy==0.9.69 graphify query "Where is RepresentativePose4DV2 consumed?"
uvx --from graphifyy==0.9.69 graphify explain "RepresentativePose4DV2"
```

Expected: both commands succeed using the generated graph.

- [ ] **Step 3: Verify generated artifacts are still ignored and untracked**

Run:

```bash
git check-ignore graphify-out/graph.json
! git ls-files graphify-out | grep -q .
```

Expected: both checks pass.

- [ ] **Step 4: Verify no prohibited integration changes from the recorded base**

Run:

```bash
BASE=$(cat .git/graphify-integration-base)
git diff "$BASE"..HEAD -- package.json pnpm-lock.yaml firestore.rules firebase.json server app lib
git log --oneline "$BASE"..HEAD
```

Expected: runtime/product/storage diff is empty. Integration history contains only policy/tooling/validation work; the already-approved spec and plan are outside the recorded implementation base.

- [ ] **Step 5: Run repository checks only if implementation touched non-doc/tooling config**

If any file outside `AGENTS.md`, `docs/**`, `.agents/**`, and the already-ignored `graphify-out/**` changed after the recorded base, run:

```bash
pnpm check
pnpm test:unit
```

Expected: both pass. If no such file changed, record `not required — tooling/docs-only diff` in the final report instead of running unrelated tests.

- [ ] **Step 6: Final review**

Compare the branch diff with `docs/superpowers/specs/2026-09-27-graphify-project-local-integration-design.md`. Confirm that post-commit hooks/CI refresh remain deferred, graph output remains advisory, no generated graph artifact is committed, and any environment limitation is stated precisely rather than hidden.
