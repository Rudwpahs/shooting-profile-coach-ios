# Hoop Hub Integrated Experience Spec

Verified against repository state: 2026-09-09

## Product intent

Hoop Hub should feel like a mobile short-form basketball network first. The video remains visually dominant. 3D form inspection and AI coaching appear without turning the default Reel into an analytics dashboard. There are two distinct AI surfaces: **Motion Lift AI**, which the user explicitly invokes while inspecting a specific Reel, and **Home Coach Reels**, which appear sparingly inside the Home feed when there is a meaningful coaching event.

## Existing work to preserve

- PR #5 `feat/uiux-skeleton-social-redesign`: Graphite / Volt visual system, skeleton identity, compact Instagram-like chrome, Home/Profile/Explore/Analysis redesign, accessibility work.
- PR #4 `feat/p1-real-video-validation`: on-device MediaPipe capture, two-view phase alignment, 101×12 representative 4D estimate, uncertainty gates, privacy-safe persistence. Its physical-iPhone merge gate remains mandatory.
- `feat/formpath-coach-pytorch`: PyTorch/Pydantic/FastAPI coaching scaffold. It is not trained and has no corpus ingestion, RAG, PlayerState bridge, mobile integration or production deployment yet.
- Motion Lift research: use the existing pose projection/SVG renderer; long-press athlete after pause, drag horizontally to rotate, drag upward to save; subject cutout is optional visual enhancement and must never gate skeleton interaction.

## Experience contract

### Default Reel

- Full-height vertical Reel item with minimal social chrome.
- Video or skeleton post is the dominant surface.
- No persistent AI panel, angle dashboard or large 3D control cluster.
- Vertical swipe changes Reel; tap pauses/resumes.

### Feed item contract

The Home feed supports three visual item families under one scrolling contract:

- `UserReel` — a user's public basketball video/post plus optional compact motion packet.
- `CoachReel` — a personalized coaching intervention generated from the user's own measured history and rendered as a Reel-sized skeleton/motion story, not a dashboard card.
- `ReferenceReel` — an approved reference motion or curated teaching example.

All three occupy the same vertical feed slot and obey the same safe-area, pause, accessibility, prefetch and viewport rules. Their data contracts remain distinct so social content, coaching history and reference assets are not conflated.

### Home Coach Reel

- Coach Reels are **event-driven**, not inserted every fixed N posts.
- Valid event classes include: a newly completed analysis with a material finding, a repeated issue across sessions, a meaningful improvement, a retest due after prior coaching, a recapture/low-confidence event worth explaining, or another explicitly defined evidence-backed coaching event.
- If no meaningful event exists, the correct number of Coach Reels is zero.
- The initial surface contains one dominant skeleton/motion visualization plus one concise coaching message. Detailed hypotheses, evidence, drills and retest remain behind an explicit detail action.
- A Coach Reel can itself support hold/rotate/save where motion data exists, using the same interaction grammar as other motion-bearing feed items.
- Coach Reel eligibility/ranking is deterministic and testable. The language model does not decide feed placement from unconstrained free text.
- A model/network failure removes or degrades the Coach Reel; it must never interrupt ordinary feed scrolling.

### Motion Lift

- Paused athlete long-press enters `GRABBED` state.
- Skeleton becomes visible immediately from already-downloaded compact motion data.
- While the same pointer remains down: horizontal translation changes skeleton yaw; upward translation arms Save for Later.
- Subject lift/cutout is best-effort on-device decoration. Failure falls back to skeleton-only without spinner or blocking interaction.
- Release commits Save only after the upward threshold has armed; otherwise it ends/settles inspection.

### AI Coach

