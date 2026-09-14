"""The Python half of the cross-language fixture gate.

`contracts/fixtures/coach/manifest.json` lists golden and negative documents;
`tests/coach-parity.test.ts` runs the same manifest through the Zod schemas.
Both sides must reach the same verdict on every case, and the JSON schema
files committed under `contracts/` must be exactly what Pydantic exports.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import jsonschema
import pytest
from pydantic import ValidationError

from formpath_coach.contract_export import contract_json_schemas
from formpath_coach.schemas import (
    CoachObservationV1,
    CoachRequestV1,
    CoachResponseV1,
    validate_response_for_request,
)

ROOT = Path(__file__).resolve().parents[3]
CONTRACTS = ROOT / "contracts"
FIXTURES = CONTRACTS / "fixtures" / "coach"
MANIFEST = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
MODELS = {
    "coach-request-v1": CoachRequestV1,
    "coach-response-v1": CoachResponseV1,
    "coach-observation-v1": CoachObservationV1,
}


def read_json(relative: str) -> Any:
    return json.loads((FIXTURES / relative).read_text(encoding="utf-8"))


def apply_patch(document: Any, ops: list[dict[str, Any]]) -> Any:
    root = copy.deepcopy(document)
    for op in ops:
        segments = op["path"].split("/")[1:]
        node = root
        for segment in segments[:-1]:
            node = node[int(segment)] if isinstance(node, list) else node[segment]
        last = segments[-1]
        if isinstance(node, list):
            if op["op"] == "set":
                # Setting one past the end appends, as JavaScript does.
                if int(last) == len(node):
                    node.append(op["value"])
                else:
                    node[int(last)] = op["value"]
            else:
                del node[int(last)]
        elif op["op"] == "set":
            node[last] = op["value"]
        else:
            del node[last]
    return root


def load_document(case: dict[str, Any]) -> Any:
    if "file" in case:
        return read_json(case["file"])
    return apply_patch(read_json(case["base"]), case.get("patch", []))


def verdict(case: dict[str, Any]) -> bool:
    document = load_document(case)
    model = MODELS[case["schema"]]
    try:
        parsed = model.model_validate(document)
    except ValidationError:
        return False
    if case["schema"] == "coach-response-v1" and "request_file" in case:
        request = CoachRequestV1.model_validate(read_json(case["request_file"]))
        return validate_response_for_request(request, parsed) == []
    return True


CASES = MANIFEST["cases"]


def test_manifest_shape():
    assert MANIFEST["schema_version"] == 1
    ids = [case["id"] for case in CASES]
    assert len(set(ids)) == len(ids)
    assert sum(case["valid"] for case in CASES) >= 4
    assert sum(not case["valid"] for case in CASES) >= 24
    assert all(case.get("reason") for case in CASES if not case["valid"])


@pytest.mark.parametrize("case", CASES, ids=[case["id"] for case in CASES])
def test_fixture_verdict(case: dict[str, Any]):
    assert verdict(case) == case["valid"]


def test_exported_json_schema_files_are_current():
    for name, schema in contract_json_schemas().items():
        committed = json.loads((CONTRACTS / f"{name}.schema.json").read_text(encoding="utf-8"))
        assert committed == schema, f"{name}.schema.json is stale; regenerate with contract_export"


def test_golden_documents_satisfy_the_exported_json_schema():
    schemas = contract_json_schemas()
    for case in CASES:
        if not case["valid"]:
            continue
        jsonschema.validate(load_document(case), schemas[case["schema"]])


def test_structural_negatives_fail_the_exported_json_schema_too():
    schemas = contract_json_schemas()
    structural = [case for case in CASES if not case["valid"] and case.get("structural")]
    assert len(structural) >= 12
    for case in structural:
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(load_document(case), schemas[case["schema"]])
