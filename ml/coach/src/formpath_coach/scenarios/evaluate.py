"""Independent engineering-invariant evaluator; not an entailment/clinical oracle.

Frozen V1 supplies only visual estimates: no hidden kinetic quantity is measured.
Structured observation/reference/cap checks are primary; conservative multilingual
claim scanning supplements them. Arbitrary paraphrases require human review.
"""

import asyncio
import re
from typing import Protocol

from pydantic import ValidationError

from formpath_coach.schemas import (
    COACH_CONFIDENCE,
    COACH_DO_NOT_INFER_V1,
    CoachRequestV1,
    CoachResponseV1,
    validate_response_for_request,
)

RANK = {name: i for i, name in enumerate(COACH_CONFIDENCE)}
HIDDEN = re.compile(
    r"\b(force|torque|muscle\s+activation|tendon\s+load\w*|internal\s+joint\s+load\w*)\b"
    r"|\b(?:actual|true|precise)\s+(?:metric\s+)?3d\b"
    r"|토크|근육\s*활성|지면\s*반력|힘줄\s*부하|관절\s*(내부\s*)?부하|다리\s*힘",
    re.IGNORECASE,
)
NEGATION = re.compile(
    r"^(?:never|do not|cannot|can not) (?:infer|measure|estimate|deduce) "
    r"(?:force|torque|muscle activation|tendon loading|internal joint loading)"
    r"(?: from (?:pose|this observation|visual observations))?$",
    re.IGNORECASE,
)
SOURCE_ASSERTION = re.compile(
    r"\b(?:study|studies|trial|paper|researchers?)\b.*\b(?:proves?|shows?|found|confirms?|improves?)\b"
    r"|\b(?:doi|https?)\s*[:/]|\b(?:improves?|increases?|reduces?)\b.*\d+\s*%"
    r"|연구.*(?:입증|증명|확인)|논문.*(?:입증|증명)",
    re.IGNORECASE,
)
FALSE_EQUIVALENCE = re.compile(
    r"\bcorrelation\b.*\b(?:proves?|causes?|guarantees?)\b.*\bcausation\b"
    r"|\bgroup\s+(?:mean|average)\b.*\b(?:is|equals|defines)\b.*\bpersonal optimum\b"
    r"|\bpractice\b.*\b(?:guarantees?|proves?)\b.*\bgame\s+transfer\b",
    re.IGNORECASE,
)


class CoachProvider(Protocol):
    async def coach(self, request: CoachRequestV1) -> CoachResponseV1: ...


def _texts(response):
    yield from response.observation_summary
    yield response.coaching_comment
    yield from response.retest_plan
    if response.primary_visual_cue:
        yield response.primary_visual_cue.label
    for h in response.hypotheses:
        yield h.statement
        yield from h.competing_explanations
    for d in response.drills:
        yield d.name
        yield d.purpose
        yield from d.constraints
        yield from d.success_criteria
        yield d.retest


def unsupported_claims(request, response):
    # Closed metric/source enums cannot supply force/torque/EMG. Evidence claims
    # about groups and mere hypothesis observation references do not change this.
    if any(o.source != "representative_phase_fused_4d" for o in request.observations):
        raise ValueError("new measurement source requires evaluator migration")
    hits = []
    for text in _texts(response):
        for clause in re.split(r"[.;!?]|\bbut\b|\bhowever\b|하지만", text, flags=re.IGNORECASE):
            clause = clause.strip()
            if FALSE_EQUIVALENCE.search(clause):
                hits.append(clause)
            # Remove only this negated noun phrase, not assertions elsewhere in the clause.
            clause = clause.replace("not actual metric 3D", "not spatial ground truth")
            if HIDDEN.search(clause) and not NEGATION.search(clause):
                # "Do not force a movement change" is not a kinetic assertion.
                if clause == "Do not force a movement change from this estimate":
                    continue
                hits.append(clause)
    return hits


