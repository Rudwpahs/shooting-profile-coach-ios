# Claude C2 contract handoff — **C2 CONTRACT FREEZE**

Status: **C2 CONTRACT FREEZE** declared 2026-09-09.
From this commit on, no field name, type, enum value, pattern, cap or cross-field rule below changes
silently. A change requires an explicit migration commit that bumps the version or documents the delta,
plus notification to the UI lane (`work/claude-hoop-hub-product-ui`) and the backend/ML lane.

| Item | Value |
| --- | --- |
| Branch | `work/claude-hoop-hub-system-contracts` |
| Base | `plan/hoop-hub-ui-ai-motion-integration` @ `db129da7` |
| Worktree | `C:/Users/USER/Projects/shooting-profile-coach-ios-contracts` (isolated; the UI lane at `1957969` and the Codex MotionPacket branch were not touched) |
| Schema version | `1` (`schema_version: 1` on every request, response and feed event) |
| Sides | TypeScript (Zod 4, `lib/coach/contract.ts`) and Python (Pydantic 2, `ml/coach/src/formpath_coach/schemas.py`) |
| Proof of parity | `contracts/fixtures/coach/manifest.json`: 5 golden + 30 negative cases, run by both sides |

## 1. Commits (oldest first, all on top of `db129da7`)

| SHA | Unit |
| --- | --- |
| `cdf87a1` | A1 · merge `feat/formpath-coach-pytorch` @ `49a3524` (experimental scaffold; not a trained model) |
| `5dd85e3` | 1 · `CoachRequestV1` |
| `40877fa` | 2 · `CoachResponseV1` |
| `329bce1` | 3 · `CoachObservationV1` hardening (one source, one boundary, metric → unit) |
| `db1484a` | 3 · test typing fix |
| `0a5ad0c` | 4 · `PrimaryVisualCueV1` grounding, `parseCoachResponseForRequest`, `resolveCoachCueAnchor` |
| `0c23685` | 3/4 · metric refinement (`follow_through_elbow_angle_deg` replaces a constant phase span) |
| `79ed65e` | 5 · Pydantic ↔ Zod parity (Python V1 models, same paths and rules) |
| `892a006` | 6 · golden + negative cross-language fixtures, exported JSON Schemas, parity gates |
| `4d21998` | 7 · `RepresentativePose4DV2 → CoachObservationV1[]` adapter |
| `f485db9` | 8 · uncertainty cone → measurement confidence |
| `d401ec5` | 9 · Coach request privacy audit and serializer |
| `8eeff1b` | 10 · `CoachProvider` boundary |
| `e6f0dc2` | 11 · `DeterministicCoachProvider` |
| `784c29b` | 12 · `RemoteCoachProvider` with typed unavailable / cancel / stale |
| `b06599c` | 13 · `CoachFeedEventV1` |
| `ccc6144` | chore · ESLint ignores a local `ml/coach/.venv` |
| (this commit) | handoff · this document |

## 2. Frozen interfaces

All objects are **strict** (unknown keys rejected). Categories are closed enums. Free text is capped.
Nothing carries a position, a frame, a timestamp, a file, or a person.

### 2.1 Vocabulary

| Name | Values |
| --- | --- |
| `CoachConfidenceV1` | `very_low` · `low` · `medium` · `high` · `very_high` |
| `CoachPhaseAnchorV1` | `ready` · `deepestDip` · `rise` · `releaseProxy` · `followThrough` |
| `CoachJointV1` | the 12 persisted joints: `leftShoulder` `leftElbow` `leftWrist` `rightShoulder` `rightElbow` `rightWrist` `leftHip` `leftKnee` `leftAnkle` `rightHip` `rightKnee` `rightAnkle` |
| `CoachMetricV1` → unit | `release_elbow_angle_deg` → `deg` · `release_wrist_height_sb` → `shoulder_breadths` · `release_elbow_lateral_offset_sb` → `shoulder_breadths` · `release_shoulder_line_yaw_deg` → `deg` · `deepest_dip_knee_angle_deg` → `deg` · `follow_through_elbow_angle_deg` → `deg` · `follow_through_wrist_over_head_sb` → `shoulder_breadths` · `capture_quality` → `label` |
| `CoachUnitV1` | `deg` (−360..360) · `shoulder_breadths` (−10..10) · `label` (value is a code) |
| Observation `source` | `representative_phase_fused_4d` (the only V1 source) |
| Observation `boundary` | `representative_phase_fused_4d_estimate_not_actual_3d` (the only V1 boundary) |
| `player.handedness` | `left` · `right` · `unknown` |
| `player.skill_level` | `beginner` · `developing` · `advanced` · `null` |
| `player.training_goal` | `consistency` · `range` · `release` · `rhythm` · `null` |
| `context.action` | `set_shot` · `jump_shot` · `free_throw` · `unknown` |
| `context.capture_protocol` | `basic_1_plus_1` · `high_accuracy_3_plus_3` |
| `evidence_tier` | `A` `A-` `B+` `B` `C` `D` `H` |
| `locale` | `ko` · `en` |
| `provider.id` | `deterministic_v1` · `remote_formpath_coach_v1` |
| Core `do_not_infer` (always present) | `ground_reaction_force` · `joint_torque` · `muscle_activation` · `actual_metric_3d_position` |

