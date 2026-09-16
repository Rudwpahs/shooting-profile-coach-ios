# Hoop Hub Release Compliance Design

Date: 2026-09-16
Status: Approved design, pending written-spec review
Target: Korea-first App Store release with architecture that does not block later US/EU expansion
Repository: `Rudwpahs/shooting-profile-coach-ios`

## Goal

Turn the 20-point release-compliance audit into a concrete, testable release gate for Hoop Hub. The work must close Apple review blockers, Korean privacy/commercial-law gaps, account/data lifecycle gaps, legacy claim risks, accessibility gaps, and licensing/SDK documentation gaps without adding speculative monetization, marketing, or child-service features that the product does not currently need.

## Scope and principles

1. Korea-first launch is the immediate target.
2. Apple App Store review requirements are treated as release gates.
3. US/EU requirements are recorded where they materially affect architecture, but full global legal expansion is not implemented unless required for the Korean/Apple release path.
4. Do not invent legal/business facts. Company name, representative, business registration number, support email, privacy officer/contact, address, overseas recipient details, and production Firestore region must come from verified operator configuration or remain explicit release blockers.
5. Existing privacy and motion-data boundaries remain at least as strict as they are today. Do not weaken raw-media exclusion, UID ownership, representative-estimate wording, validation gates, or deletion ordering.
6. Avoid collecting new personal data to solve compliance problems. In particular, age-gating should not persist exact birth date unless later requirements make that necessary.
7. No direct merge to `main` without a separate approval and successful verification.

## Compliance source of truth

The release process will maintain one durable compliance map connecting each of the original 20 audit items to:

- governing rule or product decision;
- affected data/UI/runtime surface;
- implementation status;
- automated verification where possible;
- manual release verification where automation is insufficient;
- an explicit `PASS`, `BLOCKED`, or `N/A` state.

Decision-relevant legal claims must be grounded in current primary/official material. The research record belongs under `docs/research/`, while implementation details belong in this spec and the implementation plan.

## Product decisions

### Age policy

V1 is designed as a 14+ Korean service. Before account-creating fields are submitted, the signup flow must confirm that the prospective user is at least 14. A user who indicates an age below the threshold must be stopped before email/password account creation or cloud profile creation. The V1 system will not implement parental consent; a future under-14 product is a separate project with its own design and legal review.

The age gate should minimize data:

- prefer a threshold answer or ephemeral age calculation;
- do not store exact birth date in Firebase/Firestore merely to prove the gate happened;
- document the product rule clearly in Terms/Privacy surfaces.

### Legal surfaces

Add one in-app Legal & Privacy entry point accessible without hunting through hidden routes. It must surface:

- Privacy Policy;
- Terms of Service;
- Cookie notice for the web build;
- support/contact/business details;
- account/data deletion entry point for signed-in users.

The documents must distinguish disclosure from consent. Do not use a single generic checkbox to pretend that every processing activity has the same legal basis.

Where a required operator fact is unknown, display or ship no fake placeholder as if it were production-ready. The release checklist must remain blocked until the value is verified.

### Signup consent design

The signup path must expose Privacy Policy and Terms before account creation. Required consent must be separated from optional future marketing consent. The current app has no marketing-email feature, so do not add optional marketing consent now.

The signup flow must not create a Firebase user until the age gate and required acknowledgements are satisfied.

### Account deletion

The existing per-shooting-profile deletion is not equivalent to account deletion. Add a destructive `Delete Account` flow that removes associated owner data before removing the Firebase Auth principal.

Required ordering:

1. acquire/verify the current authenticated owner;
2. delete owner-private Firestore shooting-profile subtrees and legacy owner-private records governed by the current app;
3. delete the `/users/{uid}` owner/profile document after subordinate data is absent;
4. delete the Firebase Authentication account;
5. clear local profile/session/cache state;
6. return the UI to a signed-out state and confirm completion only after required deletion postconditions succeed.

The flow must handle Firebase recent-login/reauthentication requirements and partial failures without falsely telling the user that deletion completed. Where a retry can safely resume, design it as idempotent.

### Data minimization and cross-border mapping

Audit actual runtime data flows rather than treating every package dependency as data collection.

