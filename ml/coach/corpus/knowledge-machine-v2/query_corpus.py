#!/usr/bin/env python3
import argparse, sqlite3, json
from pathlib import Path
DB=Path(__file__).with_name("formpath_knowledge.sqlite")

def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest="cmd",required=True)
    sub.add_parser("stats")
    s=sub.add_parser("unit"); s.add_argument("n",type=int); s.add_argument("--text",action="store_true")
    s=sub.add_parser("domain"); s.add_argument("code"); s.add_argument("--limit",type=int,default=20); s.add_argument("--text",action="store_true")
    s=sub.add_parser("metric"); s.add_argument("code"); s.add_argument("--limit",type=int,default=20); s.add_argument("--text",action="store_true")
    s=sub.add_parser("policy"); s.add_argument("code"); s.add_argument("--limit",type=int,default=20); s.add_argument("--text",action="store_true")
    s=sub.add_parser("search"); s.add_argument("query"); s.add_argument("--limit",type=int,default=10)
    a=p.parse_args()
    db=sqlite3.connect(DB); db.row_factory=sqlite3.Row; cur=db.cursor()

    if a.cmd=="stats":
        print(json.dumps({
            "units":cur.execute("select count(*) from units").fetchone()[0],
            "min":cur.execute("select min(unit_no) from units").fetchone()[0],
            "max":cur.execute("select max(unit_no) from units").fetchone()[0],
            "sources":cur.execute("select count(*) from sources").fetchone()[0],
        },ensure_ascii=False))
        return

    if a.cmd=="unit":
        rs=cur.execute("select * from units where unit_no=?",(a.n,)).fetchall()
    elif a.cmd=="domain":
        rs=cur.execute("""select u.* from units u join unit_domains d on d.unit_no=u.unit_no
                          where d.code=? order by u.unit_no limit ?""",(a.code,a.limit)).fetchall()
    elif a.cmd=="metric":
        rs=cur.execute("""select u.* from units u join unit_metrics m on m.unit_no=u.unit_no
                          where m.code=? order by u.unit_no limit ?""",(a.code,a.limit)).fetchall()
    elif a.cmd=="policy":
        rs=cur.execute("""select u.* from units u join unit_policies p on p.unit_no=u.unit_no
                          where p.code=? order by u.unit_no limit ?""",(a.code,a.limit)).fetchall()
    else:
        rs=cur.execute("""select u.* from unit_fts f join units u on u.unit_id=f.unit_id
                          where unit_fts match ? limit ?""",(a.query,a.limit)).fetchall()

    for r in rs:
        out={
            "n":r["unit_no"], "id":r["unit_id"], "effect":r["effect_code"],
            "evidence":r["evidence_code"], "provenance":r["provenance_code"],
            "domains":[x[0] for x in cur.execute("select code from unit_domains where unit_no=?",(r["unit_no"],))],
            "metrics":[x[0] for x in cur.execute("select code from unit_metrics where unit_no=?",(r["unit_no"],))],
            "policies":[x[0] for x in cur.execute("select code from unit_policies where unit_no=?",(r["unit_no"],))],
            "sources":[x[0] for x in cur.execute("select source_id from unit_sources where unit_no=?",(r["unit_no"],))],
        }
        if getattr(a,"text",False) or a.cmd=="search":
            out["claim"]=r["claim"]
            out["context_metric"]=r["context_metric"]
            out["coaching_implication"]=r["coaching_implication"]
        print(json.dumps(out,ensure_ascii=False,separators=(",",":")))

if __name__=="__main__":
    main()