Patterns: `request_id` `^req_[a-z0-9]{8,64}$` · observation `id` `^obs_[a-z0-9]+(?:_[a-z0-9]+)*$` (≤ 64) ·
stable codes `^[a-z][a-z0-9_]{0,63}$` · feed `event_id` `^evt_[a-z0-9]{8,64}$` · profile ids `^[A-Za-z0-9_-]{8,128}$`.

### 2.2 `CoachObservationV1`

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string | observation id pattern; unique within a request |
| `metric` | `CoachMetricV1` | closed |
| `value` | number \| string (≤ 64) | measured unit → number within the unit bounds; `label` → code |
| `unit` | `CoachUnitV1` | must equal the metric's unit |
| `reference` | string (≤ 120) \| null | required key |
| `measurement_confidence` | `CoachConfidenceV1` | |
| `source` | `representative_phase_fused_4d` | |
| `boundary` | `representative_phase_fused_4d_estimate_not_actual_3d` | |
| `phase_anchor` | `CoachPhaseAnchorV1` \| null | required for every metric except `capture_quality`, which must be `null` |
| `joints` | `CoachJointV1[]` (≤ 12, unique) | ≥ 1 for every metric except `capture_quality`, which must be `[]` |
| `caveats` | string[] (≤ 8 × 160) | |

### 2.3 `CoachRequestV1`

| Field | Type | Rule |
| --- | --- | --- |
| `schema_version` | `1` | |
| `request_id` | string | request id pattern; opaque, client-generated |
| `locale` | `ko` \| `en` | |
| `player` | `{ handedness, skill_level, training_goal }` | closed enums; no age, sex, height or any measurement |
| `context` | `{ action, capture_protocol, quality_passed: boolean, quality_reasons: code[] (≤ 8) }` | |
| `observations` | `CoachObservationV1[]` | 1..32, unique ids |
| `evidence` | `CoachEvidenceItemV1[]` | ≤ 16, unique `research_unit_id` (int ≥ 1); `claim` 1..300, `evidence_tier`, `source_title` (≤ 200 \| null), `supported_inferences` / `forbidden_inferences` (≤ 8 × 120), `limitations` (≤ 8 × 160), `contradiction_group` (≤ 64 \| null) |
| `recent_history` | code[] | ≤ 10; codes, never sentences |

### 2.4 `CoachResponseV1`

| Field | Type | Rule |
| --- | --- | --- |
| `schema_version` | `1` | |
| `request_id` | string | must equal the request it answers (grounding) |
| `observation_summary` | string[] | 1..6 × ≤ 160 |
| `hypotheses` | `{ statement (1..240), confidence, supporting_observation_ids (1..8, unique, must exist in the request), competing_explanations (≤ 4 × 160) }[]` | ≤ 3 |
| `confidence` | `CoachConfidenceV1` | |
| `coaching_comment` | string | 1..140, one line |
| `do_not_infer` | code[] | 1..12; must include the four core items |
| `drills` | `{ name (1..80), purpose (1..200), constraints (≤ 6 × 120), success_criteria (≤ 6 × 120), retest (1..200) }[]` | ≤ 2 |
| `retest_plan` | string[] | ≤ 4 × 160 |
| `evidence_used` | int[] | ≤ 16, unique, must exist in `request.evidence` |
| `primary_visual_cue` | `PrimaryVisualCueV1` \| null | |
| `provider` | `{ id, revision (1..64) }` | |

### 2.5 `PrimaryVisualCueV1`

`{ observation_id: string, label: string (1..40) }` — nothing else. `observation_id` **must** be one of
`request.observations[].id`. The app resolves where the cue lives with `resolveCoachCueAnchor(request, cue)`:
`{ kind: "joints", observation_id, label, joints, phase_anchor }` for a measured observation, or
`{ kind: "text_only", observation_id, label }` for the quality label, or `null` when unknown.
**No coordinates exist anywhere in the contract; a reply carrying any is rejected as a whole.**

### 2.6 `CoachProviderResult` (the UI boundary)

