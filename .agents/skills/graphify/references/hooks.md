# Hooks policy

Graphify supports automated refresh/watch workflows upstream, but FormPath intentionally does **not** enable automatic post-commit or CI graph regeneration in this integration phase.

Do not add `.codex/hooks.json`, Git hooks, or GitHub Actions solely to refresh Graphify unless a later approved design explicitly changes this policy.
