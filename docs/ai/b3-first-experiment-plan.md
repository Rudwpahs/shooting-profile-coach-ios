# B3 first experiment — requires separate owner approval

Do not execute this plan as part of B2-C. No downloaded/committed model weights
and no training run are part of the B2-C evidence.

## Entry decision

Re-run B2-C regeneration, leakage, full tests, retrieval benchmark and baseline
evaluation first. Owner reviews Seed's conservative labels and baseline failures.
Do not equate green engineering tests with a safe deployment. Current readiness
decision is recorded in `docs/integration/b2c-scenario-eval-handoff.md`.

## Exact preflight

1. Record OS/WSL, RAM, CPU, `nvidia-smi`, CUDA/runtime/driver, free disk and measured
   available VRAM. An RTX 4060 name does not substitute for the actual 8 GB reading.
2. At B3 start, consult official model cards/config/runtime documentation. Verify
   then-current Qwen3 small baseline and Qwen3-4B revisions, architecture, license,
   chat template, context settings and supported LoRA targets. Do not reuse stale
   guesses; record immutable revision and local config hashes. Check terms cover
   intended app deployment and dataset/source usage. Obtain download approval as
   part of B3 scope before any weights transfer.
3. Pin the chosen environment. Verify a tiny local forward/backward, tokenizer
   prompt-prefix masking and 4-bit device support. Prefer WSL2 only if native
   Windows dependency/runtime smoke tests fail; record the actual failure.
4. Freeze Seed manifest hash. Dev tunes choices; held-out is evaluated once after
   selection. Use a deterministic train-only subset sorted by scenario ID (start
   with 32 examples); do not move evidence between splits to improve results.

## Small run configuration to finalize after preflight

Start a small Qwen3 baseline before the 4B experiment if verified availability,
license and hardware make it appropriate. Capture baseline structured metrics
through the same async provider interface before SFT. Do not label a wrapped
deterministic output as model output. Preserve malformed generations as failures.

Initial candidate knobs, not a tested recipe: batch 1, accumulation 8, sequence
1024, LoRA rank 8 / alpha 16 / dropout 0.05, learning rate 2e-4, 20 optimizer steps,
AdamW, gradient checkpointing, fixed seed 17. Preflight must measure token lengths:
do not silently truncate evidence or all assistant tokens to fit 1024. If the
examples do not fit, reduce evidence via a separately versioned dataset with
the same split groups, or increase sequence length only after measuring memory.

For Qwen3-4B QLoRA, verify 4-bit NF4/double-quant compatibility and device compute
dtype; choose BF16 only if supported, else verified FP16. Determine exact target
module names from the downloaded revision, not assumed Qwen naming. Record
optimizer precision/state placement and memory. Stop on OOM/nonfinite loss;
preserve logs, lower size through a documented new run config, never invent a
successful artifact. No cloud GPU purchase or long run without separate approval.

## Required run evidence

Each run directory must include:

- exact source commit, base-model ID/revision/config/license, environment versions;
- generator/corpus/dataset hashes and train/dev/held-out manifest;
- actual subset IDs and source partitions, prompt/template hash;
- LoRA/QLoRA modules, rank, alpha, dropout, quantization/dtype;
- sequence length and truncation/masking audit, batch/accumulation, seed;
- optimizer, learning rate/scheduler, steps/epochs;
- synchronized measured peak allocated/reserved VRAM and wall-clock runtime;
- train loss series and dev metrics (no held-out tuning);
- held-out raw structured outputs or validation errors, schema-valid rate,
  citation subset rate, evidence-use coverage, unsupported-inference rate,
  all confidence/contradiction/source-loss metrics, and latency distribution;
- failure/ablation notes, artifact checksums, commit and handoff.

## Exit gate

Require schema/grounding/boundedness/retest/safety rates 1.0 and unsupported
inference/overconfidence rates 0 on the prespecified cases. An invariant checker
passing does not prove scientific correctness: manually audit a stratified sample,
especially ROW_ONLY and conflicts. Compare unchanged deterministic_v1, untrained
base provider and adapter provider. Expand only after small-run evidence and
owner review. Only an actual run + metrics + artifact hashes permits the word
`trained`; B2-C does not supply them.