- AI does not receive raw video, face data, full landmark streams or private capture provenance.
- The mobile app converts a representative profile into a small set of measured/derived observations with explicit confidence, source, caveats and stable IDs.
- AI responses must refer back to those observation IDs when creating a visual cue. The UI must never position a joint/phase annotation from free-form model text alone.
- Default `UserReel` hides AI. Motion Lift may reveal one primary cue for the inspected Reel.
- `CoachReel` is a separate proactive surface and appears only through the deterministic event/eligibility layer described above.
- Full explanation, evidence, drill and retest live behind an explicit detail action/sheet.
- AI unavailability must not block Reel playback, skeleton inspection, posting or Save for Later.

## Shared data boundaries

### Private analysis record

Keep the existing V2 representative profile/evidence contract for owner analysis and provenance. Do not weaken it to optimize the public feed.

### Public Reel playback record

Firestore stores only social/post metadata and references. Video and one versioned compact motion packet live in object storage/CDN. Masks, thumbnails, gesture path and current yaw are device-only transient state.

### Coach request

A versioned `CoachRequestV1` contains player/context fields plus compact observations. Each observation has:

- `id`
- `metric`
- `value`
- `unit`
- `reference`
- `measurement_confidence`
- `source`
- optional `phase_anchor`
- optional `joints`
- `caveats`

The source must distinguish `multi_view_3d` from lower-confidence inputs and retain the V2 boundary caveat that the profile is a representative phase-fused estimate, not measured metric 3D.

### Coach response

Extend the existing structured response with an optional `primary_visual_cue` that references an observation ID and may specify display text. The UI resolves phase/joints from the referenced observation, not from arbitrary generated coordinates.

### Coach feed event

A versioned `CoachFeedEventV1` is produced by deterministic app/backend logic from measured history. It contains the event class, source profile/retest references, evidence/confidence summary, creation time and eligibility/cooldown state. A language model may generate the coaching response for an eligible event but cannot invent the event or its placement priority.

## Integration strategy

1. Freeze PR #5 visual behavior as the UI baseline after owner review.
2. Build the shared app-side Coach contract and deterministic provider before relying on a trained model.
3. Build the representative-profile → coach-observation adapter and tests.
4. Define a shared `FeedItem` shell and convert Home into the actual vertical Reel container while reusing PR #5 tokens/components.
5. Build Home Coach Reel eligibility/ranking separately from model generation, then render `CoachReel` through the shared feed shell.
6. Add Motion Lift over motion-bearing Reel surfaces using the existing 3D projection/SVG renderer.
7. Add public compact motion-packet storage/fetch and Save for Later.
8. Integrate a provider interface so both Motion Lift AI and Coach Reels work with a deterministic local response first, then the remote PyTorch service without redesign.
9. Complete corpus ingestion/RAG/training/evaluation and deploy the real Coach behind the same contract.
10. Merge PR #4 only after its existing physical-iPhone gate passes; do not bypass that gate for UI integration.

## Non-goals for first integration

- no Three.js / React Three Fiber;
- no second pose model at Reel playback time;
- no Skia unless measured SVG/native compositing performance or visual quality requires it;
- no raw private V2 frame documents as the public playback format;
- no claim that PyTorch Coach is trained or production-ready before evidence exists;
- no segmentation dependency for core interaction;
- no AI-generated biomechanics claim unsupported by a measured observation/evidence item;
- no fixed-frequency AI insertion such as “every third Reel”;
- no language-model authority over feed eligibility or priority.

## End-to-end acceptance scenario

A user captures a valid front/side shot, receives a representative profile, optionally publishes the shot, and the measured result can produce a deterministic coaching event. The Home feed may later include a Coach Reel only if that event remains eligible. Another user scrolls to a public Reel, taps to pause, holds the athlete, sees the skeleton immediately, drags left/right to inspect it, sees at most one grounded Motion Lift Coach cue, drags upward to Save for Later, releases, and later reopens the saved post at the stored moment. A Coach Reel itself can be held/rotated/saved when it has motion data. The feed still works in skeleton-only mode if segmentation fails and still works without Coach if the AI service is unavailable.
