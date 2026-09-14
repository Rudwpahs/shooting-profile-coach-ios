"""Source/claim connected components are indivisible evidence partitions."""

import hashlib
import json
from itertools import combinations

from formpath_coach.corpus import CORPUS_DIR

from .audit import canonical_claim

SPLITS = ("train", "dev", "held-out")


def stable_hash(value) -> str:
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def partition_records(records: list[dict]) -> dict[int, str]:
    if not records:
        raise ValueError("empty corpus cannot be partitioned")
    parent = {r["n"]: r["n"] for r in records}
    if len(parent) != len(records):
        raise ValueError("duplicate unit number")

    def root(n):
        while parent[n] != n:
            parent[n] = parent[parent[n]]
            n = parent[n]
        return n

    seen = {}
    for row in sorted(records, key=lambda r: r["n"]):
        keys = [("source", s) for s in row["source_ids"]]
        keys.append(("claim", canonical_claim(row["payload"]["claim"])))
        for key in keys:
            if key in seen:
                a, b = root(row["n"]), root(seen[key])
                parent[max(a, b)] = min(a, b)
            seen[key] = row["n"]
    groups = {}
    for n in sorted(parent):
        groups.setdefault(root(n), []).append(n)
    result = {}
    for ids in groups.values():
        bucket = int(stable_hash(["b2c-evidence-v1", ids])[:16], 16) % 100
        split = "train" if bucket < 70 else "dev" if bucket < 85 else "held-out"
        result.update({n: split for n in ids})
    return result


def leakage_audit(scenarios: list[dict], corpus_dir=CORPUS_DIR) -> dict:
    records = [
        json.loads(line)
        for line in (corpus_dir / "units.machine.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    authoritative = {r["n"]: r for r in records}
    mismatches = []
    groups = {
        split: {
            "unit_ids": set(),
            "source_ids": set(),
            "families": set(),
            "exact_pairs": set(),
            "templates": set(),
            "canonical_claims": set(),
        }
        for split in SPLITS
    }
    for s in scenarios:
        g = groups[s["split"]]
        g["unit_ids"].update(e["research_unit_id"] for e in s["request"]["evidence"])
        for evidence in s["request"]["evidence"]:
            n = evidence["research_unit_id"]
            g["canonical_claims"].add(stable_hash(canonical_claim(evidence["claim"])))
            if n not in authoritative:
                mismatches.append({"scenario_id": s["scenario_id"], "unknown_unit": n})
                continue
            row = authoritative[n]
            g["source_ids"].update(row["source_ids"])
            g["canonical_claims"].add(stable_hash(canonical_claim(row["payload"]["claim"])))
            if s["evaluation_metadata"]["sources"].get(str(n)) != row["source_ids"]:
                mismatches.append({"scenario_id": s["scenario_id"], "source_metadata_mismatch": n})
        g["families"].add(s["family"])
        # IDs must not disguise otherwise identical request/response examples.
        req = {k: v for k, v in s["request"].items() if k != "request_id"}
        resp = {k: v for k, v in s["response"].items() if k != "request_id"}
        g["exact_pairs"].add(stable_hash([req, resp]))
        g["templates"].add(s["variant"])
    pairs, templates = {}, {}
    for a, b in combinations(SPLITS, 2):
        key = f"{a}/{b}"
        pairs[key] = {
            k: sorted(groups[a][k] & groups[b][k])
            for k in ("unit_ids", "source_ids", "families", "exact_pairs", "canonical_claims")
        }
        templates[key] = sorted(groups[a]["templates"] & groups[b]["templates"])
    return {
        "passed": bool(scenarios)
        and not mismatches
        and not any(v for pair in pairs.values() for v in pair.values()),
        "metadata_mismatches": mismatches,
        "pairs": pairs,
        "shared_behavior_templates": templates,
        "interpretation": "Evidence-disjoint, NOT unseen-template or clinical generalization.",
    }
