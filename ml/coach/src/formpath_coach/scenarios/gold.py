"""Conservative pedagogical labels, not expert clinical or efficacy gold."""

from formpath_coach.corpus_mapping import cap_coach_confidence, evidence_set_policy
from formpath_coach.schemas import COACH_CONFIDENCE, COACH_DO_NOT_INFER_V1, CoachResponseV1


def gold_response(request):
    obs = request.observations[0]
    conflict = "conflicting_evidence_reported" in request.recent_history or any(
        e.contradiction_group or "policy:PRESERVE_CONTRADICTION" in e.limitations
        for e in request.evidence
    )
    cautious = (
        not request.context.quality_passed
        or not request.evidence
        or conflict
        or "evidence_context_mismatch" in request.recent_history
        or request.context.action == "unknown"
    )
    rank = min(COACH_CONFIDENCE.index(o.measurement_confidence) for o in request.observations)
    confidence = COACH_CONFIDENCE[min(rank, 1 if cautious else 2)]
    provenances = [
        "LINKED" if "provenance:LINKED" in e.limitations else "ROW_ONLY" for e in request.evidence
    ]
    confidence = cap_coach_confidence(confidence, evidence_set_policy(provenances))
    retest = f"Repeat the same capture protocol; compare {obs.metric} across three trials."
    summary = [
        f"{obs.metric}: {obs.value} {obs.unit}; representative estimate, not actual metric 3D."
    ]
    if not request.evidence:
        summary.append(
            "No admissible evidence supplied; do not invent a biomechanical explanation."
        )
    else:
        summary.append(
            "Selected evidence is context only; no source establishes a personal optimum here."
        )
    if conflict:
        summary.append(
            "Conflicting evidence is reported or flagged; the contradiction remains unresolved."
        )
    actionable = request.context.quality_passed and obs.metric != "capture_quality"
    drills = []
    if actionable:
        drills = [
            {
                "name": "Repeatability check",
                "purpose": f"Observe consistency of {obs.metric}; do not target a universal value.",
                "constraints": [
                    "Keep capture protocol and shot context constant.",
                    "Do not force a movement change from this estimate.",
                ],
                "success_criteria": [
                    f"Record {obs.metric} for three valid trials; compare variation."
                ],
                "retest": retest,
            }
        ]
    return CoachResponseV1.model_validate(
        {
            "schema_version": 1,
            "request_id": request.request_id,
            "observation_summary": summary,
            "hypotheses": [],
            "confidence": confidence,
            "coaching_comment": (
                "Keep your movement unchanged; use repeated captures to test measurement consistency."
                if actionable
                else "Retake a valid capture before considering any movement adjustment."
            ),
            "do_not_infer": [
                *COACH_DO_NOT_INFER_V1,
                "tendon_loading",
                "internal_joint_loading",
                "correlation_as_causation",
                "group_mean_as_personal_optimum",
                "practice_as_game_transfer",
                "preserve_contradiction",
            ],
            "drills": drills,
            "retest_plan": [retest],
            "evidence_used": [e.research_unit_id for e in request.evidence],
            "primary_visual_cue": {"observation_id": obs.id, "label": obs.metric[:40]}
            if actionable
            else None,
            "provider": {"id": "deterministic_v1", "revision": "seed_v1_pedagogical_gold"},
        }
    )
