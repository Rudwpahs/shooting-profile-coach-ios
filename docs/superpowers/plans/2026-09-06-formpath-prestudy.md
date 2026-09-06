# FormPath Prestudy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone static FormPath Prestudy learning site where a learner can progress through 12 FormPath-specific modules, run deterministic Python exercises in-browser, complete quizzes, preserve local progress, and keep learning when Pyodide or embedded media fails.

**Architecture:** A Vite + React + TypeScript SPA with data-driven lesson records, React Router routes, a versioned localStorage progress store, and a lazily loaded Pyodide worker/fallback boundary. The project is independent of `shooting-profile-coach-ios`; FormPath integration is educational only through public docs/code links and small cited snippets.

**Tech Stack:** React 19, TypeScript 5, Vite 7, React Router 7, Zod, Pyodide 0.28.x, Vitest, React Testing Library, ESLint, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-formpath-prestudy-design.md`

## Global Constraints

- Runtime is a static-hostable SPA; no backend, Firebase, auth, cloud progress, remote code execution, or user video upload.
- Target implementation repository is `Rudwpahs/formpath-prestudy`; production app repository must not carry website runtime or dependencies.
- Progress is browser-local, schema-versioned, and safely resettable on corrupt payloads.
- Pyodide failure must never block lesson reading; every lab has starter code, expected interpretation, Retry, and Reset.
- Curriculum ships with exactly 12 ordered MVP modules from coordinates/vectors through validation and reading the FormPath pipeline.
- Two-view lessons must explicitly distinguish projection-constrained direction reconstruction from calibrated/simultaneous triangulation and ground-truth 3D.
- Public educational sources stay attributed; copyrighted videos are linked or embedded only through provider-approved embeds.
- Build gate: typecheck, lint, unit tests, static production build, and critical Playwright smoke flow all pass.

---

## File Structure

```text
formpath-prestudy/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── index.html
├── playwright.config.ts
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx                         # app bootstrap
│   ├── app.tsx                          # router shell
│   ├── styles.css                       # global design tokens/layout
│   ├── content/
│   │   ├── schema.ts                    # Lesson/Lab/Quiz/Source Zod schemas + TS types
│   │   ├── modules.ts                   # 12 validated module records
│   │   └── references.ts                # glossary/formulas/source catalog
│   ├── progress/
│   │   ├── store.ts                     # versioned localStorage load/save/migrate/reset
│   │   └── store.test.ts
│   ├── labs/
│   │   ├── definitions.ts               # deterministic lab definitions
│   │   ├── pyodide-client.ts            # worker-facing runtime API + fallback states
│   │   ├── pyodide.worker.ts            # Pyodide load/run implementation
│   │   └── pyodide-client.test.ts
│   ├── quiz/
│   │   ├── score.ts                     # deterministic scoring
│   │   └── score.test.ts
│   ├── components/
│   │   ├── app-shell.tsx                # desktop 3-column/mobile shell
│   │   ├── roadmap.tsx                  # ordered progress nav
│   │   ├── formpath-context.tsx         # right-side/inline relevance panel
│   │   ├── lecture-card.tsx             # embed/link fallback
│   │   ├── python-lab.tsx               # editor/run/reset/fallback UI
│   │   ├── quiz-card.tsx                # retryable quiz UI
│   │   └── module-section.tsx            # lesson section renderer
│   ├── pages/
│   │   ├── dashboard.tsx
│   │   ├── learn.tsx
│   │   ├── lab.tsx
│   │   ├── quiz.tsx
│   │   └── reference.tsx
│   └── tests/
│       ├── content-schema.test.ts
│       ├── learner-flow.test.tsx
│       └── setup.ts
├── e2e/
│   └── learner-flow.spec.ts
└── README.md
```

### Task 1: Bootstrap static app shell and route contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `index.html`, `src/main.tsx`, `src/app.tsx`, `src/styles.css`, `src/components/app-shell.tsx`, `src/pages/dashboard.tsx`, `src/pages/learn.tsx`, `src/pages/lab.tsx`, `src/pages/quiz.tsx`, `src/pages/reference.tsx`, `src/tests/setup.ts`
- Test: `src/tests/learner-flow.test.tsx`

**Interfaces:**
- Produces routes `/`, `/learn/:slug`, `/lab/:labId`, `/quiz/:quizId`, `/reference`.
- Produces `AppShell({ children, context? })` used by every page.

- [ ] **Step 1: Write failing route smoke test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../app";

it("renders the dashboard at the root route", () => {
  render(<MemoryRouter initialEntries={["/"]}><AppRoutes /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /FormPath Prestudy/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the smoke test and confirm it fails before routes exist**

Run: `npm test -- --run src/tests/learner-flow.test.tsx`
Expected: FAIL because `AppRoutes` or dashboard heading does not exist.

- [ ] **Step 3: Implement router and shell minimally**

```tsx
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/learn/:slug" element={<LearnPage />} />
      <Route path="/lab/:labId" element={<LabPage />} />
      <Route path="/quiz/:quizId" element={<QuizPage />} />
      <Route path="/reference" element={<ReferencePage />} />
    </Routes>
  );
}
```

`AppShell` uses CSS grid on desktop (`280px minmax(0,1fr) 300px`) and a single column below `900px`; navigation remains usable when `context` is absent.

- [ ] **Step 4: Run test, typecheck, and static build**

Run: `npm test -- --run src/tests/learner-flow.test.tsx && npm run typecheck && npm run build`
Expected: PASS and `dist/` is produced.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts eslint.config.js index.html src
 git commit -m "feat: bootstrap FormPath Prestudy shell"
```

