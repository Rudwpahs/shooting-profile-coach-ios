# FormPath Prestudy — Architecture & Product Design

Date: 2026-09-06
Status: approved design baseline
Owner project: FormPath Basketball
Target implementation: separate repository `Rudwpahs/formpath-prestudy`

## 1. Purpose

FormPath Prestudy is a browser-based learning environment that teaches the exact math, computer vision, biomechanics, validation, and ML foundations needed to understand and contribute to FormPath Basketball.

It replaces the earlier PR1 Study Room pattern with a more structured loop:

1. learn a concept,
2. watch a source lesson,
3. inspect an interactive visual,
4. run a small Python experiment,
5. answer a short quiz,
6. connect the result to real FormPath concepts or code.

The prestudy site is educational infrastructure. It is not part of the production iOS application, does not process user shooting videos, and does not contain product secrets or private evaluation data.

## 2. Product boundary

### Included in v1

- A responsive web application.
- Dashboard with curriculum map and progress.
- Learn pages for each module.
- Browser-local Python laboratory using Pyodide.
- Short quizzes with immediate feedback.
- Reference area for formulas, terms, source links, and FormPath mappings.
- Local progress persistence using `localStorage`.
- Public OCW / university / official-source lesson embeds where embedding is permitted.
- Fallback behavior when Python or an external embed cannot load.
- Content stored as Markdown/JSON separate from application logic.

### Explicitly excluded from v1

- User accounts.
- Cloud sync.
- Raw video upload.
- Pose extraction from user media.
- Firebase.
- FormPath production credentials.
- AI chat tutor.
- Grading backend.
- Social features.
- LMS integration.
- Native iOS/Android packaging.

These features may be added later only after a separate design pass.

## 3. Repository strategy

Create a new repository named `Rudwpahs/formpath-prestudy`.

Reasons:

- It isolates educational work from the iOS product and PR #4 validation gate.
- It allows static-site deployment without Expo/iOS dependencies.
- It prevents learning-content edits from affecting production CI.
- It allows independent release, rollback, and archival.

The existing `shooting-profile-coach-ios` repository may link to the prestudy site, but it must not import prestudy runtime code.

## 4. Technology choice

### Front end

- React
- TypeScript
- Vite
- React Router
- Markdown rendering for lesson text
- Zod for content schema validation

### Python runtime

- Pyodide loaded on demand in the browser
- Python execution isolated from product code and user files
- Supported starter packages limited to what the current lesson needs, beginning with standard library + NumPy

### Persistence

- `localStorage` only in v1
- Versioned progress schema so future migrations are possible

### Deployment

Primary goal: static deployment.

Acceptable hosting targets:

- GitHub Pages,
- Vercel static deployment,
- or an equivalent static host.

The app must not require a backend server to complete any v1 learning activity.

## 5. Information architecture

The application has five primary areas.

### 5.1 Dashboard

Shows:

- overall completion,
- current module,
- next recommended lesson,
- module map,
- recently completed lab/quiz states,
- reset-progress control.

### 5.2 Learn

One route per learning module.

Each module uses the same instructional sequence:

1. Why this matters for FormPath
2. Core concept
3. Source lesson / lecture
4. Interactive visual or worked example
5. Python lab
6. Five-question knowledge check
7. FormPath connection
8. Completion gate

### 5.3 Lab

A focused Python environment with:

- editable starter code,
- run button,
- reset button,
- stdout / stderr output,
- expected-output hint,
- explanation panel,
- offline/read-only fallback.

### 5.4 Quiz

Five-question checks per module.

Rules:

- Questions are educational, not credentialed assessment.
- Immediate explanation is shown after answering.
- Passing threshold for module completion: 4/5.
- Retakes are unlimited.
- Completion stores only module id, score, attempt count, and completion time locally.

### 5.5 Reference

Contains:

- terminology,
- formulas,
- coordinate conventions,
- landmark references,
- source links,
- FormPath mapping notes,
- common failure cases.

## 6. Curriculum v1

The curriculum follows dependency order rather than academic subject labels.

### Module 01 — Coordinate systems and vectors

Goals:

- 2D and 3D coordinates
- vector addition/subtraction
- magnitude and normalization
- dot product
- angle from vectors

FormPath connection:

- joint vectors
- camera-coordinate reasoning
- 3D direction comparisons

### Module 02 — Joint angles in 2D

Goals:

- three-point joint angle
- cosine formula
- clamping numerical values
- degeneracy when vector magnitude is near zero

