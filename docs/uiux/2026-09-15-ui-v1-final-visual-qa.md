# Hoop Hub UI v1 — visual QA record (2026-09-15)

Branch `work/hoophub-ui-v1-final`. Every image under `artifacts/ui-v1-final/` is a capture of the
real implementation rendered from an exported development web bundle; nothing is a mock.

## Method

1. Export with the development demo enabled (the demo is unreachable in a production bundle, see
   `tests/ui-demo-isolation.test.ts`):

   ```
   EXPO_PUBLIC_HOOPHUB_UI_DEMO=1 corepack pnpm exec expo export --platform web --dev --output-dir <scratch>/ui-demo-dist
   ```

   The export lists 21 static routes; `/dev/ui-demo` is among them only because of the two gates.
2. Serve the export statically (`npx serve -s <scratch>/ui-demo-dist -l 8090`).
3. Drive Chromium through Playwright at 375×812, 390×844 and 430×932 CSS pixels and save the viewport.
4. Real routes (`/`, `/explore`) are photographed as they are, signed out. The other screens are
   rendered by `app/dev/ui-demo.tsx`, which mounts the same presentational components the product
   routes use (`HomeFeed`, `ProfileHero` / `ProfileStats` / `MotionGrid`, the analysis layers with
   `SequenceViewer`, `CaptureSessionView`) and feeds them fixtures derived from the synthetic landmark
   session (`lib/dev/ui-demo-fixtures.ts`): no account, no network, no recording, no person. Capture
   states are produced by running the unchanged `captureSessionReducer`.

## Captures

| File stem | Screen · state | Widths |
| --- | --- | --- |
| `home-signed-out` | Home, real route, signed out (placeholder stage, story strip without "내 슛폼") | 375 |
| `home-ready` | Home, latest representative profile ready (skeleton loop first, one goal line, reference loop) | 375 · 390 · 430 |
| `explore` | Explore, real route, anonymous reference grid with view chips | 375 |
| `capture-setup` | Capture, "서는 곳과 카메라": hand toggle, one guide row per view from guidance data, mode line | 375 · 390 · 430 |
| `capture-recapture` | Capture, collecting with the front take rejected: status dot, typed reason, the two ways to supply a clip | 375 |
| `capture-review` | Capture, review: result skeleton first, band line, evidence line, consent copy, save | 375 |
| `analysis-complete` | Analysis, layer 1 (band + one finding), the player with the finding's joint ringed, collapsed layers 2 and 3 | 375 · 390 · 430 |
| `analysis-recapture` | Analysis with `quality.passed === false`: the band line turns to "재촬영 필요" in the warning colour | 375 |
| `profile-signed-out` | Profile, signed out: silhouette hero, dashed stats, one goal line | 375 |
| `profile-signed-in` | Profile, signed in: skeleton hero with view dots, two numbers, goal line, motion grid | 375 · 390 · 430 |

## Findings and fixes

Each capture was checked for excess text, dead space, tiny skeletons, dashboard-like cards,
inconsistent padding, safe-area problems, duplicated information, metrics above motion and
hierarchy problems.

| Screen | Width | Issue | Fix | Commit |
| --- | --- | --- | --- | --- |
| Capture · recapture | 375 | The rejected take's reason sat in the narrow column beside two action pills and was cut at two lines, hiding the half that says what to do. | The reason now takes the card's full width under the take row; still two lines at most. | `8170b74` |
| Capture · review | 375 | The evidence line ("… 위상 결합 4D 추정 · 실측 3D 아님") was truncated to one line, losing "실측 3D 아님". | The line may wrap once. | `8170b74` |
| All | all | The development bundle's LogBox toast covered the bottom bar in the first captures. | Not a product defect (see environment notes); the capture script dismisses the overlay before the shot. | — |

No other finding. Widths 390 and 430 scale the same layouts without new issues: stages keep their
aspect, the grid stays three columns, the capture rows keep the 44-point actions.

## Environment notes (not product defects)

- The development web bundle logs a React hydration warning on every route: expo-router's static
  render emits the root stack's inactive screen containers with different `aria-hidden`/`display`
  values from the client tree. The client regenerates the tree, so the rendered screen is the client
  render. This is a web dev-export artefact; the product target is iOS.
- `ws://localhost:8090/hot` and `/message` fail because the bundle is served statically without
  Metro; expected.
- `props.pointerEvents is deprecated` comes from a dependency's web shim, not from this branch.

## States that exist in code but were not photographed

Every status of the capture state machine is rendered by `CaptureSessionView`
(`tests/ui-capture.test.ts` pins all ten); the demo route exposes `setup`, `collecting`,
`recapture` and `review`. `ready_to_aggregate` / `aggregating` (spinner and one line), `complete`,
`cancelled` and `error` are covered by the test and by the unchanged reducer tests, not by images.
Home `disabled` / `empty` / `error` / `loading` and Profile `loading` / `empty` are rendered by
`HomeFeed` and `ProfileHero` (`tests/ui-home.test.ts`, `tests/ui-profile.test.ts`) and share the
placeholder stage that `home-signed-out` and `profile-signed-out` show.
