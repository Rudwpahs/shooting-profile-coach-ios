---
name: citation-management
description: Verify, normalize, deduplicate, and manage research citations and source metadata. Use for DOI lookup, BibTeX/CSL/RIS records, Zotero-style libraries, and claim-to-source audit trails.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Pratikrishi97/sciagent-skills/tree/main/skills/citation-management
  upstream_version: "1.0.0"
  adapter_reviewed: 2026-08-31
---

# Citation Management

Adapted from SciAgent Skills `citation-management`.

## Purpose

Keep the evidence chain auditable. This skill is complementary to `research` and `literature-review`: those discover and synthesize; this one makes sure the references are real, identifiable, deduplicated, and connected to the claims they support.

## Workflow

1. Prefer stable identifiers: DOI, PMID, arXiv ID, RFC/standard number, Git commit/tag, release URL, patent number, dataset DOI.
2. Resolve identifiers against authoritative metadata such as Crossref, publisher pages, official repositories, or registry records.
3. Normalize titles, authors, dates, venue, version, URL, and access/verification date.
4. Deduplicate by identifier first; use fuzzy title + year + author only as fallback.
5. Maintain a claim-to-source ledger for important research: each load-bearing claim should point to the smallest set of sources that actually support it.
6. Distinguish primary evidence from secondary commentary and mirrors/reposts.
7. Before final reporting, audit that every cited source exists, matches the asserted claim, and is not merely a search-result snippet.

## FormPath conventions

Durable research may keep `sources.md`, `refs.bib`, or `refs.csl.json` beside the topic under `docs/research/<topic>/`. Source records should include `verified_on` and, for code, the exact commit/tag when relevant.

## Never

- Invent DOI, author, journal, page number, version, or publication year.
- Treat two mirrors of the same document as independent confirmation.
- Cite a secondary article when the primary paper/release/standard is available for the same factual claim.
- Keep a reference merely because it supports the preferred conclusion; relevance and accuracy come first.