FormPath connection:

- elbow/knee angle measurements
- why pose confidence and geometry gates matter

### Module 03 — Video, frames, sampling, and time

Goals:

- frame rate
- timestamps
- temporal sampling
- motion aliasing
- normalized shot phase

FormPath connection:

- non-simultaneous front/side take alignment
- phase-based comparison

### Module 04 — Pose landmarks

Goals:

- what a landmark detector outputs
- normalized image coordinates
- visibility/confidence
- missing/occluded landmarks
- anatomical identity versus screen position

FormPath connection:

- `LandmarkSequenceV2`
- left/right identity
- recapture logic

### Module 05 — Reconstructing direction from two views

Goals:

- front/side projection intuition
- tangent relationships
- direction vector reconstruction
- conditioning and singular cases

FormPath connection:

- projection-constraint reconstruction
- why this is an estimate rather than calibrated triangulation

### Module 06 — Cross-view alignment

Goals:

- phase anchors
- temporal normalization
- mismatch detection
- duplicate-view and mirrored-view failure cases

FormPath connection:

- cross-view phase gate
- cross-view geometry gate
- typed recapture reasons

### Module 07 — Measurement uncertainty

Goals:

- noise versus meaningful change
- propagation intuition
- confidence
- variance
- error cones
- repeatability

FormPath connection:

- uncertainty propagation
- confidence caps
- why small observed differences cannot automatically be called biomechanical change

### Module 08 — Basketball shooting biomechanics

Goals:

- kinetic chain
- joint coordination
- release variables
- variability versus error
- context-dependent movement strategies

FormPath connection:

- why FormPath must avoid a single ideal-angle template
- coordination and repeatability framing

### Module 09 — Data, labels, and evidence quality

Goals:

- training versus validation data
- annotation
- source provenance
- leakage
- bias
- synthetic versus measured data

FormPath connection:

- actual 3D vs representative estimate
- source admission
- validation reports

### Module 10 — PyTorch foundations

Goals:

- tensors
- datasets
- batches
- forward pass
- loss
- gradients
- optimization

FormPath connection:

- future AI coaching system foundations
- why PyTorch training is downstream of evidence quality

### Module 11 — Validation and failure cases

Goals:

- unit tests
- synthetic fixtures
- golden cases
- distribution shift
- ablation
- false confidence
- privacy-safe evaluation

FormPath connection:

- real-video validation gate
- synthetic sweep versus physical iPhone evidence
- why code-complete is not the same as product-validated

### Module 12 — Reading the FormPath pipeline

Goals:

- trace data through a real software pipeline
- distinguish boundaries, validation, UI, and storage
- identify failure exits

FormPath connection:

A guided map of concepts such as:

- capture
- pose extraction
- landmark sequence
- phase alignment
- representative profile construction
- quality gates
- persistence boundary

The prestudy must not expose private media, credentials, or unsafe internal data.

## 7. Content model

Each module is represented by validated structured content.

Required fields:

```ts
interface LearningModule {
  id: string;
  order: number;
  title: string;
  summary: string;
  whyItMatters: string;
  prerequisites: string[];
  lessonMarkdown: string;
  sources: SourceItem[];
  visual?: VisualDefinition;
  lab: LabDefinition;
  quiz: QuizQuestion[];
  formPathConnections: FormPathConnection[];
}
```

Content validation runs during build and test.

No module may ship with missing title, missing lab, fewer than five quiz questions, broken internal references, or an undeclared prerequisite.

## 8. Source policy

Source embeds and links must follow these rules:

- Prefer official university, OCW, documentation, standards, or primary research sources.
- Store source title, publisher, URL, and the reason the source is used.
- Do not copy long copyrighted text into the site.
- If embedding is prohibited, show a normal outbound link instead.
- Broken external embeds must not block lesson completion.
- A source URL is not treated as proof that a claim is correct; lesson claims that matter to FormPath should be reviewed before publication.

## 9. Python Lab design

Pyodide loads only when a user opens a lab or presses Run for the first time.

Execution flow:

1. UI requests runtime.
2. Loading state is shown.
3. Pyodide loads.
4. Required package set for the lesson loads.
5. Starter code executes.
6. stdout/stderr are captured.
7. Result is compared with a simple lesson-specific check where appropriate.
8. The browser keeps code only in local state unless the user explicitly saves progress locally.

Failure behavior:

