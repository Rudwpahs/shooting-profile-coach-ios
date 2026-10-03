# Hoop Hub AI Product Architecture — Source of Truth

Status: **LOCKED FOR MVP DIRECTION**
Effective date: **2026-10-04**

> This document is the canonical product-level AI architecture for Hoop Hub.
> Any future work touching Motion/Pose, Coach, Decision Core, Miner/HoopDB integration,
> inference deployment, personalization, or AI cost must read this document first.
> If an older design/spec conflicts with this document on product topology or deployment
> direction, this document wins unless a later reviewed decision record explicitly supersedes it.

## 1. MVP product scope

The first public product is a **basketball shooting-analysis app**.

The user experience is intentionally narrow:

```text
record/select a shooting video
  -> analyze the shot
  -> identify the most important issue(s)
  -> explain the evidence
  -> give a drill/cue
  -> retest on the next shot/session
```

Do **not** expand the MVP into dribbling, defense, pick-and-roll, full-game understanding,
or a general basketball chatbot merely because Miner collects broader basketball knowledge.
Those are later product expansions.

## 2. There are two product AI systems in the MVP

### AI #1 — Motion AI: "See"

Purpose: convert local shooting video into measured/estimated motion evidence.

Responsibilities include, where supported by validated evidence:

- shooter/pose detection;
- local pose landmarks;
- shot-event/phase detection;
- the existing normalized 101-phase representation;
- ready / deepestDip / rise / releaseProxy / followThrough anchors;
- joint trajectories, timing, geometry, confidence and evidence grade;
- structured shot evidence for downstream coaching.

The Motion AI **does not coach** and does not invent biomechanics that were not measured.

### AI #2 — Shot Coach AI: "Judge + Coach"

Purpose: consume structured shot evidence and return a grounded coaching result.

It owns the complete user-facing coaching decision:

- primary issue;
- secondary issues when justified;
- `do_not_change`;
- diagnosis confidence;
- supporting observation IDs;
- relevant canonical basketball evidence;
- short explanation;
- cue/drill;
- retest instruction.

The Shot Coach is **one product AI system**, even if its implementation contains several
internal modules.

## 3. Decision Core is not a third AI

`Decision Core` is an internal component of **AI #2 Shot Coach**.

Its role is to reduce ambiguity before natural-language generation:

```text
structured shot evidence
  -> Decision Core
       primary_issue
       secondary_issue[]
       do_not_change[]
       diagnosis_confidence
       supporting_observation_ids[]
       required_evidence_topics[]
       contradictions[]
  -> curated HoopDB evidence
  -> explanation / drill / retest
```

Do not count Decision Core as a separate user-facing AI product.

A language model may phrase or explain the diagnosis, but it must not silently replace a
Decision Core diagnosis with an unsupported alternative.

## 4. Personalization is not a third MVP AI

At initial release, personalization is **context fed into Shot Coach**, not a separate model.

Later inputs may include:

- prior shot evidence;
- prior recommendations;
- retest outcomes;
- player goal;
- repeated measured trends.

Personalization may become a more independent subsystem only after enough longitudinal
evidence exists to justify it. Do not create a third AI just to add memory/history.

## 5. Miner and HoopDB are the knowledge factory, not another product AI

Miner may continue collecting **broad basketball knowledge**, including areas beyond shooting.

The MVP app, however, consumes only the canonical units relevant to shooting/coaching that
have passed the review/distillation pipeline.

Required boundary:

```text
public sources
  -> Miner candidates
  -> review / dedupe / provenance / contradiction preservation
  -> canonical HoopDB / Coach knowledge
  -> Shot Coach
```

Forbidden boundary:

```text
raw Miner candidate
  -> direct user prescription
```

Miner breadth is future leverage; it is **not** permission to broaden the initial app scope.

## 6. Local-first runtime is the default architecture

Routine shot analysis must be designed to avoid recurring per-analysis cloud-AI cost.

### Must stay on device by default

- raw shooting video;
- pose/motion extraction;
- phase/event processing;
- routine shot diagnosis when technically feasible;
- routine coaching output when technically feasible;
- local film/cache data already governed by product privacy rules.

### Server/cloud may be used for

- account/authentication;
- compact derived profile/history sync;
- model/knowledge-pack distribution;
- optional future advanced reasoning that is explicitly justified;
- training, evaluation, distillation and model production.

**Routine MVP analysis must not require a hosted LLM/API call.**

The cost target is:

> **normal shot analysis = approximately zero marginal cloud-AI inference cost**

Raw video upload is not authorized by this architecture.

## 7. Training can be heavy; shipping inference should be small

Central development hardware/servers may run larger models for:

- teacher generation;
- SFT/QLoRA experiments;
- evaluation;
- knowledge distillation;
- verifier experiments;
- model conversion.

The shipping app should receive the smallest validated runtime that meets the quality bar.

Therefore:

- Qwen3-4B remains a useful **training/benchmark candidate**;
- Qwen3-4B is **not automatically the phone runtime**;
- a distilled/quantized smaller Student may be the shipping Coach;
- a deterministic Decision Core + compact local knowledge pack + templated/local generator
  is also acceptable if it beats a larger model on quality/cost/reliability;