Create a data ledger covering at least:

- Firebase Authentication;
- Cloud Firestore;
- MediaPipeTasksVision / on-device pose extraction;
- Expo Image Picker / camera and photo-library access;
- local AsyncStorage/SecureStore where used;
- web session cookie path;
- any active backend/server path that survives the release build.

For each active path record:

- data fields;
- purpose;
- local vs network processing;
- processor/recipient;
- country/region where known;
- retention rule;
- deletion path;
- App Store privacy-label category candidate;
- Korean cross-border disclosure requirement if applicable.

The duplicated Firestore copy of Firebase Auth email must be reviewed. If no release feature requires it, remove it from the Firestore profile contract and rules instead of merely documenting it.

### Apple privacy-manifest and SDK gate

Source inspection alone cannot certify the final IPA. Add repository-level checks/documentation for privacy-manifest expectations and required-reason APIs, but keep the final status blocked until the release archive is inspected on macOS/Xcode.

The release checklist must distinguish:

- static repository checks possible on Windows/CI;
- dependency-provided manifests that must be verified in the generated iOS project/archive;
- final Xcode privacy report/archive inspection that cannot be honestly marked complete from source alone.

### Legacy claims and routes

Production navigation must not expose legacy content that conflicts with the current product boundary. Hidden tab configuration is insufficient if a route can still be reached by URL/deep link.

For obsolete production routes such as legacy motion/assessment/library/settings surfaces:

- remove them from production routing, or
- hard-redirect them to supported modern surfaces.

Production-visible copy must not present monocular/image-lifted pose estimates as actual 3D or imply verified named-player matching without approved provenance/licensing. Automated source-level regression tests must lock this boundary.

### Accessibility

Preserve the current semantic token, contrast, focus, accessibility-label, and reduced-motion protections. Every new legal/signup/deletion screen must meet the same quality gate:

- accessible control labels/roles/states;
- visible keyboard focus where supported;
- minimum touch-target treatment consistent with current components;
- readable text scaling and compact-screen reflow;
- contrast-safe semantic colors;
- useful loading, error, destructive-confirmation, and empty states.

Automated tests are necessary but not sufficient. The release checklist must include real-device VoiceOver, Full Keyboard Access/Switch Control where applicable, text scaling, and reduced-motion inspection.

### Cookie policy

The native iOS app does not need a cookie banner merely because the shared codebase contains cookie code. The web build currently contains a necessary authentication session cookie (`app_session_id`). Document it in the web cookie notice.

Do not add a consent banner unless a non-essential cookie/analytics/advertising technology is actually introduced. The release checklist must reopen the consent-banner question when such a technology is added.

### Payments, fees, refunds, marketing email

Current V1 has no purchase/subscription/paid digital feature and no marketing-email system. Do not add speculative flows.

Instead create future-feature gates:

- introducing IAP/subscriptions reopens refund, price-disclosure, cancellation, and Korean e-commerce review;
- introducing non-essential analytics/advertising cookies reopens cookie-consent review;
- introducing marketing email reopens separate marketing consent and unsubscribe/withdrawal implementation.

### Business/legal operator details

Add a structured configuration/source for legal operator fields instead of scattering literals through UI. Required production values include the subset applicable to the actual operator and launch model, such as:

- service/operator name;
- support email/contact;
- privacy contact/officer;
- business/representative details required by Korean App Store/e-commerce context;
- links/versions/effective dates for legal documents.

Unknown required values keep release readiness blocked.

### Third-party and asset licensing

Create a release-grade third-party/asset inventory and `THIRD_PARTY_NOTICES.md` covering only what actually ships or is legally relevant to shipped material. At minimum audit:

- Barlow / Barlow Condensed;
- Material/community icon libraries;
- MediaPipeTasksVision and pose model resources;
- Expo/Firebase licensing notices as required;
- CMU/reference data and any retained source-derived product assets;
- app icon/branding provenance;
- unused template assets such as React-logo images, which should be removed if not needed by production.

No named-player/source media should become a shipping asset merely because it exists elsewhere in repository research artifacts.

## Workstreams mapped to the original 20-point audit