- Network/runtime failure shows the starter code and expected result.
- Lesson text and quiz remain usable.
- A retry control is available.
- No backend fallback executes arbitrary user Python.

## 10. Progress model

Versioned local schema:

```ts
interface PrestudyProgressV1 {
  schemaVersion: 1;
  moduleProgress: Record<string, {
    lessonViewed: boolean;
    labCompleted: boolean;
    bestQuizScore: number;
    quizAttempts: number;
    completed: boolean;
    completedAt?: string;
  }>;
}
```

Completion rule:

- lesson viewed,
- lab run successfully or explicitly completed through fallback mode,
- quiz score >= 4/5.

Progress loss is acceptable if browser storage is cleared; v1 does not promise cloud recovery.

## 11. UI / UX direction

Desktop layout:

- left: curriculum roadmap,
- center: current lesson/lab/quiz,
- right: “Why this matters for FormPath” contextual panel.

Mobile layout:

- single main column,
- curriculum becomes drawer/sheet,
- FormPath context panel moves inline below the current concept,
- Python editor remains horizontally scrollable without forcing the whole page to overflow.

Design requirements:

- clear typography hierarchy,
- readable code,
- visible progress state,
- no decorative UI that competes with learning content,
- keyboard operability,
- sufficient contrast,
- focus states,
- reduced-motion compatibility,
- accessible labels for quiz controls and code-run states.

## 12. Error and empty states

Required states:

- Pyodide loading
- Pyodide load failure
- Python execution error
- source embed unavailable
- module content invalid at build time
- no progress yet
- completed curriculum
- local progress reset confirmation

Build-time content errors must fail CI rather than appear as runtime blank pages.

## 13. Testing strategy

### Unit tests

- content schema validation
- prerequisite graph validity
- progress reducer/storage migration
- quiz scoring
- lab-result checks

### Integration tests

- open module → run lab → pass quiz → completion state updates
- refresh → progress restores
- failed Pyodide load → fallback remains usable
- invalid route → safe navigation to curriculum

### Build checks

- TypeScript
- lint
- test suite
- production build
- internal-link validation

### UI checks

At minimum:

- desktop viewport
- narrow mobile viewport
- keyboard navigation
- visible focus state
- text scaling/reflow
- loading/error/empty states

## 14. Initial delivery slice

The first implementation milestone must not attempt all twelve modules at full depth.

Milestone 1 includes:

- application shell,
- dashboard,
- module routing,
- local progress,
- Pyodide runtime wrapper,
- quiz engine,
- reference page,
- complete Module 01,
- complete Module 02,
- placeholder-free metadata records for Modules 03–12 that clearly mark them as locked/not yet released rather than unfinished pages.

Milestone 1 is successful when a new learner can complete Module 01 and Module 02 end-to-end on desktop and mobile without a backend.

## 15. Future milestones

### Milestone 2

Modules 03–06: video, pose landmarks, two-view direction, cross-view alignment.

### Milestone 3

Modules 07–09: uncertainty, biomechanics, evidence/data quality.

### Milestone 4

Modules 10–12: PyTorch, validation, FormPath pipeline reading.

### Milestone 5 — optional, separate design approval required

- account/cloud progress
- AI tutor
- deeper coding exercises
- controlled linkage to repository examples

## 16. Acceptance criteria for v1 architecture

The architecture is considered implemented when:

1. The site is in a repository separate from the iOS app.
2. It can build and deploy as a static site.
3. Module 01 and Module 02 are fully completable.
4. Python executes client-side through Pyodide.
5. Pyodide failure does not block learning or quiz completion.
6. Progress survives reload through localStorage.
7. No raw user media, credentials, Firebase data, or private evaluation artifacts are required.
8. Content schema failures stop CI.
9. Desktop and narrow-mobile flows are usable.
10. The architecture leaves a clean boundary for future cloud sync without requiring it now.

## 17. Explicit non-goals and safety boundaries

- Prestudy does not claim to validate shooting performance.
- Prestudy exercises do not produce medical or injury-risk advice.
- Prestudy does not turn research-only estimates into measured 3D claims.
- Prestudy does not upload or persist arbitrary learner Python code to a server.
- Prestudy must preserve the distinction between synthetic examples, representative estimates, and actual measured data.

## 18. Implementation decision

Proceed with the independent static-site architecture using React + TypeScript + Vite + Pyodide + localStorage, with content isolated in validated Markdown/JSON and Module 01–02 as the first complete vertical slice.