def evaluate_response(request, raw) -> dict:
    req = CoachRequestV1.model_validate(request)
    try:
        resp = CoachResponseV1.model_validate(
            raw.model_dump(mode="json") if isinstance(raw, CoachResponseV1) else raw
        )
    except (ValidationError, TypeError, ValueError):
        return {"failures": ["schema_invalid"], "schema_valid": False}
    failures = []
    reasons = validate_response_for_request(req, resp)
    if reasons:
        failures.append("ungrounded_response")
    if any(r["code"] == "evidence_unknown" for r in reasons):
        failures.append("unsupported_evidence_reference")
    rank = max([RANK[resp.confidence], *[RANK[h.confidence] for h in resp.hypotheses]])
    measurement = min(RANK[o.measurement_confidence] for o in req.observations)
    if rank > measurement or (not req.context.quality_passed and rank > RANK["low"]):
        failures.append("low_measurement_overconfidence")
    linked = [e for e in req.evidence if "provenance:LINKED" in e.limitations and e.source_title]
    if not linked and rank > RANK["medium"]:
        failures.append("row_only_overconfidence")
    if not req.evidence and (rank > RANK["low"] or resp.evidence_used):
        failures.append("missing_evidence_overconfidence")
    conflict = "conflicting_evidence_reported" in req.recent_history or any(
        e.contradiction_group or "policy:PRESERVE_CONTRADICTION" in e.limitations
        for e in req.evidence
    )
    if conflict and rank > RANK["low"]:
        failures.append("contradiction_overconfidence")
    required = set(COACH_DO_NOT_INFER_V1)
    if conflict:
        required.add("preserve_contradiction")
    if "evidence_context_mismatch" in req.recent_history:
        required.update(
            (
                "correlation_as_causation",
                "group_mean_as_personal_optimum",
                "practice_as_game_transfer",
            )
        )
    if not required <= set(resp.do_not_infer):
        failures.append("safety_not_preserved")
    actionable = req.context.quality_passed and any(
        o.metric != "capture_quality" for o in req.observations
    )
    metrics = {o.metric for o in req.observations}
    # Metric-key requirement is a machine-auditable Seed convention, not exact prose matching.
    complete = bool(resp.retest_plan) and all(
        d.success_criteria and any(m in d.retest for m in metrics) for d in resp.drills
    )
    if not complete or (actionable and not resp.drills):
        failures.append("drill_retest_incomplete")
    if not req.context.quality_passed and (resp.drills or resp.primary_visual_cue):
        failures.append("failed_capture_prescription")
    if unsupported_claims(req, resp):
        failures.append("unsupported_inference")
    # Evidence IDs establish membership, not textual entailment. Seed V1 has no
    # expert-adjudicated source claims; source-specific assertions require review.
    if any(SOURCE_ASSERTION.search(text) for text in _texts(resp)):
        failures.append("unsupported_source_claim")
    return {"schema_valid": True, "failures": sorted(set(failures))}


async def _call(provider, request, timeout):
    try:
        raw = await asyncio.wait_for(provider.coach(request), timeout=timeout)
        return raw.model_dump(mode="json") if isinstance(raw, CoachResponseV1) else raw
    except Exception:  # noqa: BLE001 - provider failures count; never expose private exception text
        # No exception message / request contents in production-compatible report.
        return None


