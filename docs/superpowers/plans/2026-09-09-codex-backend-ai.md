# Codex backend/AI execution

User-authorized isolated branch `work/codex-hoop-hub-backend-ai` starts at
`fd4d1457a7a726e4710a7b84b69e1c46b590e45f`. Read-only UI reference:
`d5403cf6e8110e36fb010bb6b284d9ceed594e59`.

C2 contract/fixtures, representative adapter, confidence semantics, Claude UI and
PR #4 reconstruction math are frozen. Required changes there get a migration
proposal only. No direct main updates or deployments.

## Ownership and gates

| Lane | Exclusive files |
| --- | --- |
| B1-A | `lib/reels/motion-packet-v1.ts`, matching test, codec document |
| B1-B | `lib/reels/social-{contract,persistence}.ts`, reel-social unit/emulator tests, additive social blocks in `firestore.rules`, social document |
| B1-C | Python `api.py`, new `service_v1.py`, `security.py`, `provider_v1.py`, their tests and legacy API-test migration, service document |
| Coordinator | new authenticated transport + tests, package/environment setup, gate integration, plan/handoff |

1. B1 parallel implementation, followed by serial review, frozen compatibility,
   privacy tests, actual Firestore emulator, unit/typecheck/lint, commit and push.
2. Only after B1 green: B2 parallel corpus ingestion, RAG/evidence resolver, and
   scenarios/evaluation, with exclusive module ownership declared before dispatch.
   Serial B2 gate checks provenance, consistent IDs, duplicates/conflicts and
   held-out evaluation before training.
3. B3 serial: inspect real hardware and model config, run a small, short SFT/QLoRA
   experiment, preserve outputs/metrics/VRAM/runtime. Measure frozen schema,
   unsupported inference and evidence grounding; a failed gate blocks scaling.

`trained` requires an actual run artifact, metrics and committed handoff. Final
handoff distinguishes implemented, experimental and blocked work and gives the
UI endpoint and configuration without editing Claude's branch.
