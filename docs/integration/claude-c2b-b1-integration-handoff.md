# Claude C2-B / B1 integration handoff — **C2-B B1 INTEGRATION READY**

Status: **C2-B B1 INTEGRATION READY** (2026-09-09). The Codex B1 backend boundaries are merged onto the
product UI line and wired behind the existing provider boundaries; the local/fixture composition stays as the
regression fallback. No frozen Coach contract, adapter, confidence mapping or feed-event semantics changed. No
RAG, corpus, scenario, training or native subject-lift work was done. B2/B3 were not started.

| Item | Value |
| --- | --- |
| Branch | `work/claude-hoop-hub-b1-integration` |
| Base | `work/claude-hoop-hub-ui-integration` @ `0f6f681` |
| Merged in | `work/codex-hoop-hub-backend-ai` @ `42d7b33` (normal `--no-ff` merge) |
| Merge SHA | `f848e51` |
| Final SHA | the commit carrying this document, on top of `6c3eea2` (head of `work/claude-hoop-hub-b1-integration` on origin) |
| Worktree | `C:/Users/USER/Projects/shooting-profile-coach-ios-b1` |
| Untouched branches | `work/claude-hoop-hub-system-contracts` @ `fd4d145`, `work/claude-hoop-hub-ui-integration` @ `0f6f681`, `work/codex-hoop-hub-backend-ai` @ `42d7b33` |

## 1. Merge and conflicts

The merge was clean: B1 added only new files plus `firestore.rules` (additive) and `ml/coach/pyproject.toml`
(a `service` extra). No content conflicts.

One post-merge regression surfaced that neither lane's own suite ran: the existing **static** rules contract test
(`tests/firestore-shooting-profile-rules.test.ts`, part of the unit suite) tokenizes `/databases/...` path
literals up to whitespace and could not parse the B1 helper `validSavedReel`
(`existsAfter(/databases/$(database)/documents/reelPosts/$(postId))` and `getAfter(...).data, userId`). Resolution:
the **test tokenizer** now ends a path literal at an unbalanced parenthesis, a comma or a member dot outside its own
`$(...)` segments (commit `6c3eea2`). `firestore.rules` was not modified; all 12 existing static assertions and the
67 emulator tests hold.

## 2. Commits on top of the merge

| SHA | Change |
| --- | --- |
| `f848e51` | chore(integration): merge Codex B1 backend AI boundaries (merge SHA) |
| `9e73ebc` | feat(reels): let the skeleton renderer consume a decoded MotionPacket |
| `83d7c8f` | feat(feed): persist saved moments through savedReels |
| `0d27785` | feat(feed): load public reels through the B1 persistence and storage boundaries |
| `59b12f3` | feat(feed): send Home coach requests through the authenticated transport |
| `6c3eea2` | test(rules): end a path literal at the parenthesis, comma or dot of its caller |
| (this commit) | docs(integration): this handoff — the final SHA is the head of `work/claude-hoop-hub-b1-integration` on origin |

## 3. Public Reel data path (actual)

```
Home
 └─ useHomePublicReels(user)                          hooks/use-home-public-reels.ts
     ├─ createReelSocialPersistence({ firestore, auth })   B1: lib/reels/social-persistence.ts
     │    └─ listPublicReels({ pageSize: 20 })  →  reelPosts (server read, privacy == "public", Zod-validated)
     ├─ createReelMediaLoader({ app })                      lib/reels/reel-media.ts (firebase/storage)
     │    ├─ resolveVideoUri("reels/{owner}/{post}/video.mp4")     → getDownloadURL | null
     │    └─ fetchMotionPacket("reels/{owner}/{post}/motion.v1.bin") → getBytes(≤ 7513) | null
     └─ loadPublicReels                                     lib/feed/public-reels.ts
          post → [video ref, motion ref] → decodeMotionPacketOrNull → publicReelFromPost → UserReel
```

- The reel is `{ kind: "user", id: "post-<postId>", author: "공개 슛폼", meta: <recency>, motion: { source: "public",
  postId, durationMs, packet | null, video | null } }`. No owner uid, object path or private field leaves the loader.
