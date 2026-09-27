# Add/watch guidance

Upstream Graphify supports adding material and watching a corpus for changes. For FormPath, use these only as local development aids.

`--watch` is optional and local. It must not be wired into product runtime, server processes, CI, or post-commit automation in this phase. Prefer explicit refreshes so graph provenance stays obvious during active Phase Space / Film Space work.
