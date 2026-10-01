# B3 first experiment — Training v0 execution protocol

Status: **planned; no real model training has been executed by this document**

Primary implementation plan:
`docs/superpowers/plans/2026-10-01-hoophub-coach-training-v0.md`

Parent architecture:
`docs/superpowers/specs/2026-10-01-hoophub-compute-efficient-coach-design.md`

The implementation plan is the source of truth for Training v0 configuration and task order. Earlier provisional B3 knobs (including native-Windows-first fallback logic, LoRA r8/alpha16, accumulation 8, and seed 17) are superseded for Training v0 and must not be mixed with the locked run configuration.

## Entry gate

Do not execute Training v0 until the parent Compute-Efficient Coach TODO permits the training phase. In particular, freeze the required evaluation/gold-set contract first and preserve the existing B2-C train/dev/held-out isolation.

Before a real run:

1. Start from the latest `main`, never from PR #19/#20/#21 UI branches.
2. Regenerate/check the B2-C artifacts and leakage audit; do not change split membership to improve a score.
3. Record WSL2/Linux environment, Python, PyTorch/CUDA, GPU/VRAM, driver, free disk, Transformers, PEFT, and bitsandbytes versions.
4. Resolve and record the exact `Qwen/Qwen3-4B` model/tokenizer revision, config, and license before weights are transferred.
5. Verify the resolved model still exposes the planned LoRA target modules before training.
6. Run the Training v0 token audit before selecting sequence length.

## Locked Training v0 baseline

The first owner-machine baseline uses:

- canonical environment: WSL2 Ubuntu + Python 3.11;
- PyTorch 2.13 CUDA 12.6 line;
- Qwen/Qwen3-4B at an explicitly recorded immutable revision;
- 4-bit QLoRA with NF4 + double quantization;
- BF16 compute only when runtime support is verified, otherwise FP16;
- LoRA rank 32, alpha 64, dropout 0.05;
- target modules `q_proj`, `k_proj`, `v_proj`, `o_proj`, `gate_proj`, `up_proj`, `down_proj`, after revision verification;
- batch size 1;
- gradient accumulation 16;
- learning rate `2e-4`;
- seed 42;
- gradient checkpointing enabled for the 4B owner-machine run;
- sequence-length ladder 512 -> 768 -> 1024, choosing the smallest length that fits every selected serialized row without truncation.

If 1024 still truncates required prompt/assistant content, stop. Version a smaller evidence payload or revisit the data contract; never silently truncate required training content.

## Smoke run

Before a full baseline:

- select exactly 32 train rows deterministically by stable request/scenario identity;
- use at most 20 optimizer steps;
- never include held-out rows;
- evaluate the smoke adapter on dev only;
- stop on OOM, non-finite loss, unavailable 4-bit CUDA support, or contract-invalid outputs;
- retain the failure manifest rather than inventing a successful adapter.

The smoke run exists to prove the environment, data path, token masking, QLoRA kernels, memory envelope, adapter saving/loading, and V1 provider/evaluator path. It is not a quality claim.

## Full baseline

After smoke success and the parent benchmark gate:

1. Train with train split only.
2. Use dev for candidate/configuration choice.
3. Do not inspect held-out generations while tuning.
4. Evaluate the selected adapter once on held-out.
5. Compare unchanged `deterministic_v1`, untrained base, and trained adapter under the same evaluator.
6. Preserve malformed or out-of-contract generations as failures; do not auto-repair them.

Only an actual successful run with hashes and metrics permits the term **trained**.

## Required run evidence

Each committed run record must include, as applicable:

- exact source commit;
- base-model ID and resolved revision;
- tokenizer/config/license identity;
- environment/dependency versions;
- B2-C generator/corpus/dataset/manifest hashes;
- exact train subset IDs for smoke runs;
- prompt/chat-template hash;
- QLoRA quantization/dtype and LoRA modules/rank/alpha/dropout;
- sequence length and no-truncation audit result;
- batch/accumulation, seed, optimizer, LR/scheduler, steps/epochs;
- wall-clock time and measured peak CUDA allocated/reserved VRAM;
- train loss series and dev metrics;
- held-out metrics only for the selected full candidate;
- schema-valid rate, grounding/reference integrity, unsupported-inference rate, confidence/contradiction/retest metrics;
- inference latency/token/compute metrics required by the Efficient Frontier architecture;
- adapter/result artifact checksums;
- explicit failure notes when a run does not complete.

Do not commit model weights, caches, raw user video, raw landmark data, or private user prompts.

## Exit gate

A green engineering run is not a deployment certificate. The candidate must pass the frozen schema/grounding/safety/retest gates and be compared with the deterministic baseline under the parent architecture's Efficient Frontier evaluation. Human review of a stratified sample remains required before broader adoption, especially for weak-provenance or contradictory evidence cases.
