# Codex backend AI handoff

Date: 2026-09-09 (Asia/Seoul)

## Branch and source

- Branch: `work/codex-hoop-hub-backend-ai`
- Base: `work/claude-hoop-hub-system-contracts` at `fd4d1457a7a726e4710a7b84b69e1c46b590e45f`
- Pushed implementation commit: `ec81311e5ea62ad67ab6157af7106788226842f7`
- Remote: `origin/work/codex-hoop-hub-backend-ai` points to the same SHA.
- Claude UI branch `d5403cf6e8110e36fb010bb6b284d9ceed594e59` was read-only and not modified.

## Implemented (B1)

- Public MotionPacket V1 codec: fixed versioned header, 12 canonical joints,
  shooting hand, canonical phase/anchor metadata, int16 XYZ quantisation,
  deterministic round trip, strict malformed-input rejection, and visual-error
  tests. Private uncertainty, covariance, masks and capture evidence are not in
  the public format.
- Reel social persistence: strict `reelPosts` and owner-scoped `savedReels`
  contracts, minimal video/MotionPacket references, privacy revoke/reopen,
  bounded public feed queries, stale-save removal, and additive Firestore rules.
- Authenticated Coach V1 boundary: Firebase ID-token verification, project pin,
  revoked-token check, body-size cap, strict JSON/frozen Pydantic validation,
  per-UID rate limiting, in-flight capacity, timeout cancellation, redacted
  errors, and response grounding validation.
- Expo transport: HTTPS/loopback policy, bearer injection, redirect rejection,
  cancellation and bounded error mapping through the frozen remote-provider API.
- `deterministic_v1` provider emits a schema-valid, grounded response with the
  required do-not-infer list. This is wiring/contract baseline code, not a model.

## Verification evidence

- Python `pytest ml/coach/tests -q`: **259 passed**, 2 dependency deprecation warnings.
- Focused service/security suite: **36 passed**, 2 dependency deprecation warnings.
- TypeScript MotionPacket, social, and auth tests: **80 passed**.
- Firestore emulator: existing C2 suite **42 passed** + social suite **25 passed**
  (**67/67**).
- `corepack pnpm exec tsc --noEmit`: passed.
- Ruff for `ml/coach/src` and tests: passed.
- ESLint for all new/owned TypeScript files: 0 errors (after import cleanup).
- No model weights were downloaded and no long-running training run was executed.

## Experimental / not implemented

- FormPath research corpus ingestion: **0 canonical research units in this
  repository**; the referenced ~1000-source corpus is not packaged here.
- Retrieval/RAG embedding index and evidence resolver: **0 indexed documents**;
  no retrieval pipeline or citation resolver exists in this B1 commit.
- Scenario generation, train/dev/held-out evaluation: **0 generated scenarios**.
- QLoRA/SFT model run: **no run artifact, metrics, VRAM/runtime measurement, or
  trained adapter**. Existing `train_sft.py` remains a scaffold only.

## Integration configuration for Claude UI

Instantiate the existing frozen `RemoteCoachProvider` with
`createAuthenticatedCoachTransport` and the same `/v1/coach` endpoint. Use the
app's Firebase Auth `currentUser.getIdToken()`; never ship a service key. Deploy
the Python app from `formpath_coach.service_v1:create_app` behind TLS with:

```text
FORMPATH_COACH_FIREBASE_PROJECT_ID=<same Firebase project as the app>
GOOGLE_APPLICATION_CREDENTIALS=<server-only service-account path>
# or FORMPATH_COACH_USE_ADC=1 in a workload with Application Default Credentials
```

Do not set `FIREBASE_AUTH_EMULATOR_HOST` in production. The app defaults to
`POST /v1/coach`, a 64 KiB request cap, 6-second provider timeout, 10 requests /
60 seconds / UID, and 32 concurrent requests. A native device cannot use the
development PC's `localhost`; provision a real HTTPS host or an explicitly
configured loopback test transport.

## Remaining blockers / next gates

1. B2 must ingest the complete FormPath corpus with provenance/evidence IDs,
   build retrieval, and generate schema-valid scenarios with held-out evaluation.
2. Only after B2 is green, run a small QLoRA/SFT experiment and preserve its
   artifact, metrics, measured VRAM/runtime, frozen-schema rate, grounding rate,
   and unsupported-inference rate (B3).
3. Provision production Firebase Admin credentials, TLS endpoint, observability,
   and deployment secrets outside the repository; then connect the Claude UI.

Working tree note: Git reports `pnpm-lock.yaml` as modified only because the
Windows checkout normalizes line endings; `git diff --numstat` is empty and the
file was intentionally excluded from the commit.
