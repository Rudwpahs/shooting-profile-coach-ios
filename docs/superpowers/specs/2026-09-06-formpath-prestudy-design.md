# FormPath Prestudy — Design Specification

Date: 2026-09-06
Status: approved design, implementation not started
Owner project: FormPath Basketball
Target implementation repository: `Rudwpahs/formpath-prestudy` (new standalone repository)
Planning record currently stored in: `Rudwpahs/shooting-profile-coach-ios`

## 1. Purpose

FormPath Prestudy is a standalone learning site that teaches the concepts required to understand, validate, and eventually modify the FormPath Basketball analysis pipeline.

It is intentionally separated from the production iOS repository. Learning-content changes, browser experiments, and teaching dependencies must not affect the mobile app, real-video validation gates, Firestore contracts, or product release flow.

The site should improve on the old PR1 Study Room model. Instead of a sequence of mostly isolated lesson pages, each module follows one continuous loop:

1. learn the concept,
2. watch a relevant public lecture segment,
3. manipulate a visual or numerical example,
4. run Python in the browser,
5. answer a short knowledge check,
6. connect the idea to a real FormPath subsystem.

## 2. Success criteria

The first usable release is successful when a learner can:

- open the site without an account;
- move through a visible learning roadmap;
- complete at least the first 12 FormPath-specific modules;
- run Python exercises directly in the browser with no local Python installation;
- see a graceful read-only fallback when the Python runtime cannot load;
- complete short quizzes and preserve progress locally;
- follow clearly cited OCW/public-video references;
- understand where each lesson maps into the FormPath codebase without exposing private user data;
- use the site on desktop and mobile.

The MVP does not require cloud accounts, multiplayer features, chat, remote code execution, or a backend database.

## 3. Repository and deployment boundary

### 3.1 Standalone repository

Implementation belongs in a new repository:

`Rudwpahs/formpath-prestudy`

The production repository `Rudwpahs/shooting-profile-coach-ios` must not carry the website runtime or its dependencies.

This design document is temporarily stored in the production repository only as a planning/provenance record until the standalone repository exists.

### 3.2 Proposed stack

- React
- TypeScript
- Vite
- React Router
- Markdown/MDX or typed lesson JSON for content
- Pyodide for in-browser Python
- localStorage for progress and exercise state
- Vitest + React Testing Library
- Playwright for a small end-to-end smoke suite

Deployment should use a static-hosting target. The first implementation must not depend on a server runtime.

## 4. Information architecture

The site has five top-level areas.

### Dashboard

Shows overall progress, current module, recommended next lesson, recently completed labs, and the full learning roadmap.

### Learn

Primary lesson reader. Each lesson has concept text, equations, diagrams/interactive examples, public lecture references, and a FormPath relevance panel.

### Lab

Browser Python environment for lesson-linked experiments. Labs are constrained educational exercises, not a general cloud IDE.

### Quiz

Short checks attached to modules. Results are stored locally and may be retried.

### Reference

Glossary, formula sheet, FormPath architecture map, source list, and links to relevant public code/documentation.

## 5. Core learning flow

Every module uses the same teaching sequence:

1. **Concept** — concise explanation and minimum mathematics.
2. **Lecture** — embedded or linked public lecture/video when embedding is permitted.
3. **Visual intuition** — interactive geometric or data illustration where useful.
4. **Python lab** — starter code, runnable experiment, expected outcome, reset button.
5. **Knowledge check** — approximately five questions.
6. **FormPath connection** — what production subsystem uses this concept and what the learner should inspect next.

A module may omit the lecture or visualization when they add no educational value, but it must always contain Concept, Practice, Knowledge Check, and FormPath Connection sections.

## 6. Initial curriculum

The first release targets 12 modules in this order.

1. Coordinate systems and vectors
2. Dot products, magnitudes, and angles
3. 2D joint-angle calculation
4. Digital video, frames, sampling, and time
5. Pose landmarks and landmark confidence
6. 3D direction reconstruction from two projections
7. Shot-phase representation and cross-view alignment
8. Measurement noise, uncertainty, and confidence propagation
9. Basketball shooting biomechanics and coordination
10. Data representation, features, labels, and train/validation/test separation
11. PyTorch fundamentals for FormPath-oriented experiments
12. Validation, failure cases, and reading the real FormPath pipeline

The curriculum must teach FormPath's actual limitations. It must not imply that non-simultaneous two-view video is calibrated triangulation or validated ground-truth 3D.

## 7. Lesson content model

Lesson content should be data-driven rather than hard-coded into page components.

Each module record should include at minimum:

- `id`
- `slug`
- `title`
- `summary`
- `estimatedMinutes`
- `prerequisites`
- `objectives`
- `conceptSections`
- `lectureSources`
- `labId`
- `quizId`
- `formPathConnections`
- `references`

Source records must include title, publisher/author, URL, and source type. Content rendering must keep attribution visible.

