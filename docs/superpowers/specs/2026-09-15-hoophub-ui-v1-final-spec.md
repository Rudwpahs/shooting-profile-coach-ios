# Hoop Hub UI v1 Final — specification (owner master prompt, 2026-09-15)

This is the owner's implementation prompt, restructured without changing its requirements. The plan in
`docs/superpowers/plans/2026-09-15-hoophub-ui-v1-final.md` argues from this document and from the audit in
`docs/uiux/2026-09-15-ui-v1-final-audit.md`. This is an implementation task, not a redesign: the visual
direction is owner-approved and frozen.

## 0. Non-negotiable safety rules

Never: merge into `main`; push directly to `main`; force-push shared branches; weaken reconstruction,
privacy, validation or rollout gates; silently modify shooting-analysis mathematics; modify thresholds to
make UI or tests pass; redesign the product from scratch; reintroduce a light dashboard / card-heavy
aesthetic; create fake production social features; invent fake user accounts or data in production paths;
expose raw video, raw pose landmarks, filenames, URIs, paths, faces or identifying evidence; remove or bypass
current feature flags; activate Representative V2 when release-validation policy says it must remain
disabled. All work stays isolated until owner review.

## 1. Workflow

Read repository root instructions first (`AGENTS.md`, `CLAUDE.md`; `SKILL.md` if present) — they take
highest priority. Apply the Superpowers workflow (using-superpowers, writing-plans,
test-driven-development, verification-before-completion, finishing-a-development-branch). Do not restart
brainstorming. Create an implementation plan first, then execute it with TDD where appropriate.

## 2. Source of truth

Latest `main` is authoritative for application behaviour. PR #5 (`feat/uiux-skeleton-social-redesign`,
head `d00048d`) is authoritative only for the approved UI direction and is a design/reference donor, never
blindly merged. All current safety and validation behaviour on latest `main` (including the Representative
V2 rollout gate) must survive.

## 3. Branch

Start from latest clean `main`. Branch `work/hoophub-ui-v1-final`. Do not base on the PR #5 branch. Port and
rebuild the good UI concepts selectively, adapted to the current architecture. Never merge without owner
approval.

## 4. Frozen product design

Visual identity: Direction **Graphite / Volt**. Default experience: **dark**. Primary product identity: the
athlete's shooting skeleton, not the face. Feel: a modern sports product, an Apple-quality motion tool, an
Instagram-like visual feed. Not: a statistics dashboard, a scientific control panel, an enterprise SaaS app,
a text-heavy coaching report, a generic fitness app.

## 5. Governing principles

**Motion first. Skeleton first. Text second.** **Instagram density, not dashboard density.** The skeleton
occupies most of the visual space; no unnecessary cards, labels, borders, legends, paragraphs or chrome
around it.

## 6. Information architecture

Bottom navigation conceptually: 1 Home · 2 Explore · 3 Capture · 4 Profile. Capture is the visually
important central action. Icons in the navigation; visible text labels minimal; accessibility labels must
exist. Hidden/internal routes may stay hidden; do not delete working routes because they are not in the bar.

## 7. Five core experiences

Home, Explore, Capture, Analysis, Profile — one product flow. Primary journey: Home → Capture → processing →
Analysis → Profile/history. Secondary: Home/Explore → skeleton → inspect → future compare/save. Do not
implement nonexistent social backend capabilities to complete the secondary flow.

## 8. Home

A motion feed. Priority: skeleton/motion, minimal identity/context, one useful coaching or progress signal.
Avoid dashboards, metric grids above the fold, paragraphs, nested cards, explanatory blocks. A feed item has
approximately one concise textual statement; the skeleton dominates. Reuse the approved post-like player
concepts from PR #5. Tap motion area → pause/resume; clean scrubber where appropriate; minimal chrome. No
faces by default.

## 9. Explore

For discovering shooting-form references and, eventually, other athletes' opted-in skeletons. For v1: do
not fabricate a social network; production code must not pretend public athlete skeleton data exists.
Allowed: empty states, legitimate internal/reference data, development-only fixtures, explicitly marked demo
fixtures in development/testing. Development fixtures never leak into production. Establish the visual
pattern that later supports reference discovery, opt-in skeletons, compare, save — without fake backend.

## 10. Capture (very important)

Do not copy the old capture screen from PR #5. Inspect the current capture architecture on latest `main`.
Preserve: current validation, camera/library provenance rules, consent rules, V2 feature flags, capture
state machine, recapture states, privacy boundaries, on-device pose processing boundaries, Representative V2
release/validation behaviour. The UX must be able to support future explicit camera-yaw guidance (a possible
dual-oblique protocol, e.g. left/right oblique around ±45°) **but must not hard-code an unvalidated ±45°
requirement into production logic** unless current authoritative code already defines it. Separate
**capture protocol data** from **capture presentation** so guidance such as front / shooting side / left
oblique / right oblique renders from configuration/metadata, not layout assumptions. The experience is
extremely simple: 1 where to stand, 2 where to put the camera, 3 shoot, 4 accept or recapture. Technical
failure reasons may exist internally; the user gets short, actionable recapture guidance.

## 11. Analysis

Progressive disclosure. Layer 1: one clear overall result / most important finding. Layer 2: a few key
visual measurements or motion differences. Layer 3: evidence, detailed values, uncertainty, technical
information. Understandable in seconds: one primary finding, one visual highlight on the skeleton/motion,
concise coaching language — not fifteen metric cards. Do not overstate confidence; if the engine says data
quality is insufficient, communicate recapture. Preserve existing typed failure/reason states.