### Task 2: Add typed curriculum schema and all 12 module records

**Files:**
- Create: `src/content/schema.ts`, `src/content/modules.ts`, `src/content/references.ts`
- Create: `src/components/roadmap.tsx`, `src/components/module-section.tsx`, `src/components/formpath-context.tsx`, `src/components/lecture-card.tsx`
- Modify: `src/pages/dashboard.tsx`, `src/pages/learn.tsx`, `src/components/app-shell.tsx`
- Test: `src/tests/content-schema.test.ts`

**Interfaces:**
- Produces `LessonModule`, `LectureSource`, `FormPathConnection`, `QuizDefinition`, `LabDefinitionRef` types.
- Produces `modules: LessonModule[]` with exactly 12 validated ordered records.
- Produces `getModuleBySlug(slug: string): LessonModule | undefined`.

- [ ] **Step 1: Write failing schema and curriculum integrity tests**

```ts
it("ships exactly twelve ordered MVP modules", () => {
  expect(modules).toHaveLength(12);
  expect(modules.map((m) => m.id)).toEqual(Array.from({ length: 12 }, (_, i) => `m${i + 1}`));
});

it("resolves every prerequisite and lesson-linked lab/quiz id", () => {
  const ids = new Set(modules.map((m) => m.id));
  for (const module of modules) {
    for (const prerequisite of module.prerequisites) expect(ids.has(prerequisite)).toBe(true);
    expect(module.labId).toBeTruthy();
    expect(module.quizId).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run tests and confirm missing curriculum fails**

Run: `npm test -- --run src/tests/content-schema.test.ts`
Expected: FAIL because `modules` and schemas do not yet exist.

- [ ] **Step 3: Implement Zod schemas and the 12 exact module titles**

The ordered titles are:

```ts
[
  "Coordinate systems and vectors",
  "Dot products, magnitudes, and angles",
  "2D joint-angle calculation",
  "Digital video, frames, sampling, and time",
  "Pose landmarks and landmark confidence",
  "3D direction reconstruction from two projections",
  "Shot-phase representation and cross-view alignment",
  "Measurement noise, uncertainty, and confidence propagation",
  "Basketball shooting biomechanics and coordination",
  "Data representation, features, labels, and train/validation/test separation",
  "PyTorch fundamentals for FormPath-oriented experiments",
  "Validation, failure cases, and reading the real FormPath pipeline",
]
```

Each record contains at least two objectives, one concept section, a lab id, a quiz id, one FormPath connection, and one cited reference. Module 6 concept text explicitly states: `non-simultaneous two-view reconstruction is not calibrated triangulation or ground-truth 3D`.

- [ ] **Step 4: Render roadmap and first complete Learn page from data only**

`LearnPage` resolves `slug`, renders concept sections, lecture cards, FormPath context, and links to `/lab/:labId` and `/quiz/:quizId`. Unknown slugs render a module-unavailable message without crashing the shell.

- [ ] **Step 5: Run schema/UI tests and lint**

Run: `npm test -- --run src/tests/content-schema.test.ts src/tests/learner-flow.test.tsx && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content src/components src/pages src/tests
 git commit -m "feat: add typed FormPath curriculum"
