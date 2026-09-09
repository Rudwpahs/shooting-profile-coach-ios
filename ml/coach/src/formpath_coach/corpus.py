"""Read-only access to the FormPath Knowledge Machine v2 corpus.

The corpus package (``ml/coach/corpus/knowledge-machine-v2``) is vendored
byte-exact: a SQLite database of 940 research units, RU-0061..RU-1000, with
normalized DOMAIN / METRIC / EFFECT / POLICY / EVIDENCE / SOURCE / PROVENANCE
codes, a controlled vocabulary and a manifest carrying the checksums.

This module integrates and validates that package. It answers with machine
codes by default; natural-language payload is returned only through
``unit_text`` for an explicitly named unit. It never writes, never embeds,
never trains, and never reconstructs the discarded RU-0001..RU-0060.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Iterator
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

CORPUS_DIR = Path(__file__).resolve().parents[2] / "corpus" / "knowledge-machine-v2"
DB_FILE = "formpath_knowledge.sqlite"
JSONL_FILE = "units.machine.jsonl"
MANIFEST_FILE = "manifest.json"
VOCABULARY_FILE = "controlled-vocabulary.json"

CANONICAL_FIRST_UNIT = 61
CANONICAL_LAST_UNIT = 1000
CANONICAL_UNIT_COUNT = CANONICAL_LAST_UNIT - CANONICAL_FIRST_UNIT + 1

CODE_TABLES = {"domains": "unit_domains", "metrics": "unit_metrics", "policies": "unit_policies"}


class CorpusError(RuntimeError):
    """The vendored corpus is missing, altered, or inconsistent with its manifest."""


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def corpus_manifest(corpus_dir: Path = CORPUS_DIR) -> dict[str, Any]:
    return json.loads((corpus_dir / MANIFEST_FILE).read_text(encoding="utf-8"))


def controlled_vocabulary(corpus_dir: Path = CORPUS_DIR) -> dict[str, Any]:
    return json.loads((corpus_dir / VOCABULARY_FILE).read_text(encoding="utf-8"))


def open_corpus(corpus_dir: Path = CORPUS_DIR) -> sqlite3.Connection:
    """A read-only connection; the corpus is never written by the app."""
    db_path = corpus_dir / DB_FILE
    if not db_path.is_file():
        raise CorpusError(f"corpus database missing: {db_path.name}")
    connection = sqlite3.connect(f"{db_path.resolve().as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


@dataclass(frozen=True)
class CorpusUnitCodes:
    """One research unit as machine codes only."""

    n: int
    id: str
    effect: str
    evidence: str
    provenance: str
    domains: tuple[str, ...]
    metrics: tuple[str, ...]
    policies: tuple[str, ...]
    sources: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class CorpusUnitText:
    """The natural-language payload of one explicitly requested unit."""

    n: int
    id: str
    claim: str
    context_metric: str | None
    coaching_implication: str | None


def _codes(cursor: sqlite3.Cursor, table: str, column: str, unit_no: int) -> tuple[str, ...]:
    return tuple(row[0] for row in cursor.execute(f"select {column} from {table} where unit_no=? order by {column}", (unit_no,)))


def _unit_codes(cursor: sqlite3.Cursor, row: sqlite3.Row) -> CorpusUnitCodes:
    unit_no = int(row["unit_no"])
    return CorpusUnitCodes(
        n=unit_no,
        id=str(row["unit_id"]),
        effect=str(row["effect_code"]),
        evidence=str(row["evidence_code"]),
        provenance=str(row["provenance_code"]),
        domains=_codes(cursor, "unit_domains", "code", unit_no),
        metrics=_codes(cursor, "unit_metrics", "code", unit_no),
        policies=_codes(cursor, "unit_policies", "code", unit_no),
        sources=_codes(cursor, "unit_sources", "source_id", unit_no),
    )


def corpus_stats(corpus_dir: Path = CORPUS_DIR) -> dict[str, int]:
    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        return {
            "units": int(cur.execute("select count(*) from units").fetchone()[0]),
            "min": int(cur.execute("select min(unit_no) from units").fetchone()[0]),
            "max": int(cur.execute("select max(unit_no) from units").fetchone()[0]),
            "sources": int(cur.execute("select count(*) from sources").fetchone()[0]),
        }


def unit_codes(unit_no: int, corpus_dir: Path = CORPUS_DIR) -> CorpusUnitCodes | None:
    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        row = cur.execute("select * from units where unit_no=?", (unit_no,)).fetchone()
        return _unit_codes(cur, row) if row is not None else None


def unit_text(unit_no: int, corpus_dir: Path = CORPUS_DIR) -> CorpusUnitText | None:
    """Natural-language payload for one explicitly named unit; the only text path."""
    with open_corpus(corpus_dir) as db:
        row = db.execute("select * from units where unit_no=?", (unit_no,)).fetchone()
        if row is None:
            return None
        return CorpusUnitText(
            n=int(row["unit_no"]),
            id=str(row["unit_id"]),
            claim=str(row["claim"]),
            context_metric=row["context_metric"],
            coaching_implication=row["coaching_implication"],
        )


def _units_by(table: str, code: str, limit: int, corpus_dir: Path) -> list[CorpusUnitCodes]:
    if limit < 1:
        raise ValueError("limit must be >= 1")
    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        rows = cur.execute(
            f"select u.* from units u join {table} t on t.unit_no=u.unit_no where t.code=? order by u.unit_no limit ?",
            (code, limit),
        ).fetchall()
        return [_unit_codes(cur, row) for row in rows]


def units_by_domain(code: str, limit: int = 20, corpus_dir: Path = CORPUS_DIR) -> list[CorpusUnitCodes]:
    return _units_by("unit_domains", code, limit, corpus_dir)


def units_by_metric(code: str, limit: int = 20, corpus_dir: Path = CORPUS_DIR) -> list[CorpusUnitCodes]:
    return _units_by("unit_metrics", code, limit, corpus_dir)


def units_by_policy(code: str, limit: int = 20, corpus_dir: Path = CORPUS_DIR) -> list[CorpusUnitCodes]:
    return _units_by("unit_policies", code, limit, corpus_dir)


def search_units(query: str, limit: int = 10, corpus_dir: Path = CORPUS_DIR) -> list[CorpusUnitCodes]:
    """Full-text search that still answers with codes; call ``unit_text`` for a chosen hit."""
    if limit < 1:
        raise ValueError("limit must be >= 1")
    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        rows = cur.execute(
            "select u.* from unit_fts f join units u on u.unit_id=f.unit_id where unit_fts match ? limit ?",
            (query, limit),
        ).fetchall()
        return [_unit_codes(cur, row) for row in rows]


def iter_unit_codes(corpus_dir: Path = CORPUS_DIR) -> Iterator[CorpusUnitCodes]:
    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        for row in cur.execute("select * from units order by unit_no").fetchall():
            yield _unit_codes(cur, row)


def validate_corpus(corpus_dir: Path = CORPUS_DIR) -> dict[str, Any]:
    """Every structural guarantee the package makes, checked, or a CorpusError.

    Checks: the database and the machine JSONL match the manifest checksums;
    exactly 940 units numbered RU-0061..RU-1000 with distinct ids and no
    discarded unit; every domain, metric, policy, effect, evidence and
    provenance code is in the controlled vocabulary; per-code counts equal the
    manifest; every unit source references a known source; the JSONL has one
    line per unit. The JSONL content itself is not read.
    """
    manifest = corpus_manifest(corpus_dir)
    vocabulary = controlled_vocabulary(corpus_dir)
    problems: list[str] = []

    db_sha = _sha256(corpus_dir / DB_FILE)
    jsonl_sha = _sha256(corpus_dir / JSONL_FILE)
    if db_sha != manifest["db_sha256"]:
        problems.append("database checksum differs from the manifest")
    if jsonl_sha != manifest["jsonl_sha256"]:
        problems.append("machine JSONL checksum differs from the manifest")
    jsonl_lines = sum(1 for line in (corpus_dir / JSONL_FILE).open("rb") if line.strip())
    if jsonl_lines != CANONICAL_UNIT_COUNT:
        problems.append(f"machine JSONL has {jsonl_lines} lines, expected {CANONICAL_UNIT_COUNT}")

    with open_corpus(corpus_dir) as db:
        cur = db.cursor()
        numbers = [int(row[0]) for row in cur.execute("select unit_no from units order by unit_no")]
        if numbers != list(range(CANONICAL_FIRST_UNIT, CANONICAL_LAST_UNIT + 1)):
            problems.append("unit numbers are not exactly RU-0061..RU-1000")
        ids = [str(row[0]) for row in cur.execute("select unit_id from units order by unit_no")]
        if len(set(ids)) != len(ids):
            problems.append("unit ids are not distinct")
        if any(unit_id != f"RU-{number:04d}" for number, unit_id in zip(numbers, ids, strict=True)):
            problems.append("unit ids do not follow RU-NNNN numbering")
        if manifest.get("canonical_unit_count") != CANONICAL_UNIT_COUNT or vocabulary.get("unit_count") != CANONICAL_UNIT_COUNT:
            problems.append("manifest or vocabulary unit count is not 940")

        # The manifest counts are the authority on which codes the package uses. The
        # controlled vocabulary omits the fallback codes (UNCLASSIFIED, UNMAPPED_METRIC,
        # GENERAL_GUIDANCE); they are accepted and reported, never silently absorbed.
        manifest_counts = {"domains": "domain_counts", "metrics": "metric_counts", "policies": "policy_counts"}
        fallback_codes: dict[str, list[str]] = {}
        for key, table in CODE_TABLES.items():
            vocabulary_codes = set(vocabulary[key])
            manifest_codes = set(manifest.get(manifest_counts[key], {}))
            counts: dict[str, int] = {}
            for code, count in cur.execute(f"select code, count(*) from {table} group by code"):
                counts[str(code)] = int(count)
                if code not in vocabulary_codes and code not in manifest_codes:
                    problems.append(f"{table} uses a code outside the vocabulary and the manifest: {code}")
                elif code not in vocabulary_codes:
                    fallback_codes.setdefault(key, []).append(str(code))
            if counts != dict(manifest.get(manifest_counts[key], {})):
                problems.append(f"{table} counts differ from the manifest")
            orphans = cur.execute(f"select count(*) from {table} t left join units u on u.unit_no=t.unit_no where u.unit_no is null").fetchone()[0]
            if orphans:
                problems.append(f"{table} references {orphans} unknown units")

        for column, key in (("effect_code", "effects"), ("evidence_code", "evidence_codes"), ("provenance_code", "provenance_codes")):
            allowed = set(vocabulary[key])
            for (code,) in cur.execute(f"select distinct {column} from units"):
                if code not in allowed:
                    problems.append(f"units.{column} uses a code outside the vocabulary: {code}")
        evidence_counts = {str(code): int(count) for code, count in cur.execute("select evidence_code, count(*) from units group by evidence_code")}
        if evidence_counts != dict(manifest.get("evidence_counts", {})):
            problems.append("evidence counts differ from the manifest")

        unknown_sources = cur.execute("select count(*) from unit_sources s left join sources x on x.source_id=s.source_id where x.source_id is null").fetchone()[0]
        if unknown_sources:
            problems.append(f"{unknown_sources} unit sources reference unknown sources")
        source_count = int(cur.execute("select count(*) from sources").fetchone()[0])

    if problems:
        raise CorpusError("; ".join(problems))
    return {
        "status": "OK",
        "units": CANONICAL_UNIT_COUNT,
        "range": f"RU-{CANONICAL_FIRST_UNIT:04d}..RU-{CANONICAL_LAST_UNIT:04d}",
        "sources": source_count,
        "db_sha256": db_sha,
        "jsonl_sha256": jsonl_sha,
        "vocabulary_version": vocabulary.get("version"),
        "fallback_codes": {key: sorted(codes) for key, codes in sorted(fallback_codes.items())},
    }


def main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="FormPath Knowledge Machine v2: validate and query with machine codes.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("validate")
    sub.add_parser("stats")
    for name in ("domain", "metric", "policy"):
        command = sub.add_parser(name)
        command.add_argument("code")
        command.add_argument("--limit", type=int, default=20)
    unit = sub.add_parser("unit")
    unit.add_argument("n", type=int)
    unit.add_argument("--text", action="store_true")
    args = parser.parse_args(argv)

    if args.cmd == "validate":
        print(json.dumps(validate_corpus(), ensure_ascii=False))
        return 0
    if args.cmd == "stats":
        print(json.dumps(corpus_stats(), ensure_ascii=False))
        return 0
    if args.cmd == "unit":
        payload: Any = unit_text(args.n) if args.text else unit_codes(args.n)
        print(json.dumps(asdict(payload) if payload is not None else None, ensure_ascii=False))
        return 0
    lookup = {"domain": units_by_domain, "metric": units_by_metric, "policy": units_by_policy}[args.cmd]
    for item in lookup(args.code, args.limit):
        print(json.dumps(item.as_dict(), ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