## 12. Profile

The skeleton is the identity. Priority: skeleton hero/motion loop; a very small set of meaningful numbers;
current training goal/progress; shooting history/grid. No conventional social-profile clutter; no face
avatar. PR #5's direction (skeleton hero, two numbers, one goal line, motion grid) is the reference. Adapt to
current data contracts. Do not weaken owner-bound loading/deletion/privacy behaviour.

## 13–14. Features that must not be faked; Progress / Saved / Compare

Not to be represented as functional without backend capability: public user feed, follow system, DMs,
PROGRESS social system, SAVED cloud collection, skeleton compare without a real engine, likes/comments,
public ranking, athlete discovery. Prefer omission over fake interactivity; component boundaries or
placeholders are acceptable only where architecture requires them.

## 15. Bars

Minimal navigation. No `expo-blur` or any new dependency for translucency; flat Graphite surfaces. Compact
top bar. Bottom bar must not cover important motion content. Respect iPhone safe areas.

## 16–17. Typography and colour

Platform-quality readability; existing/system typography; no excessive hierarchy; typography supports
motion. Retain Graphite / Volt; centralise semantic tokens; no scattered hard-coded colours; maintain
contrast; any new token has a semantic reason; no second accent palette.

## 18. Skeleton rendering

One reusable skeleton renderer (not per-screen implementations) supporting current data types including
representative and motion forms. May distinguish observed/derived joints, shooting arm, uncertainty/quality,
recapture state — without noise. Readable at feed scale and profile hero scale.

## 19. Responsive target

Mobile/iPhone. Validate visually at ~375 pt, ~390–393 pt, and ~430 pt where practical. Web export is a
development surface, not the layout target.

## 20. States

Loading, empty, signed out, signed in, processing, success, recapture required, permission denied, no data,
partial data, long/Korean text, safe areas — using current application contracts, without redesigning state
logic.

## 21. Accessibility

Retain or improve labels, hit targets, VoiceOver labels, state announcements, contrast, dynamic-text
resilience. Icon-only navigation still has accessible labels.

## 22. Protected areas

Reconstruction mathematics, cross-view geometry, phase alignment, uncertainty thresholds, quality thresholds,
representative profile contract, codec rules, privacy boundaries, Firestore security rules, rollout
certificate rules, consent/provenance behaviour. If a UI problem seems to require changing one: stop and
document the conflict.

## 23. Testing

TDD where behaviour changes. Preserve or add coverage for navigation (four destinations, capture action,
hidden routes), Home (feed renders, minimal text hierarchy, empty state), Explore (empty/reference state, no
fixture leakage), Capture (states render, consent/validation reachable, recapture copy from typed reasons,
no gate bypass), Analysis (complete, recapture/insufficient, progressive disclosure), Profile (signed out/in,
hero, history/grid, owner-bound state), design system (tokens, no uncontrolled literals, WCAG contrast). Test
contracts and behaviours, not blind snapshots.

## 24–25. Visual QA and dev fixtures

Actual screenshots from the real implementation for Home, Explore, Capture, Analysis, Profile at mobile
width, with alternative states where practical (Capture recapture, Analysis complete, Analysis insufficient,
Profile signed out/in). Deterministic development-only fixtures are allowed: clearly isolated, impossible to
ship as production user content, no real person's data, no raw video, no fake production network calls,
explicitly named demo/dev fixtures.

## 26. Performance

No obvious unnecessary rerenders; do not render every historical motion at once or decode large datasets
for offscreen cards; no expensive work in render paths; reuse existing playback lifecycle; no premature
virtualisation.

## 27. Phases

1 Audit (compare `main` vs PR #5; do not code blindly) · 2 Design system · 3 Navigation shell · 4 Core
screens · 5 Cross-screen consistency · 6 Visual QA with self-review (excess text, dead space, tiny skeletons,
dashboard cards, padding, safe areas, duplication, metrics above motion, hierarchy) · 7 Full regression
(typecheck, lint, unit, Firestore rules if normal CI, Expo web export, UI contract tests, Representative 4D
CI-equivalent tests) — no success claims without fresh output.

## 28. Acceptance criteria

Skeleton is the visual identity; no generic dashboard feel; Graphite / Volt consistent. Home: motion
dominates, clean, minimal text. Explore: future structure understandable, no fake social functionality.
Capture: dramatically simpler, safety gates function, adaptable to future yaw protocols. Analysis: primary
finding in seconds, evidence available without overwhelming, insufficient quality → recapture. Profile:
skeleton hero dominant, history understandable, no face identity. Engineering: latest-`main` logic
preserved, tests pass, no science thresholds weakened, no privacy boundary weakened, no raw identifying
motion evidence added, production fixtures clean, branch not merged.

## 29. Deliverables

A Branch · B Final commit SHA · C What changed (design system, Home, Explore, Capture, Analysis, Profile) ·
D What was intentionally not implemented · E Verification (exact command + result, with counts) · F Visual
evidence paths · G Remaining blockers · H Diff safety audit (reconstruction math, analysis thresholds,
privacy contracts, Firestore rules, rollout gating, consent/provenance — expected `No` each).

## 30. Stop condition

Do not merge; do not mark PR #5 merged; do not call the UI permanently finalised. Stop when
`work/hoophub-ui-v1-final` is implementation-complete, fully verified, visually documented and ready for
owner review.

**North star:** open the app, see motion immediately, understand your biggest shooting issue quickly, record
another shot easily. A living shooting profile, not a report generator.