- My own posts are excluded (`excludeOwnerUid`); my reel still comes from my private profile, never from the feed.
- The private `RepresentativePose4DV2` is never read for a public post: `ReelMotion.public` carries only the decoded
  packet and a video URI. `buildHomeFeed` orders `own → coach → public… → references`; a coaching moment never rides
  on a stranger's reel (`insertCoachReel` receives `null` without my reel).

## 4. MotionPacket → skeleton path

- `lib/reels/motion-packet-adapter.ts`: `decodeMotionPacketOrNull(bytes)` wraps the Codex decoder and returns `null`
  for anything invalid; `skeletonSequenceFromMotionPacket(packet)` yields `{ frames[101]{phase, joints}, phaseAnchors[5] }`.
- The existing renderer accepts any frame with the twelve persisted joints (`lib/skeleton/skeleton-sequence.ts`):
  `buildRepresentativeDisplayJoints`, `projectRepresentativeJoints(AtYaw)`, `representativeGlyph(AtYaw)`,
  `representativeSequenceBounds`, `representativeReleaseFrameIndex`, `SkeletonLoop.profile`. The private profile still
  satisfies these structurally; nothing about its shape changed.
- `buildReelStageFit` builds the same fit for a public packet as for my profile (base yaw −45° for a right-hander,
  band `basic`), so loop, neighbour still, lifted still and the cue rings all draw a packet identically. Verified:
  a packet frame draws within 0.005 of the private frame (`tests/motion-packet-adapter.test.ts`).
- Motion Lift on a public reel: hold → grab → turn → up → save, unchanged machine, over the video when there is one.
  Without a packet (`fit === null`) the hold layer is not mounted: **video plays and pauses normally; only Motion
  Lift is unavailable**. A media-less post shows one line, `미디어 준비 중`, and remains swipable.

## 5. Save for Later persistence path

```
held-up release  →  ReelItem.onSave({ itemId, yaw })
  → Home: saveMoment (session state; rail bookmark turns solid)          lib/feed/saved-moments.ts
  → syncSavedMoment(social, item, moment)                                lib/feed/saved-reels-sync.ts
      public post → social.saveReelMoment({ postId, timeMs })            B1: users/{uid}/savedReels/{postId}
      timeMs = round(0.75 × durationMs)   (the release-proxy phase Motion Lift holds)
```

- One document per post (`savedReels/{postId}`, a transaction `set`): saving the same post again rewrites the same
  document; no duplicates. `savedAt` is the server timestamp written by the B1 boundary.
- Rail bookmark toggles: on → `saveReelMoment`, off → `unsaveReel`. Home seeds saved state from the first page of my
  saved reels on sign-in.
- My own reel and the reference are not posts and stay session-only. Any persistence failure returns
  `{ persisted: false, reason }` and is swallowed; playback and Motion Lift never wait on the network.

## 6. Authenticated Coach path

```
EXPO_PUBLIC_FORMPATH_COACH_URL set
  → createAuthenticatedCoachTransport({ endpoint: url, getIdToken: () => firebaseAuth.currentUser?.getIdToken() ?? null })
  → new RemoteCoachProvider({ url, transport })            (frozen provider, unchanged)
  → useHomeCoachReel → buildCoachFeedEvent → CoachReel only when eligible
```

- Bearer = the current Firebase user's ID token per call; HTTPS only; redirects refused; no service key in the app.
- No URL → `DeterministicCoachProvider` (as in C2-A). URL that the transport refuses (HTTP, credentials, query) →
  a provider whose every call is `unavailable/not_configured`; no signed-in user → `unavailable`. **Never** a silent
  fallback from a failing remote service to deterministic wording.
- **The remote AI is not production-ready.** No HTTPS Coach server is deployed; the Python `service_v1` exists in the
  scaffold with a deterministic provider behind it, and the app has no configured URL. Nothing in this branch claims
  otherwise.

## 7. Fallback behaviour (verified)

