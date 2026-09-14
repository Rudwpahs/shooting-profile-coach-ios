import copy
import json

import pytest


def row():
    from formpath_coach.scenarios.gold import gold_response
    from formpath_coach.scenarios.specs import request_spec

    _, req = request_spec("release_elbow_angle_deg", 0, "supported")
    return {
        "request": req.model_dump(mode="json"),
        "response": gold_response(req).model_dump(mode="json"),
    }


def test_v1_loader_and_metadata_is_not_a_contract_field(tmp_path):
    from formpath_coach.dataset import ScenarioDataset

    path = tmp_path / "v1.jsonl"
    example = row()
    example["evaluation_metadata"] = {"split": "held-out"}
    path.write_text(json.dumps(example) + "\n", encoding="utf-8")
    assert ScenarioDataset(path)[0] == example


@pytest.mark.parametrize("mutation", ["mixed", "unknown_version", "unknown_evidence"])
def test_v1_loader_rejects_invalid_pair(tmp_path, mutation):
    from formpath_coach.dataset import ScenarioDataset

    example = copy.deepcopy(row())
    if mutation == "mixed":
        del example["response"]["schema_version"]
    elif mutation == "unknown_version":
        example["request"]["schema_version"] = 2
    else:
        example["response"]["evidence_used"] = [99999]
    path = tmp_path / "bad.jsonl"
    path.write_text(json.dumps(example), encoding="utf-8")
    with pytest.raises(ValueError):
        ScenarioDataset(path)