```ts
type CoachProviderResult =
  | { status: "ok"; response: CoachResponseV1 }
  | { status: "unavailable"; reason: "not_configured" | "offline" | "timeout" | "http_error" | "schema_invalid" | "grounding_invalid" | "provider_error"; retryable: boolean; detail: string | null }
  | { status: "cancelled" }
  | { status: "stale"; superseded_by: string };
interface CoachProvider { readonly id: "deterministic_v1" | "remote_formpath_coach_v1"; coach(request: CoachRequestV1, options?: { signal?: AbortSignal }): Promise<CoachProviderResult>; }
```

### 2.7 `CoachFeedEventV1` (product-side, TypeScript only)

| Field | Type | Rule |
| --- | --- | --- |
| `schema_version` | `1` | |
| `event_id` | string | event id pattern |
| `event_class` | `new_representative_profile` · `retest_comparison` · `quality_recapture_needed` | |
| `source` | `{ profile_id, retest_profile_id \| null }` | opaque ids |
| `request_id` | string | the `CoachRequestV1` it was built from |
| `observation_ids` | string[] | 1..32, unique |
| `primary_observation_id` | string \| null | must be one of `observation_ids` |
| `cue` | `PrimaryVisualCueV1` \| null | its `observation_id` must be one of `observation_ids` |
| `confidence` | `CoachConfidenceV1` | `very_low` when the coach was unavailable |
| `message` | string (1..140, one line) \| null | the provider's `coaching_comment`; `null` when unavailable |
| `evidence_summary` | string (1..120, one line) | e.g. `8 observations, confidence medium` |
| `eligibility` | `{ eligible: boolean, reasons: (coach_unavailable \| quality_recapture_needed \| confidence_below_medium \| no_visual_cue \| cooldown_active)[], cooldown_until_ms: int \| null }` | deterministic; cooldown 24 h |
| `created_at_ms` | int ≥ 0 | |

Ranking (`rankCoachFeedEvents`): eligible first, then higher confidence, then newer, then id.

## 3. Files and fixture paths

| Purpose | Path |
| --- | --- |
| TypeScript contract (Zod) | `lib/coach/contract.ts` |
| Python contract (Pydantic) | `ml/coach/src/formpath_coach/schemas.py` (V1 section; legacy scaffold models unchanged above it) |
| JSON Schema exports (Pydantic → file) | `contracts/coach-request-v1.schema.json`, `contracts/coach-response-v1.schema.json`, `contracts/coach-observation-v1.schema.json` — regenerate with `python -m formpath_coach.contract_export` from `ml/coach` |
| JSON Schema export (Zod → file) | `contracts/coach-feed-event-v1.schema.json` — regenerate with `pnpm exec tsx --tsconfig tsconfig.json scripts/export-coach-feed-event-schema.ts` |
| Cross-language fixtures | `contracts/fixtures/coach/manifest.json`, `contracts/fixtures/coach/golden/{request-basic,response-basic,observation-quality}.json` |
| Shared test builders | `tests/fixtures/coach-contract-fixtures.ts` (`observation()`, `request()`, `response()`; equal to the golden files by test) |
| Adapter | `lib/coach/representative-profile-adapter.ts` |
| Confidence mapping | `lib/coach/confidence-map.ts` |
| Privacy gate | `lib/coach/privacy.ts` |
| Provider boundary / providers | `lib/coach/provider.ts`, `lib/coach/deterministic-provider.ts`, `lib/coach/remote-provider.ts` |
| Feed event | `lib/coach/feed-event.ts` |
| Tests (TS) | `tests/coach-*.test.ts` (12 files, 162 tests) |
| Tests (Python) | `ml/coach/tests/test_contract_v1.py` (100), `ml/coach/tests/test_contract_fixtures.py` (44) |

## 4. Test results (2026-09-09, this worktree)

| Gate | Result |
| --- | --- |
| `pnpm check` | 0 errors |
| `pnpm lint` | 0 problems |
| `pnpm test:unit` | 692 passed, 1 skipped, 1 failed — `tests/pose-detection-v2-contract.test.ts` lockfile regex, CRLF working copy only; passes 56/56 against the LF lockfile from the git blob, as in CI |
| Coach suites (TS) | 162 passed across 12 files |
| `ruff check src tests` (ml/coach) | clean |
| `pytest` (ml/coach) | 223 passed (79 scaffold + 100 contract + 44 fixture/parity), offline |
| `expo export --platform web` | 20 static routes |

## 5. Exact interface the UI lane receives

