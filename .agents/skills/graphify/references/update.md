# Refresh and freshness

Before relying on an existing graph, compare the graph's recorded source revision/run context with current `git rev-parse HEAD`. If source changed materially, refresh with the pinned Graphify version.

Use a full build for first generation and `graphify . --update` for a supported incremental refresh. Keep all generated sidecars in `graphify-out/` and out of git.

If refresh cannot run in the current environment, state that limitation and use direct source inspection instead.
