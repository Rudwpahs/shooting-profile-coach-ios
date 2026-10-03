# Visibly different shot library, one-per-screen Explore, minimal analysis

> **For agentic workers:** execute task by task with superpowers:test-driven-development. Steps use checkbox syntax.

**Goal:** make the 24 preview shot forms differ at a glance, turn Explore into a one-item-per-screen feed without view chips, and open a minimal analysis surface from Explore.

**Architecture:** the synthetic generator gains pose-level style parameters that survive pelvis-centring and phase normalisation; archetypes are redesigned around release-pose differences and gated by a glyph-space threshold. Explore reuses the Reels feed (vertical paging, active-item playback) over the explore source, loading records progressively. The analysis route gains a `presentation=minimal` mode: one stage, one caption, the phase line, details behind one sheet.

**Tech stack:** Expo SDK 54, expo-router 6, react-native-web, vitest 2 (node + jsdom).

**Owner feedback (2026-10-03):** "24개 슛폼이 다 똑같은 모양인데 이름만 다르고", "탐색은 … 한 화면에 하나씩", "탐색에 측면 사선 이런건 왜 있는거야", "탐색에서 하나 선택해서 눌렀을때 나오는 창의 ui를 미니멀화". Decisions: synthetic only (user videos stay Film-only), all three changes in one lane, merge to main after verification.

## Global constraints

- No `Math.random`, no clock dependence in the library; same id → same profile.
- Default style reproduces the canonical fixture bit-for-bit (all synthetic-based suites unchanged).
- Preview content stays behind the literal gate; production export grep stays at 0 hits.
- Evidence boundary copy unchanged: synthetic preview examples, never measured 3D.
- No real player names. Reels route (from Home) keeps its behaviour unless a change is required.

## Measured baseline (2026-10-03, `.playwright-mcp/probe-release.ts`)

Release-frame max joint displacement vs canonical: 3–7 % of body height for most archetypes; 245 of 276 pairs under 10 %; closest pair 1.7 %. On a ~100 px tile that is 2–7 px: numerically distinct, visually identical.

---

### Task 1: visibly different archetypes

**Files:**
- Modify: `tests/fixtures/synthetic-landmark-sequence.ts` (new style fields: `legExtension`, `torsoTurn`, `forearmForward`, `offHandFlare`, `footStagger`; defaults = canonical)
- Modify: `lib/preview/preview-shot-library.ts` (24 pose-distinct archetypes)
- Test: `tests/preview-shot-library.test.ts` (glyph-space distinctness), existing suites stay green

**Acceptance (test):** for every pair, in the oblique glyph the Profile tile draws, max joint displacement at the release frame ≥ 0.12 of the glyph's body height, and the mean joint displacement over the five anchor frames ≥ 0.04. Every archetype still reconstructs through the unchanged pipeline.

- [x] Write the failing test; run `corepack pnpm vitest run tests/preview-shot-library.test.ts` → failed at 3.5% (canonical vs compact).
- [x] Add style fields with canonical defaults (`legExtension`, `torsoTurn`, `forearmForward`, `offHandFlare`, `footStagger`, `offHandDrop`, `freeLegLift`); generator suite unchanged.
- [x] Redesign the archetypes around four families; measured closest pair 13.1% at release, 2.2% mean. Envelope notes: a bone horizontal in both views cannot be solved; forward arm directions and shoulder turn fail release detection; a lifted leg tolerates lean-forward, tuck, side lean and stagger-back only.
- [x] Commit `fac970c`.

### Task 2: Explore as a one-per-screen feed

**Files:**
- Create: `lib/explore-feed.ts` (progressive ReelItem loading from the explore source)
- Modify: `lib/explore-source.ts` (entries expose `reel(): Promise<ReelItem>` and a title/line)
- Modify: `lib/reels/reel-model.ts` (optional `title`/`line` on a profile reel), `components/reels/reel-overlay.tsx` (optional close, optional chips), `components/reels/reels-feed.tsx` (pass-through)
- Modify: `app/(tabs)/explore.tsx` (feed inside the tab, measured size, no chips)
- Tests: `tests/explore-feed.test.ts` (new), `tests/reel-model.test.ts`, `tests/reels-render.test.tsx`, `tests/ui-navigation.test.ts`, `tests/preview-shot-surfaces.test.ts`

**Acceptance:** Explore renders `ReelsFeed`, one item per viewport, no view chips, no close control; items load progressively (active + 2 ahead) without blocking the first paint; tapping 분석 opens `/private-analysis/<id>?presentation=minimal`; production still lists only the anonymous reference.

- [x] Failing tests for the feed model and the overlay variants → implement → green.
- [x] Rewrite `explore.tsx`; update the source pins; green.
- [x] Commit `6b19da9`.

### Task 3: minimal analysis presentation

**Files:**
- Create: `lib/shooting-profile/analysis-presentation.ts` (param → `"full" | "minimal"`)
- Create: `components/analysis/minimal-analysis.tsx` (stage + caption + phase line + 자세히 sheet holding the existing inspection surface, details and evidence)
- Modify: `app/private-analysis/[id].tsx` (reads the param, renders the minimal surface)
- Tests: `tests/analysis-presentation.test.ts`, `tests/minimal-analysis-render.test.tsx`

**Acceptance:** with `presentation=minimal` the route shows one stage, one caption, back control, five phase markers and a 자세히 button; the sheet exposes Motion/Phase/Film, details and evidence unchanged; without the param the full layout is byte-identical.

- [x] Failing tests → implement → green (`tests/analysis-presentation.test.ts` 5, `tests/minimal-analysis-render.test.tsx` 4). Commit: see git log.

### Task 4: verification and integration

- [ ] `corepack pnpm check`, `corepack pnpm lint`, `corepack pnpm test:unit`.
- [ ] Production isolation export grep (0 hits), preview export.
- [ ] Pages workflow branch list; push; CI; public-URL QA: tiles visibly different (screenshot + glyph metric in-browser), Explore paging, minimal analysis.
- [ ] PR → main (merge commit), post-merge verification, report.