- model size is selected empirically on target devices.

Do not force a 4B model onto iPhone merely because the training scaffold uses 4B.

## 8. Chat is optional UI, not the product architecture

Hoop Hub is not primarily a chatbot.

The default UI is:

```text
shot
 -> analysis result
 -> evidence
 -> what to fix
 -> drill
 -> retest
```

A future `Ask Coach` interaction may expose the same Shot Coach through chat/voice, but it
must use the same grounded evidence and cannot become a separate source of unverified diagnosis.

## 9. Evidence boundary remains mandatory

The existing evidence discipline still governs both AI systems.

Do not claim:

- force/torque/muscle activation from visible pose alone;
- synchronized physical time from separate shots;
- metric/actual 3D from monocular or phase-fused estimates;
- actual 4D when the representation is a normalized phase estimate;
- causal coaching effects from one before/after pair.

Low-confidence or contradictory motion evidence must lower diagnosis confidence or fail closed.

## 10. Current repository reality

As of the effective date:

### Already aligned

- iOS MediaPipe pose inference runs locally in the native FormPath pose module.
- Raw shooting video is not part of the normal cloud-analysis path.
- 101-phase motion representation and evidence boundaries already exist.
- Coach request/response contracts and an experimental PyTorch/Qwen scaffold exist.
- canonical Coach corpus assets exist in the repository.

### Not yet complete

- perception -> structured Coach request bridge;
- production Decision Core;
- complete curated retrieval path for each request;
- trained/approved Coach runtime;
- mobile on-device Coach packaging;
- end-to-end app integration of the real Coach;
- target-iPhone latency/memory/thermal/battery validation.

Existing fixed recommendation tables are temporary/fallback product logic; they are not the
final Shot Coach intelligence.

## 11. Implementation order from the current codebase

Do not rewrite working Motion/Film/Phase code to implement this architecture.

### Phase A — Freeze the product contracts

Define one typed boundary between AI #1 and AI #2:

```text
ShotEvidence
  -> ShotCoachRequest
  -> ShotCoachResponse
```

The response must contain diagnosis, confidence, evidence references, drill/cue and retest.

### Phase B — Implement and benchmark the Decision Core

Start deterministic and testable.

Compare:

1. deterministic/rule + canonical knowledge pack;
2. small learned classifier/ranker where useful;
3. hybrid deterministic + learned path.

The Decision Core must remain inspectable and fail closed on insufficient evidence.

### Phase C — Build the local Shot Coach runtime candidate

Evaluate multiple deployment candidates instead of assuming one:

- deterministic response composer;
- small local language model;
- distilled/quantized Student;
- hybrid Decision Core + compact local generator.

Benchmark on real target iPhones for:

- diagnosis quality;
- schema-valid rate;
- unsupported-claim rate;
- p50/p95 latency;
- peak memory;
- package size;
- thermal/battery behavior.

### Phase D — Compile local knowledge packs

Do not ship the whole research warehouse to the phone.

Compile only the canonical evidence needed for the current shooting domains into versioned,
small, provenance-aware packs usable offline.

### Phase E — Wire the app end to end

Target product loop:

```text
local video
  -> local Motion AI
  -> ShotEvidence
  -> local Shot Coach
  -> primary issue + evidence + drill + retest
  -> optional compact history sync
```

### Phase F — Add personalization only after the loop works

Use repeated observed outcomes as additional Shot Coach context.
Do not create a separate personalization model until measurements show a reason to do so.

## 12. MVP release acceptance criteria

The AI architecture is MVP-ready only when all of the following are true:

- [ ] the normal shot-analysis path works without a hosted LLM/API;
- [ ] raw video remains local;
- [ ] Motion AI produces a validated structured evidence payload;
- [ ] Shot Coach consumes that payload rather than raw video;
- [ ] a low-confidence/contradictory input can fail closed;
- [ ] output is schema-constrained and includes drill + retest;
- [ ] routine analysis works in airplane mode after required model/knowledge assets are installed;
- [ ] target-iPhone latency/memory/thermal behavior is measured;
- [ ] per-analysis cloud-AI inference cost is approximately zero;
- [ ] no UI text implies stronger measurement than the evidence grade supports.

## 13. Future expansion

After the shooting loop is validated and shipped, Motion AI may expand to other basketball
actions and the same Shot Coach concept may evolve into a broader Basketball Coach.

Possible future domains:

- finishing;
- ball handling;
- defense;
- off-ball movement;
- passing / playmaking;
- pick-and-roll reads.

Miner can prepare knowledge for these areas now, but product implementation must remain
sequential and evidence-driven.

## 14. Precedence and required developer behavior

Before changing any of these paths or concepts, read this document:

- `modules/formpath-pose/`;
- `lib/shooting-profile/`;
- `lib/recommendation.ts` and successor diagnosis modules;
- `ml/coach/`;
- Miner / HoopDB / Coach corpus integration;
- server-side Coach inference;
- AI deployment/model conversion;
- personalization.

A change that introduces a **third MVP AI**, makes a **cloud model mandatory for routine
analysis**, uploads **raw video** for ordinary coaching, or broadens the **initial product beyond
shooting** requires a new reviewed architecture decision that explicitly supersedes this file.
