# Extraction evidence boundary

Graphify combines deterministic structural extraction for code with semantic extraction for supported non-code inputs. Preserve the tool's evidence labels instead of flattening them into certainty.

For FormPath implementation decisions:

- source code/tests are authoritative for code flow;
- Firestore rules/schema are authoritative for storage/security behavior;
- graph edges are navigation evidence only;
- an INFERRED or ambiguous relationship must never be reported as source-confirmed without direct verification.
