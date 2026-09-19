# Hoop Hub Release Compliance TODO

Design: `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`
Branch: `work/hoophub-release-compliance-v1`
Target: Korea-first App Store release

Final implementation checkpoint: branch head before this status commit `2e196964bfff5e79229dd9ccfd1b306c09937a5a`.

Status legend:
- `[x]` implemented and verified in repository/CI
- `[ ] BLOCKED` requires external production/operator/Mac/device evidence and must not be treated as complete
- `N/A` is conditional on the relevant feature remaining absent

## Phase 0 — Evidence and release matrix

- [x] Official-source release-compliance audit: `docs/research/2026-09-17-hoophub-release-compliance-audit.md`.
- [x] Independent fact-check: `docs/research/audits/2026-09-17-hoophub-release-compliance-fact-check.md`.
- [x] 20-item final matrix: `docs/release/hoophub-compliance-matrix.md`.
- [x] Failure-mode/manual-blocker model recorded instead of upgrading unknown final-build facts to PASS.

## Phase 1 — Legal surfaces and signup

Original items: **1, 2, 4, 6, 16**

- [x] Structured legal/operator configuration added without invented production values.
- [x] In-app `Legal & Privacy`, Privacy Policy, Terms and cookie notice routes added.
- [x] Signup presents 14+, Terms and privacy acknowledgement before Firebase account creation.
- [x] Marketing consent remains absent while no marketing feature exists.
- [x] Signup compliance gates and source wiring are covered by tests.
- [ ] BLOCKED — live public Privacy Policy URL is still required for store submission.
- [ ] BLOCKED — final verified operator/support/privacy-contact facts are still required.

## Phase 2 — Age architecture

Original item: **17**

- [x] Korea V1 signup policy is 14+.
- [x] Age acknowledgement is required before account creation.
- [x] Under-14 flow does not proceed to Firebase signup.
- [x] Exact date of birth is not persisted merely for the age gate.
- [x] Gate/reset/repeated-attempt behavior is covered by tests.
- [x] Under-14 parental-consent support remains a separate future project rather than a partial V1 flow.

## Phase 3 — Data minimization and overseas-transfer ledger

Original items: **7, 8**

- [x] Release-runtime data paths inventoried in `docs/compliance/third-party-sdk-inventory.md` and `docs/compliance/data-transfer-ledger.md`.
- [x] Firebase Authentication US processing recorded from vendor evidence.
- [x] MediaPipeTasksVision, Expo media access and local/private media boundary documented.
- [x] Duplicate Firebase Auth email/display-name root Firestore sync removed.
- [x] New `/users/{uid}` root profile create/update writes are denied; legacy owner cleanup remains possible.
- [x] Raw video, filename, EXIF and nonallowlisted landmark cloud-write boundaries remain enforced.
- [ ] BLOCKED — production Cloud Firestore region must be verified from the actual Firebase project.
- [ ] BLOCKED — final App Store privacy-label categories must be reconciled against the exact release build.

## Phase 4 — Full account and data deletion

Original item: **20**

- [x] Owner-bound account-deletion orchestration implemented.
- [x] Current password reauthentication happens before destructive cloud operations.
- [x] V2 shooting-profile subordinate data is deleted in dependency-safe order.
- [x] Governed legacy private-pose records and legacy root document are cleaned.
- [x] Firebase Auth principal is deleted only after cloud cleanup succeeds.
- [x] Local profile state is cleared only after remote/Auth deletion succeeds.
- [x] Partial failure cannot report deletion success.
- [x] Ordering/failure semantics, UI contract and Firestore rule regressions are covered by tests.
- [ ] BLOCKED — real-device end-to-end deletion QA must be recorded on the release build.

## Phase 5 — Apple privacy manifest / SDK release gate

Original item: **8**

- [x] Unused `expo-audio`, `expo-notifications`, microphone permission and notification permission removed.
- [x] App-level privacy manifest declares tracking disabled.
- [x] CocoaPods privacy-manifest aggregation enabled.
- [x] SDK/data-transfer ledgers and source-level release gate added.
- [x] iOS manual release runbook added: `docs/release/ios-privacy-release-gate.md`.
- [ ] BLOCKED — Xcode archive privacy report.
- [ ] BLOCKED — Required Reason API review.
- [ ] BLOCKED — third-party SDK privacy manifests/signatures review.
- [ ] BLOCKED — App Store privacy-label reconciliation.
- [ ] BLOCKED — production Firestore region evidence.

## Phase 6 — Unsupported claims and legacy-route cleanup

Original items: **11, 12**

- [x] Product-safe anonymous reference module is separated from named-player research evidence.
- [x] Production `/motion` route now redirects to `/explore` and imports no player research data.
- [x] CI ordinary-production export rejects named-player research tokens and demo fixtures.
- [x] Supported analysis surfaces retain estimate/not-actual-3D boundaries.
- [x] No fake review/testimonial product path was found; demo fixtures are production-export gated.