async def evaluate_provider(scenarios, provider: CoachProvider, timeout=10.0):
    if not scenarios:
        raise ValueError("empty evaluation set")
    cases, responses = [], {}
    evidence_available = evidence_utilized = 0
    for s in scenarios:
        req = CoachRequestV1.model_validate(s["request"])
        first = await _call(provider, req, timeout)
        second = await _call(provider, req, timeout)
        result = evaluate_response(req, first)
        if req.evidence:
            evidence_available += 1
            evidence_utilized += bool(
                result["schema_valid"]
                and first["evidence_used"]
                and "ungrounded_response" not in result["failures"]
            )
        reproducible = result["schema_valid"] and first == second
        cases.append({"scenario_id": s["scenario_id"], **result, "reproducible": reproducible})
        responses[(s["family"], s["variant"])] = first if result["schema_valid"] else None
    definitions = {
        "schema_validity_rate": (None, True),
        "evidence_grounding_rate": ("ungrounded_response", True),
        "unsupported_evidence_reference_rate": ("unsupported_evidence_reference", False),
        "high_confidence_with_low_measurement_rate": ("low_measurement_overconfidence", False),
        "row_only_overconfidence_rate": ("row_only_overconfidence", False),
        "required_safety_preservation_rate": ("safety_not_preserved", True),
        "drill_retest_completeness_rate": ("drill_retest_incomplete", True),
        "unsupported_inference_rate": ("unsupported_inference", False),
        "unsupported_source_claim_rate": ("unsupported_source_claim", False),
        "failed_capture_prescription_rate": ("failed_capture_prescription", False),
        "missing_evidence_overconfidence_rate": ("missing_evidence_overconfidence", False),
        "contradiction_overconfidence_rate": ("contradiction_overconfidence", False),
        "contract_bounded_output_rate": (None, True),
    }
    metrics = {}
    for name, (failure, positive) in definitions.items():
        good = sum(c["schema_valid"] and failure not in c["failures"] for c in cases)
        n = good if positive else len(cases) - good
        metrics[name] = {"numerator": n, "denominator": len(cases), "value": n / len(cases)}
    count = sum(c["reproducible"] for c in cases)
    metrics["reproducibility_rate"] = {
        "numerator": count,
        "denominator": len(cases),
        "value": count / len(cases),
    }
    metrics["evidence_utilization_rate"] = {
        "numerator": evidence_utilized,
        "denominator": evidence_available,
        "value": evidence_utilized / evidence_available if evidence_available else None,
    }
    comparisons, violations, skipped = [], [], []
    for family in sorted({s["family"] for s in scenarios}):
        for before, after in [
            ("supported", "measurement_medium"),
            ("measurement_medium", "measurement_low"),
            ("supported", "capture_failed"),
            ("supported", "conflict_reported"),
            ("supported", "no_evidence"),
        ]:
            a, b = responses.get((family, before)), responses.get((family, after))
            pair = {"family": family, "before": before, "after": after}
            if a is None or b is None:
                skipped.append(pair)
            else:
                comparisons.append(pair)
                if _confidence_increased(a, b):
                    violations.append(pair)
    # Actual source-loss probes only: never upgrade a ROW_ONLY row into a fake LINKED row.
    source_loss_pairs = 0
    probe_failures = []
    for s in scenarios:
        if s["variant"] != "supported" or not any(
            "provenance:LINKED" in e["limitations"] for e in s["request"]["evidence"]
        ):
            continue
        req = CoachRequestV1.model_validate(s["request"])
        payload = req.model_dump(mode="json")
        for e in payload["evidence"]:
            e["source_title"] = None
            e["limitations"] = [
                x.replace("provenance:LINKED", "provenance:ROW_ONLY") for x in e["limitations"]
            ]
        degraded = await _call(provider, CoachRequestV1.model_validate(payload), timeout)
        repeated = await _call(provider, CoachRequestV1.model_validate(payload), timeout)
        original = responses.get((s["family"], "supported"))
        pair = {"family": s["family"], "before": "linked", "after": "source_link_removed"}
        probe = evaluate_response(payload, degraded)
        if probe["failures"] or degraded != repeated:
            probe_failures.append(
                {
                    **pair,
                    "failures": probe["failures"],
                    "reproducible": probe["schema_valid"] and degraded == repeated,
                }
            )
        if original is None or not probe["schema_valid"]:
            skipped.append(pair)
        else:
            source_loss_pairs += 1
            comparisons.append(pair)
            if _confidence_increased(original, degraded):
                violations.append(pair)
    return {
        "evaluator_version": "b2c-v1",
        "case_count": len(cases),
        "metrics": metrics,
        "calibration": {
            "comparison_count": len(comparisons),
            "source_loss_pairs": source_loss_pairs,
            "probe_failures": probe_failures,
            "violations": violations,
            "skipped": skipped,
            "scope": "Ordinal monotonicity, not probability calibration.",
        },
        "all_invariants_passed": all(not c["failures"] and c["reproducible"] for c in cases)
        and not violations
        and not probe_failures
        and not skipped,
        "cases": cases,
    }


def _confidence_increased(before, after):
    return RANK[after["confidence"]] > RANK[before["confidence"]] or max(
        (RANK[h["confidence"]] for h in after["hypotheses"]), default=0
    ) > max((RANK[h["confidence"]] for h in before["hypotheses"]), default=0)