| Situation | Reel | Motion Lift | CoachReel |
| --- | --- | --- | --- |
| Firebase not configured / feed read fails | local composition (my reel, reference) | as before | as before |
| Public post: packet missing or fails to decode | video plays | unavailable on that reel | — |
| Public post: video URL refused, packet ok | skeleton loop | works | — |
| Public post: no media served | one line, swipable | unavailable | — |
| Save persistence fails | unchanged | unchanged | — |
| No Coach URL | — | — | deterministic provider |
| Coach URL but unusable / no user / offline / timeout / invalid reply | — | works | skipped |

## 8. Test results (this worktree, 2026-09-09)

| Gate | Result | Baseline |
| --- | --- | --- |
| Focused integration suites (packet adapter 4, public reels 6, reel media 3, saved-reel sync 4, home-feed 8, home-coach 5, ui-home 7, ui-render 18, reel-feed-render 17, coach-reel-adapter 6, reel-fixtures 6, representative-yaw 6, motion-lift-emergence 2) | all passed | new |
| MotionPacket tests (`tests/motion-packet-v1.test.ts`) | 37 passed | Codex 80 total TS (37 + 21 + 8 + 14), all passing |
| Social contract / persistence (`reel-social-contract` 21, `reel-social-persistence` 8) | 29 passed | |
| Coach transport (`coach-authenticated-transport`) | 14 passed | |
| `pnpm check` | 0 errors | |
| `pnpm lint` | 0 problems | |
| `pnpm test:unit` | **862 passed**, 1 skipped, 1 failed = the CRLF-only lockfile regex (56/56 with an LF lockfile, as in CI) | C2-A 758 + Codex 80 + new; nothing lost |
| Python `pytest` (ml/coach, with `.[dev,service]`) | **259 passed** | Codex 259 |
| Firestore emulator `pnpm test:rules` | **67 passed** (42 existing + 25 social) | Codex 67/67 |
| `expo export --platform web` | **21 static routes** incl. `/` and `/dev/reel-lab` | C2-A 21 |

Environment note: this machine has no Java. The emulator suite was run with a portable Temurin 21 JRE unpacked into
the session scratchpad and put on `PATH` for that command only; nothing was installed system-wide or committed.
The Python suite needs the B1 `service` extra (`firebase-admin`) to pass `test_security_v1`.

## 9. Still needs a real server / deployment

1. **Coach service**: deploy `formpath_coach.service_v1:create_app` behind TLS with a server-side Firebase Admin
   credential; set `EXPO_PUBLIC_FORMPATH_COACH_URL` at build time. Until then the app uses the deterministic provider.
2. **Storage bucket rules and uploads** for `reels/{uid}/{postId}/video.mp4` and `motion.v1.bin`: B1 defines the
   canonical paths and Firestore rules; the bucket policy and the publish/upload flow are not in the repository, so
   public media resolves to `null` today (reels degrade to the one-line placeholder).
3. **Publishing UI/flow** (`publishReel`, object upload) — not part of this gate.
4. **Cooldown / last-shown record** for the coaching moment — still per session.
5. **Firebase project configuration** (`EXPO_PUBLIC_FIREBASE_*`) in the build; without it every backend path is
   `unavailable` by design.

## 10. iPhone blockers (device-only)

- Hold-versus-`UIScrollView` feel for Motion Lift over a **video** reel (expo-video view under RNGH manual activation).
- expo-video playback in the paging `FlatList`: memory with several players mounted, pause on scroll-away, first-frame
  poster; the `windowSize 3` policy keeps at most three mounted but this must be measured.
- Haptics, VoiceOver adjustable actions, announced cue label, Reduce Motion, compact height — as in the C2-A handoff.
- Firebase Storage download latency for packets on a real network; the page fetches up to 20 packets (≤ 150 KB).
- **PR #4 physical-iPhone Basic 1+1 gate: unchanged, still mandatory, not bypassed.** This branch does not touch
  reconstruction math, capture, or the PR #4 branch.

## 11. What was deliberately not done

CoachRequest/Response/Observation schema changes, CoachFeedEvent semantics, representative adapter or confidence
mapping redesign, RAG, embeddings, corpus ingestion, scenario generation, QLoRA/SFT, model weight downloads, PR #4
reconstruction math, native subject lift. B2/B3 not started.
