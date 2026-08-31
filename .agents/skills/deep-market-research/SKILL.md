---
name: deep-market-research
description: Evidence-tiered market, competitor, technology-trend, GTM, pricing, and commercial due-diligence research with source grading, triangulation, stale-data checks, and contradiction handling.
license: MIT-derived adapter
metadata:
  upstream: https://github.com/Rain3Dmetrology/deep-market-research
  upstream_version: "2.8.0"
  adapter_reviewed: 2026-08-31
---

# Deep Market Research

Portable FormPath adapter of `deep-market-research` v2.8.0.

## Use when

Use for market size, competitor landscape, pricing, GTM/channel strategy, business models, customer demand, technical trend mapping, startup/product due diligence, and recurring market monitoring.

## Evidence tiers

- **Tier 1 — primary/official:** filings, financial statements, regulator/government data, official product/pricing/docs, patents, company announcements.
- **Tier 2 — expert/direct-user evidence:** verified customer reviews, interviews, credible practitioner reports. Requires triangulation.
- **Tier 3 — reputable secondary:** major media, analyst/industry reports, court/company registries, academic literature.
- **Tier 4 — OSINT/UGC:** Reddit, forums, social posts, comments, unofficial estimates. Use mainly as a lead or sentiment signal, not as sole decision evidence.

## Confirmation labels

- **Confirmed:** at least two independent Tier 1–3 sources agree; for critical competitor parameters such as price/version/license, prefer three.
- **Corroborated:** one strong source plus credible supporting evidence.
- **Single-source:** one usable source only; explicitly mark it.
- **Unverified/Conflicting:** evidence is weak or contradictory; do not force consensus.

## Pipeline

1. Define the decision the research is meant to support, geography, time window, competitor set, and acceptance/stop criteria.
2. Search in layers: market/industry anchors → value chain and players → customer pain/usage → technology trends → failure cases and contrarian evidence.
3. Route to primary domain sources first. Use GitHub for code/open-source claims, academic indexes for science, patents for IP, government/regulator sources for policy, official pricing/docs for product parameters.
4. Deduplicate reposts and stale copies. Keep the most information-dense primary version.
5. Flag stale data. Fast-moving pricing/product claims should be verified against current official pages.
6. Cross-check critical facts and explicitly surface conflicts.
7. Separate TAM narratives from observable demand. Look for active usage, willingness to pay, switching behavior, acquisition channels, retention proxies, and real operational constraints.
8. Run a contrarian pass: why might this market be smaller, slower, more regulated, harder to monetize, or easier for incumbents to copy than the optimistic case assumes?
9. End with decision implications, confidence, key unknowns, and the cheapest next validation step.

## FormPath defaults

For basketball/shooting products, distinguish athlete/parent/coach/team segments, training vs social use cases, acquisition channel, frequency of use, willingness to pay, incumbent substitutes, privacy/licensing constraints, and the cold-start problem for social features. Do not infer market demand from app-store existence alone.