## Phase 7 — Accessibility release gate

Original items: **13, 14, 15**

- [x] Existing accessibility labels/roles/focus semantics preserved in source.
- [x] New legal/signup/account-deletion controls include accessibility semantics.
- [x] Contrast/token regression tests remain enforced.
- [x] Physical-device QA runbook added: `docs/release/accessibility-device-qa.md`.
- [ ] BLOCKED — VoiceOver QA on a physical supported build.
- [ ] BLOCKED — external keyboard / Full Keyboard Access QA.
- [ ] BLOCKED — Dynamic Type/text-scaling and compact-screen QA.

## Phase 8 — Licensing and shipping assets

Original item: **19**

- [x] `THIRD_PARTY_NOTICES.md` created.
- [x] Shipping asset/license inventory created.
- [x] Barlow / Barlow Condensed, MaterialCommunityIcons/Pictogrammers, MediaPipe code and CMU mocap evidence recorded.
- [x] Unreferenced React template-logo assets removed.
- [x] Named-player research evidence is excluded from ordinary production export by CI.
- [ ] BLOCKED — exact bundled `pose_landmarker_lite.task` model artifact provenance/license must be attached.
- [ ] BLOCKED — app icon/splash/adaptive-icon/FormPath branding asset provenance must be attached.

## Phase 9 — Conditional future-feature gates

Original items: **3, 5, 9, 10, 18**

- [x] Refund policy recorded as `N/A` while no IAP/subscription/payment product exists.
- [x] Non-essential cookie-consent banner recorded as `N/A` while no analytics/advertising cookie surface exists.
- [x] Dark-pattern review recorded and current signup/save/logout/delete flows use explicit choices.
- [x] Hidden-fee review recorded as `N/A` while no paid feature exists.
- [x] Marketing-email unsubscribe recorded as `N/A` while no marketing-email system exists.

## Phase 10 — Business/App Store operator data

Original item: **16**

- [ ] BLOCKED — actual service/operator legal identity.
- [ ] BLOCKED — support email/contact.
- [ ] BLOCKED — Korean privacy contact/officer information.
- [ ] BLOCKED — Korea App Store compliance information for the actual account type.
- [ ] BLOCKED — business/representative/address/registration disclosure if the launch model triggers Korean e-commerce seller obligations.
- [x] No plausible-looking sample operator facts were invented.

## Phase 11 — Final automated verification

Fresh verification on `2e196964bfff5e79229dd9ccfd1b306c09937a5a` / PR #18 merge ref:

- [x] `pnpm install --frozen-lockfile` — success.
- [x] `pnpm check` — success.
- [x] `pnpm lint` — success.
- [x] `pnpm test:unit` — **632 passed, 1 skipped**.
- [x] `pnpm test:rules` — **42 passed** with Firestore emulator.
- [x] Expo ordinary web export — success.
- [x] Production export forbidden-token gate — success; no demo fixture or named-player research token matched.
- [x] Preview-isolation tests — **9 passed**.
- [x] 20 original audit items re-read and assigned evidence-backed `PASS/BLOCKED/N/A` in the release matrix.
- [x] Operator facts, production Firebase region, physical-device QA and Xcode/archive privacy evidence remain visibly `BLOCKED`.
- [x] Superpowers `verification-before-completion` performed before completion claim.
- [x] `main` has not been merged; integration remains a separate user decision.

## Original 20-item final coverage index

- [ ] BLOCKED — 1. Privacy policy: in-app route exists; public URL/operator facts remain.
- [ ] BLOCKED — 2. Terms of service: route/acknowledgement exist; final operator facts remain.
- [x] 3. Refund policy: `N/A` while no paid product exists.
- [x] 4. Cookie policy: native release has no audited non-essential cookie surface; notice exists for web auth cookie context.
- [x] 5. Cookie consent banner: `N/A` while no non-essential tracking cookie exists.
- [x] 6. Check form consents.
- [x] 7. No unnecessary data.
- [ ] BLOCKED — 8. Audit third-party SDKs: source ledger done; final Xcode/archive evidence remains.
- [x] 9. Remove dark patterns.
- [x] 10. Remove hidden fees: `N/A` while no paid product exists.
- [x] 11. Remove fake reviews.
- [x] 12. Remove unsupported claims.
- [ ] BLOCKED — 13. Accessibility labels/semantics: source work done; VoiceOver device QA remains.
- [x] 14. Fix color contrast.
- [ ] BLOCKED — 15. Keyboard navigation: source work done; hardware QA remains.
- [ ] BLOCKED — 16. Add business details.
- [x] 17. Age consent for kids' data: V1 is 14+ and under-14 signup is blocked.
- [x] 18. Unsubscribe link in emails: `N/A` while no marketing-email system exists.
- [ ] BLOCKED — 19. License fonts/images/assets: inventory done; pose-model/branding provenance remains.
- [x] 20. Data deletion request.