| Workstream | Audit items | Deliverable |
| --- | --- | --- |
| Compliance source of truth | all | release matrix with `PASS/BLOCKED/N/A` evidence |
| Legal surfaces and signup | 1, 2, 4, 6, 16 | legal hub, policies, consent-aware signup |
| Account lifecycle | 20 | full account/data deletion flow |
| Age architecture | 17 | pre-account 14+ gate, no unnecessary DOB persistence |
| Data/SDK audit | 7, 8 | active-data ledger, cross-border mapping, minimization changes |
| Apple privacy build gate | 8 | static checks + macOS archive checklist |
| Claims/routes | 11, 12 | production route cleanup and claim regression tests |
| Accessibility | 13, 14, 15 | automated + manual QA gates |
| Conditional future gates | 3, 5, 9, 10, 18 | documented triggers, no speculative features |
| Licensing | 19 | third-party notices + shipping-asset inventory |

## Error-handling requirements

- Legal/config data: missing required production values must fail release-readiness checks rather than silently showing fake values.
- Signup: age/required acknowledgements are evaluated before `createUserWithEmailAndPassword` can execute.
- Account deletion: completion UI is forbidden until cloud owner data and Auth deletion reach the specified terminal state. Recent-login errors must produce a reauthentication path or a clear retry state.
- Firestore cleanup: deletion must remain owner-bound and preserve current rules-based safety. No broad client-side ability to delete another user's data.
- Legacy route cleanup: direct navigation/deep link must resolve to a supported route, not merely disappear from the tab bar.
- SDK/privacy-manifest validation: unknown final-archive state is `BLOCKED`, never inferred as pass from package metadata.

## Testing strategy

Implementation uses test-first development where behavior changes are testable.

Required automated coverage includes:

1. signup cannot invoke Firebase account creation before 14+ and required legal acknowledgements;
2. under-14 rejection occurs without sending signup credentials to Firebase;
3. Firestore profile no longer writes duplicated email if minimization review confirms removal;
4. account deletion calls subordinate data deletion before Auth deletion and never reports success on partial failure;
5. account deletion handles reauthentication/recent-login failure explicitly;
6. legal routes/links are reachable from supported UI;
7. legacy production routes cannot expose unsupported named-player/3D claims;
8. new controls satisfy the repository's accessibility/focus/token conventions;
9. release-compliance matrix contains all 20 original items and no unresolved item can be marked `PASS` without evidence.

Required project gates after implementation:

- relevant targeted unit tests during each task;
- `pnpm test:unit`;
- `pnpm check`;
- `pnpm lint`;
- web export/route inspection where affected;
- Firestore rules tests when contracts/rules change;
- manual iPhone/iOS accessibility and deletion QA before production release;
- final macOS/Xcode privacy/archive inspection before App Store submission.

## Release states

The compliance matrix uses exactly three product-facing readiness states:

- `PASS`: evidence proves the current release build/process satisfies the defined requirement;
- `BLOCKED`: a required fact, implementation, test, or manual release check is missing;
- `N/A`: the feature/data flow does not exist in the current release and a trigger is documented for re-review.

`N/A` must never be used to avoid a requirement that is already triggered by current behavior.

## Non-goals for this project

- building an under-14 parental-consent service;
- adding payments/subscriptions;
- adding marketing email;
- adding advertising or analytics SDKs;
- drafting fake operator/business details;
- guaranteeing compliance for every jurisdiction worldwide;
- weakening current motion-analysis privacy/provenance gates to make release work easier.

## Completion criteria

This project is not complete merely because policy files exist. Completion requires:

1. all 20 original audit items exist in the release matrix with evidence-backed state;
2. Korean/Apple release blockers that can be solved in code/docs are implemented and tested;
3. remaining operator/Xcode/manual facts are clearly `BLOCKED` rather than hidden;
4. signup respects the 14+ V1 decision before account creation;
5. full account deletion removes governed cloud account data and Firebase Auth in safe order;
6. actual shipped data flows match the Privacy/SDK ledger and legal copy;
7. legacy production routes/claims cannot bypass the modern product boundary;
8. the final verification commands and manual release checks are recorded with fresh evidence before merge/release.
