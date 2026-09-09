#!/usr/bin/env python3
import sqlite3, json, hashlib
from pathlib import Path
root=Path(__file__).parent
db=sqlite3.connect(root/"formpath_knowledge.sqlite")
nums=[r[0] for r in db.execute("select unit_no from units order by unit_no")]
assert nums==list(range(61,1001))
assert db.execute("select count(*) from units").fetchone()[0]==940
assert db.execute("select count(distinct unit_id) from units").fetchone()[0]==940
print(json.dumps({
  "status":"OK",
  "units":940,
  "range":"RU-0061..RU-1000",
  "db_sha256":hashlib.sha256((root/"formpath_knowledge.sqlite").read_bytes()).hexdigest()
},ensure_ascii=False))