```

### Task 3: Implement versioned local progress and deterministic quiz scoring

**Files:**
- Create: `src/progress/store.ts`, `src/progress/store.test.ts`, `src/quiz/score.ts`, `src/quiz/score.test.ts`, `src/components/quiz-card.tsx`
- Modify: `src/pages/dashboard.tsx`, `src/pages/quiz.tsx`, `src/components/roadmap.tsx`

**Interfaces:**
- `loadProgress(storage: Storage): ProgressState`
- `saveProgress(storage: Storage, state: ProgressState): void`
- `markModuleComplete(state: ProgressState, moduleId: string): ProgressState`
- `recordQuizAttempt(state: ProgressState, quizId: string, score: number, total: number): ProgressState`
- `scoreQuiz(quiz: QuizDefinition, answers: Record<string,string>): { score: number; total: number }`

- [ ] **Step 1: Write failing migration/corruption tests**

```ts
it("returns a clean v1 state for corrupt storage", () => {
  localStorage.setItem("formpath-prestudy-progress", "{broken");
  expect(loadProgress(localStorage)).toEqual({ version: 1, completedModuleIds: [], quizAttempts: {}, lastVisitedSlug: null, codeDrafts: {} });
});

it("keeps only the latest score record per quiz", () => {
  const next = recordQuizAttempt(emptyProgress(), "q1", 4, 5);
  expect(next.quizAttempts.q1).toMatchObject({ score: 4, total: 5 });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- --run src/progress/store.test.ts src/quiz/score.test.ts`
Expected: FAIL because store/scoring functions do not exist.

- [ ] **Step 3: Implement v1 state with safe parse/reset**

```ts
export type ProgressState = {
  version: 1;
  completedModuleIds: string[];
  quizAttempts: Record<string, { score: number; total: number; attemptedAt: string }>;
  lastVisitedSlug: string | null;
  codeDrafts: Record<string, string>;
};
```

Invalid JSON or unsupported versions return `emptyProgress()`; no other localStorage keys are deleted.

- [ ] **Step 4: Wire dashboard/roadmap/quiz completion**

A quiz result can be retried; module completion is explicit after knowledge check. Reloading restores completion and latest quiz score.

- [ ] **Step 5: Run tests**

Run: `npm test -- --run src/progress/store.test.ts src/quiz/score.test.ts src/tests/learner-flow.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/progress src/quiz src/components src/pages
 git commit -m "feat: persist learning progress and quiz results"
```

### Task 4: Build Pyodide worker lab with read-only fallback

**Files:**
- Create: `src/labs/definitions.ts`, `src/labs/pyodide-client.ts`, `src/labs/pyodide.worker.ts`, `src/labs/pyodide-client.test.ts`, `src/components/python-lab.tsx`
- Modify: `src/pages/lab.tsx`, `src/progress/store.ts`

**Interfaces:**
- `LabDefinition = { id, moduleId, title, starterCode, expectedOutput, packages, explanation }`
- `createPyodideRunner(workerFactory): { run(code, packages): Promise<RunResult>; dispose(): void }`
- `RunResult = { kind: "success"; stdout: string } | { kind: "error"; message: string }`

- [ ] **Step 1: Write failing client-state tests with a fake worker**

```ts
it("returns worker stdout for a successful run", async () => {
  const runner = createPyodideRunner(() => fakeWorkerResponding({ type: "result", stdout: "3.1416\n" }));
  await expect(runner.run("print(3.1416)", [])).resolves.toEqual({ kind: "success", stdout: "3.1416\n" });
});
```

Also test worker initialization failure maps to a scoped error rather than throwing through React.

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run src/labs/pyodide-client.test.ts`
Expected: FAIL because runner does not exist.

- [ ] **Step 3: Implement worker protocol and lazy Pyodide loading**

Worker messages use only:

```ts
type WorkerRequest = { id: string; type: "run"; code: string; packages: string[] };
type WorkerResponse = { id: string; type: "result"; stdout: string } | { id: string; type: "error"; message: string };
```

The worker loads Pyodide from the pinned CDN, calls `loadPackage` for allowed packages (`numpy` only in MVP), redirects stdout/stderr, and never receives credentials/files/FormPath user data.

- [ ] **Step 4: Add 12 deterministic lab definitions**

Examples include vector magnitude/dot product, 2D joint angle, frame-duration calculation, landmark confidence filtering, two-projection direction normalization, phase interpolation, uncertainty Monte Carlo, coordination variability toy data, split leakage demonstration, a tiny PyTorch tensor/linear-model conceptual lab (with read-only expected output if PyTorch is not browser-loaded), and validation invariant checks.

- [ ] **Step 5: Implement PythonLab UI fallback**

States: `idle | loading | ready | running | unavailable`. `unavailable` keeps editor text visible, displays expected output/interpretation, and offers Retry. Reset restores starter code. Most recent draft is persisted locally.

- [ ] **Step 6: Run client/UI tests and build**

Run: `npm test -- --run src/labs/pyodide-client.test.ts src/tests/learner-flow.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/labs src/components/python-lab.tsx src/pages/lab.tsx src/progress/store.ts
 git commit -m "feat: add browser Python labs with fallback"
```

### Task 5: Complete citations, reference view, and FormPath architecture connections

**Files:**
- Modify: `src/content/modules.ts`, `src/content/references.ts`, `src/pages/reference.tsx`, `src/components/lecture-card.tsx`
- Test: `src/tests/content-schema.test.ts`

**Interfaces:**
- Every external source record exposes `{ title, publisher, url, sourceType, embedUrl? }`.
- Every FormPath connection exposes `{ label, repositoryPath, explanation, evidenceClass }` where evidenceClass is one of `math | implementation | synthetic-validation | real-video-validation | biomechanics | product-hypothesis`.

- [ ] **Step 1: Add failing source-policy tests**

```ts
it("keeps attribution and evidence class on every FormPath connection", () => {
  for (const module of modules) {
    for (const connection of module.formPathConnections) {
      expect(connection.label.length).toBeGreaterThan(0);
      expect(["math","implementation","synthetic-validation","real-video-validation","biomechanics","product-hypothesis"]).toContain(connection.evidenceClass);
    }
  }
});
```

- [ ] **Step 2: Run test and confirm incomplete source records fail**

Run: `npm test -- --run src/tests/content-schema.test.ts`
Expected: FAIL until every module source/connection is complete.

- [ ] **Step 3: Populate lawful primary sources and public FormPath paths**

Use official/primary sources where possible: MIT OpenCourseWare for linear algebra/probability foundations, Python/NumPy/PyTorch official documentation, MediaPipe Pose Landmarker documentation, and peer-reviewed shooting-biomechanics papers. FormPath code connections use public paths such as `lib/shooting-profile/cross-view-alignment.ts`, `lib/shooting-profile/two-view-pipeline.ts`, `docs/PROJECT_MAP.md`, and relevant evaluation docs; do not copy raw user evidence or secrets.

- [ ] **Step 4: Render Reference page**

Reference view groups glossary, formulas, source catalog, FormPath architecture links, and evidence-class legend. Embedded media failure always leaves the source title and outbound link visible.

- [ ] **Step 5: Run content tests and manual outbound-link audit**

Run: `npm test -- --run src/tests/content-schema.test.ts && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content src/pages/reference.tsx src/components/lecture-card.tsx src/tests/content-schema.test.ts
 git commit -m "docs: complete FormPath learning references"
```

### Task 6: Responsive/accessibility hardening and full learner-flow tests

**Files:**
- Modify: `src/styles.css`, `src/components/app-shell.tsx`, `src/components/roadmap.tsx`, `src/components/python-lab.tsx`, `src/components/quiz-card.tsx`
- Create: `playwright.config.ts`, `e2e/learner-flow.spec.ts`
- Modify: `src/tests/learner-flow.test.tsx`

**Interfaces:**
- Mobile roadmap opens from a button with accessible name `Open learning roadmap`.
- Lab output uses an `aria-live="polite"` region.
- Current module navigation exposes `aria-current="page"`.

- [ ] **Step 1: Add failing accessibility/UI tests**

```tsx
expect(screen.getByRole("button", { name: "Open learning roadmap" })).toBeInTheDocument();
expect(screen.getByTestId("python-output")).toHaveAttribute("aria-live", "polite");
```

- [ ] **Step 2: Implement mobile drawer and keyboard/focus behavior**

At widths below `900px`, hide fixed sidebars, show roadmap trigger, return focus to trigger after closing, and render FormPath context inline after concept content.

- [ ] **Step 3: Add Playwright critical flow**

```ts
test("learner completes module one and progress survives reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Coordinate systems and vectors/i }).click();
  await page.getByRole("link", { name: /Open Python lab/i }).click();
  await page.getByRole("button", { name: /Run/i }).click();
  await page.getByRole("link", { name: /Knowledge check/i }).click();
  // choose the fixture-defined correct answers
  await page.getByRole("button", { name: /Submit/i }).click();
  await page.getByRole("button", { name: /Mark module complete/i }).click();
  await page.reload();
  await expect(page.getByText(/1 of 12 complete/i)).toBeVisible();
});
```

A second smoke test forces lab runtime unavailable state and asserts lesson content remains readable.

- [ ] **Step 4: Run browser tests at desktop and mobile viewport**

Run: `npm run test:e2e`
Expected: critical learner flow passes in Chromium desktop and configured mobile viewport.

- [ ] **Step 5: Commit**

```bash
git add src e2e playwright.config.ts
 git commit -m "test: harden responsive learner flow"
```

### Task 7: Final build gate, documentation, and portable delivery package

**Files:**
- Create: `README.md`
- Modify: `package.json`
- Produce: `formpath-prestudy.zip`

**Interfaces:**
- README documents `npm install`, `npm run dev`, `npm test`, `npm run test:e2e`, `npm run build`, static deployment, and the privacy boundary.
- Package scripts expose `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`.

- [ ] **Step 1: Add README with exact project boundary**

README states that this is an educational companion, not the FormPath production runtime; it accepts no real shooting videos and performs no Firebase writes.

- [ ] **Step 2: Run the complete verification gate**

```bash
npm run typecheck
npm run lint
npm test -- --run
npm run build
npm run test:e2e
```

Expected: every command exits 0.

- [ ] **Step 3: Inspect production bundle for accidental secrets/private assets**

Run:

```bash
grep -RniE "FIREBASE_PRIVATE|PRIVATE KEY|BEGIN RSA|raw video|consent record" dist src || true
```

Expected: no credential/private-user-data material; educational prose containing generic terms is reviewed manually.

- [ ] **Step 4: Create portable ZIP excluding transient dependencies**

```bash
zip -r formpath-prestudy.zip . -x "node_modules/*" ".git/*" "dist/*" "playwright-report/*" "test-results/*"
```

- [ ] **Step 5: Commit docs/package script adjustments**

```bash
git add README.md package.json package-lock.json
 git commit -m "docs: prepare FormPath Prestudy delivery"
```

## Self-review results

- Spec coverage: all 17 design sections map to Tasks 1–7; no backend/auth/video-upload requirement slipped into scope.
- Placeholder scan: no implementation placeholders remain; every task has explicit files, interfaces, commands, and acceptance behavior.
- Type consistency: module/lab/quiz IDs, progress v1 fields, worker protocol, source records, and evidence classes are named consistently across tasks.
- Execution note: the currently exposed GitHub connector cannot create a brand-new repository. Implementation must therefore remain in an isolated local git project and portable ZIP until `Rudwpahs/formpath-prestudy` can be created through an authorized repo-creation path; do not stage website runtime in `shooting-profile-coach-ios` as a workaround.
