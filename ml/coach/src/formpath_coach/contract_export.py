"""Export the V1 Coach contract as JSON Schema files under `contracts/`.

Pydantic is the exporter; the TypeScript side checks the exported files
against its own Zod schemas (`tests/coach-parity.test.ts`) and the Python
side checks that the committed files are current (`tests/test_contract_fixtures.py`).

    python -m formpath_coach.contract_export            # writes into <repo>/contracts
    python -m formpath_coach.contract_export <out_dir>  # writes elsewhere
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from .schemas import CoachObservationV1, CoachRequestV1, CoachResponseV1

CONTRACT_MODELS: dict[str, type[CoachRequestV1 | CoachResponseV1 | CoachObservationV1]] = {
    "coach-request-v1": CoachRequestV1,
    "coach-response-v1": CoachResponseV1,
    "coach-observation-v1": CoachObservationV1,
}

JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"


def contract_json_schemas() -> dict[str, dict[str, Any]]:
    """One JSON Schema per contract, named by its file stem."""
    schemas: dict[str, dict[str, Any]] = {}
    for name, model in CONTRACT_MODELS.items():
        schema = model.model_json_schema()
        schema["$schema"] = JSON_SCHEMA_DIALECT
        schema["$id"] = f"{name}.schema.json"
        schemas[name] = schema
    return schemas


def write_contract_schemas(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, schema in contract_json_schemas().items():
        target = out_dir / f"{name}.schema.json"
        target.write_text(
            json.dumps(schema, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8"
        )
        written.append(target)
    return written


def main(argv: list[str]) -> int:
    default = Path(__file__).resolve().parents[4] / "contracts"
    out_dir = Path(argv[1]) if len(argv) > 1 else default
    for path in write_contract_schemas(out_dir):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
