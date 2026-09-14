"""Generate small evidence-disjoint behavioral examples from immutable corpus."""

import json

from formpath_coach.corpus import CORPUS_DIR, iter_unit_codes
from formpath_coach.corpus_mapping import coach_evidence_items
from formpath_coach.retrieval import build_evidence_query_plan, rank_evidence_candidates
from formpath_coach.schemas import COACH_METRICS_V1, CoachRequestV1, validate_response_for_request

from .audit import SAFETY, audit_corpus
from .gold import gold_response
from .specs import VARIANTS, request_spec
from .splits import leakage_audit, partition_records


def generate(corpus_dir=CORPUS_DIR):
    audit = audit_corpus(corpus_dir)
    if (
        audit["duplicate_ids"]
        or audit["missing_required_fields"]
        or audit["provenance_inconsistencies"]
    ):
        raise ValueError("corpus audit failed")
    rows = [
        json.loads(line)
        for line in (corpus_dir / "units.machine.jsonl").read_text(encoding="utf-8").splitlines()
    ]
    partition = partition_records(rows)
    units = list(iter_unit_codes(corpus_dir))
    by_id = {u.n: u for u in units}
    evidence_cache = {}
    result = []
    for metric in COACH_METRICS_V1:
        for profile in range(7):
            split = "train" if profile < 5 else "dev" if profile == 5 else "held-out"
            for variant in VARIANTS:
                family, request = request_spec(metric, profile, variant)
                plan = build_evidence_query_plan(request)
                candidates = [
                    u
                    for u in units
                    if partition[u.n] == split
                    and (
                        set(u.metrics) & set(plan.metrics)
                        or set(u.domains) & set(plan.domains)
                        or set(u.policies) & set(plan.policies)
                    )
                ]
                ranked = rank_evidence_candidates(plan, candidates)
                chosen = [r.unit for r in ranked[:4]]
                safety = next(
                    (r.unit for r in ranked if SAFETY.intersection(r.unit.policies)), None
                )
                if safety and safety not in chosen:
                    chosen = chosen[:3] + [safety]
                if variant == "sparse":
                    chosen = [safety] if safety else chosen[:1]
                if variant == "no_evidence":
                    chosen = []
                ids = tuple(u.n for u in chosen)
                if ids not in evidence_cache:
                    evidence_cache[ids] = coach_evidence_items(ids, corpus_dir)
                payload = request.model_dump(mode="json")
                payload["evidence"] = evidence_cache[ids]
                request = CoachRequestV1.model_validate(payload)
                response = gold_response(request)
                if validate_response_for_request(request, response):
                    raise ValueError("gold grounding failed")
                result.append(
                    {
                        "scenario_id": request.request_id.removeprefix("req_"),
                        "family": family,
                        "split": split,
                        "metric": metric,
                        "variant": variant,
                        "request": request.model_dump(mode="json"),
                        "response": response.model_dump(mode="json"),
                        "evaluation_metadata": {
                            "synthetic_measurements": True,
                            "sources": {str(n): list(by_id[n].sources) for n in ids},
                            "unit_partition": {str(n): partition[n] for n in ids},
                            "direct_metric_evidence": any(
                                set(u.metrics) & set(plan.metrics) for u in chosen
                            ),
                            "safety_evidence_present": any(
                                SAFETY.intersection(u.policies) for u in chosen
                            ),
                            "conflict_kind": (
                                "reported_context_not_verified_source_pair"
                                if variant == "conflict_reported"
                                else None
                            ),
                            "hidden_measurements_supplied": [],
                        },
                    }
                )
    result.sort(key=lambda s: s["scenario_id"])
    if not leakage_audit(result, corpus_dir)["passed"]:
        raise ValueError("generated dataset leaks across splits")
    return result
