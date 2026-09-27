# Query guidance

Prefer the smallest graph operation that answers the question:

- `graphify query "<question>"` for scoped architecture/context.
- `graphify path "<A>" "<B>"` for a concrete dependency/relationship path.
- `graphify explain "<symbol>"` for one node.

Treat EXTRACTED, INFERRED, and AMBIGUOUS evidence differently. No graph-only claim that affects implementation is confirmed until the named source files are opened and checked.

Pinned invocation in this repository uses `uvx --from graphifyy==0.9.69`.
