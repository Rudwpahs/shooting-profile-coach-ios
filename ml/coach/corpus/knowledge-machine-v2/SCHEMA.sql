units(unit_no PK, unit_id, effect_code, evidence_code, evidence_method, provenance_code,
claim, context_metric, coaching_implication, evidence_raw)
unit_domains(unit_no, code)
unit_metrics(unit_no, code)
unit_policies(unit_no, code)
sources(source_id PK, label, title, url)
unit_sources(unit_no, source_id)
unit_fts(FTS5)