## 8. Python Lab architecture

Pyodide runs entirely in the user's browser.

### Supported MVP behavior

- editable starter code;
- Run and Reset controls;
- stdout/stderr output;
- deterministic lesson examples;
- NumPy support when the lesson requires it;
- timeout/worker isolation where practical;
- no filesystem or credential assumptions;
- no access to FormPath private videos, tokens, Firebase credentials, or private datasets.

### Fallback behavior

If Pyodide fails to initialize, the lesson remains usable. The site shows:

- the starter code,
- the expected output or interpretation,
- a clear note that interactive execution is unavailable,
- a retry control.

Python runtime failure must never make the reading portion of a module inaccessible.

## 9. Progress model

MVP progress is local-only.

Persist:

- completed modules;
- quiz attempts and latest score;
- last visited lesson;
- optionally the most recent code draft per lab.

Do not create user identities or transmit progress to a remote service in the MVP.

Storage must be versioned so future schema changes can migrate or safely reset stale local data.

## 10. UI and responsive behavior

### Desktop

Three-column learning layout:

- left: roadmap/navigation;
- center: lesson, visualization, lab, quiz;
- right: `Why this matters to FormPath` context panel.

### Mobile

Collapse to a single content column. Roadmap becomes a drawer/sheet, and the FormPath context panel appears inline near the relevant lesson section.

### Visual direction

The design should feel like a serious technical learning environment rather than a marketing site. Use strong hierarchy, generous whitespace, readable equations/code, restrained motion, and clear progress states.

Do not copy the PR1 Study Room visual template directly.

## 11. FormPath integration boundary

The site may link to or quote small public snippets from the FormPath repository for educational context, but must not become an alternate product runtime.

The learning site must not:

- accept real user shooting videos in the MVP;
- write to FormPath Firestore;
- require Firebase authentication;
- duplicate mobile capture logic;
- claim heuristic reconstruction as calibrated 3D;
- expose secrets, private evaluation artifacts, or user-derived evidence.

A lesson's FormPath connection should point to concepts, modules, docs, and interfaces rather than reproduce large product files.

## 12. Error handling

The site should degrade by feature rather than fail as a whole.

- Pyodide unavailable → read-only lab fallback.
- Embedded media blocked → direct source link remains visible.
- Corrupt local progress → reset only the progress payload after preserving the app shell.
- Invalid lesson data → development/test failure; production displays a module-unavailable message instead of crashing global navigation.
- Unsupported browser feature → show a scoped explanation and keep ordinary lesson reading available.

## 13. Testing strategy

### Unit/schema tests

- every lesson satisfies the content schema;
- prerequisites reference valid module IDs;
- lesson/lab/quiz IDs resolve;
- internal route generation is valid;
- progress serialization and migration work;
- quiz scoring is deterministic.

### Lab tests

Maintain a non-browser reference test for each deterministic Python sample where possible. Browser smoke tests verify that Pyodide loading, execution, reset, output, and fallback UI behave correctly.

### UI tests

- dashboard progress state;
- module completion;
- quiz retry;
- progress restoration after reload;
- desktop navigation;
- mobile navigation/drawer;
- media-link fallback;
- Python read-only fallback.

### Build gate

At minimum:

- typecheck passes;
- lint passes;
- unit tests pass;
- production static build succeeds;
- Playwright smoke tests pass for the critical learner flow.

## 14. Content and source policy

Use public, lawful educational sources. Prefer primary educational institutions, official documentation, peer-reviewed papers, and original project documentation.

For videos:

- embed only when the provider permits embedding;
- otherwise show a normal outbound link;
- do not mirror copyrighted video assets into the repository.

For FormPath claims, distinguish clearly among:

- mathematical identity;
- implementation behavior;
- synthetic validation;
- real-video validation;
- biomechanical evidence;
- product hypothesis.

## 15. Explicit non-goals for MVP

The first version does not include:

- accounts or authentication;
- cloud progress sync;
- AI tutor/chat;
- social/DM features;
- certificates;
- instructor dashboards;
- remote notebooks;
- arbitrary package installation;
- user video upload;
- Firebase integration;
- model training in the browser.

These may be evaluated later only after the learning core is used successfully.

## 16. Delivery sequence

Implementation should proceed in vertical slices rather than building every subsystem before any lesson works.

Recommended sequence:

1. project shell + design system + routing;
2. typed content schema + Dashboard + one complete lesson;
3. Pyodide Lab with fallback;
4. quiz + local progress;
5. complete modules 1–4;
6. responsive/mobile hardening;
7. complete modules 5–8;
8. FormPath architecture/reference view;
9. complete modules 9–12;
10. accessibility, performance, source audit, and deployment verification.

## 17. Acceptance boundary

The first release is complete only when one learner can start at Module 1, complete concept → practice → quiz → FormPath connection, reload the browser without losing progress, continue through the roadmap, and use every lesson even if the Python runtime or embedded media fails.