```ts
import { buildCoachRequest } from "@/lib/coach/representative-profile-adapter";
import { resolveCoachCueAnchor, type CoachRequestV1, type CoachResponseV1 } from "@/lib/coach/contract";
import { createDeterministicCoachProvider } from "@/lib/coach/deterministic-provider";
import { RemoteCoachProvider } from "@/lib/coach/remote-provider";
import { isUsableCoachResult, type CoachProvider, type CoachProviderResult } from "@/lib/coach/provider";
import { buildCoachFeedEvent, rankCoachFeedEvents, type CoachFeedEventV1 } from "@/lib/coach/feed-event";

// 1. From a saved representative profile (never from raw capture):
const request: CoachRequestV1 = buildCoachRequest({
  profile, shootingHand, requestId: "req_" + opaqueHex, locale: "ko",
  player: { skillLevel, trainingGoal }, action: "jump_shot", evidence: [], recentHistory: [],
});

// 2. One provider boundary; the UI does not care which is active.
const provider: CoachProvider = url ? new RemoteCoachProvider({ url }) : createDeterministicCoachProvider();
const result: CoachProviderResult = await provider.coach(request, { signal });

// 3. Only `ok` is usable; every other status keeps Reel, Motion Lift and Save working.
if (isUsableCoachResult(result)) {
  const cue = result.response.primary_visual_cue;
  const anchor = cue ? resolveCoachCueAnchor(request, cue) : null;   // joints + phase anchor, or text-only, or null
}

// 4. Home decides from the event, not from prose:
const event: CoachFeedEventV1 = buildCoachFeedEvent({ eventId, profileId, request, result, now: Date.now(), lastEventAtMs });
const feed = rankCoachFeedEvents(events).filter((item) => item.eligibility.eligible);
```

Rules the UI must keep: highlight only `anchor.joints` at `anchor.phase_anchor`; render `coaching_comment` /
`event.message` as one line; put hypotheses, evidence, `do_not_infer`, drills and retest behind an explicit
detail action; show nothing from the coach when the result is not `ok`.

## 6. Changed files and declared shared-file changes

Created: `contracts/**`, `lib/coach/**` (8 modules), `tests/coach-*.test.ts` (12), `tests/fixtures/coach-contract-fixtures.ts`,
`scripts/export-coach-feed-event-schema.ts`, `ml/coach/src/formpath_coach/contract_export.py`,
`ml/coach/tests/test_contract_v1.py`, `ml/coach/tests/test_contract_fixtures.py`, this document.

Modified: `ml/coach/src/formpath_coach/schemas.py` (V1 section appended; legacy models unchanged),
`ml/coach/pyproject.toml` (dev extra `jsonschema>=4.23` for the parity gate),
`eslint.config.js` (ignore `ml/**/.venv/**`, declared here as the one shared-file change).

Merged: `feat/formpath-coach-pytorch` @ `49a3524` into this branch (no conflicts; nothing outside `ml/coach`).
It stays an experimental scaffold: no corpus, no RAG, no trained weights, no mobile bridge.

Not touched: `lib/reels/motion-packet-v1.ts`, Firestore rules, public reel persistence, RAG/corpus ingestion,
model training, PR #4 reconstruction math, `app/**`, `components/**`, `hooks/**`, `package.json`, `pnpm-lock.yaml`,
`app.config.ts`, `lib/shooting-profile/types.ts`, the UI lane branch, the Codex branches.

## 7. Safety properties, each pinned by a test

- A reply cannot place anything: no coordinate field exists; extra keys anywhere reject the whole reply.
- `primary_visual_cue.observation_id` must be an observation the request contained (`cue_observation_unknown`).
- Forces, torques, muscle activation and metric 3D positions are not metrics and are always declared not inferred.
- Every observation carries `representative_phase_fused_4d_estimate_not_actual_3d`; no other boundary exists in V1.
- A request never carries raw video, face or MediaPipe landmarks, native `z`, file names or URIs, the 101-frame
  evidence, capture-attempt metadata or covariance: strict schemas, the name-based privacy audit and the size caps
  all refuse them, and the remote provider never sends a request that fails either.
- Confidence only ever goes down: cone → band, capped by capture mode and by the quality gate; the deterministic
  reply is capped at medium and by its primary observation.

## 8. Next

- UI lane: create the integration worktree from `work/claude-hoop-hub-product-ui` @ `1957969`, merge this branch,
  replace `lib/feed/reel-fixtures.ts` coach text with `buildCoachFeedEvent` output and `resolveCoachCueAnchor`.
- Backend/ML lane (when advanced Codex returns): implement the remote service against
  `contracts/coach-request-v1.schema.json` / `coach-response-v1.schema.json`; the FastAPI scaffold still speaks the
  legacy models and must adopt `CoachRequestV1` / `CoachResponseV1` before it is wired.
- Contract change requests: none open.
