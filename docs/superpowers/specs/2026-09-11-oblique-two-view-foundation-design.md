# Oblique Two-View Foundation Design

## Scope

This bounded foundation change prepares FormPath to evaluate a shooting-side oblique capture without changing reconstruction geometry yet. It addresses the real-video finding that an exact side view can occlude the far wrist while preserving the existing front-view policy.

## Decision 1 — View-aware quality policy

`front` remains byte-for-byte equivalent in required critical joints: shoulders 11/12, wrists 15/16, hips 23/24, knees 25/26, ankles 27/28.

`shooting_side` requires the anatomical shooting arm plus the existing lower-body set. Right-handed means 12/14/16; left-handed means 11/13/15. The opposite wrist is not a critical coverage requirement for this view. This does not weaken the shooting-arm gate and adds the shooting elbow, which the phase detector actually needs.

The locator ROI policy stays unchanged in this task because it has a different purpose: locating a stable person before a semantic capture view is evaluated.

## Decision 2 — One policy across emitters and parser

The policy must be used consistently by:

- the TypeScript `LandmarkSequenceV2` contract recomputation;
- the iOS native extractor when it writes `quality.reasons`;
- the local offline adapter used for engineering validation.

Otherwise an iOS/offline sequence could be rejected because its declared quality disagrees with the parser's recomputed quality.

## Decision 3 — Camera metadata follows as a separate compatibility task

This task does not add `shooting_oblique` yet. The next task will add explicit camera-view metadata and a migration/default path for existing `front` + `shooting_side` payloads before any generalized reconstruction solver is touched.

## Non-goals

- No threshold changes.
- No arbitrary-yaw reconstruction yet.
- No phase threshold calibration yet.
- No release-proxy changes yet.
- No raw video or landmark evidence in git.
