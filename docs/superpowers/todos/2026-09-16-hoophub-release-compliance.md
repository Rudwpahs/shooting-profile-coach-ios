# Hoop Hub Release Compliance TODO

Design: `docs/superpowers/specs/2026-09-16-hoophub-release-compliance-design.md`
Branch: `work/hoophub-release-compliance-v1`
Target: Korea-first App Store release

Status legend:
- `[ ]` not yet complete
- `[x]` verified complete
- Release matrix later uses `PASS`, `BLOCKED`, or `N/A`; a checkbox is not sufficient evidence by itself.

## Phase 0 — Evidence and release matrix

- [ ] Create `docs/research/2026-09-16-hoophub-release-compliance-audit.md` with official-source evidence for Apple, Korean PIPA, child data, cross-border transfer, cookies, marketing email, accessibility, and relevant SDK/licensing requirements.
- [ ] Create one 20-item compliance matrix mapping each original audit item to owner surface, code/doc evidence, automated test, manual release check, and `PASS/BLOCKED/N/A` state.
- [ ] Add a contrarian/failure-mode pass: identify items that appear compliant in source but can still fail in the final IPA, App Store metadata, production Firebase configuration, or operator information.
- [ ] Run independent fact-check on load-bearing legal/platform claims before implementation copy is treated as authoritative.

## Phase 1 — Legal surfaces and signup

Original items: **1, 2, 4, 6, 16**

- [ ] Add structured legal/operator configuration with no invented production values.
- [ ] Add in-app `Legal & Privacy` entry point reachable from supported UI.
- [ ] Add Privacy Policy surface and external/public URL strategy for App Store Connect.
- [ ] Add Terms of Service surface.
- [ ] Add web cookie notice documenting the necessary `app_session_id` authentication cookie.
- [ ] Add support/privacy-contact/business-information section; unknown required operator values keep release readiness blocked.
- [ ] Change signup so legal links/required acknowledgement are presented before Firebase account creation.
- [ ] Keep marketing consent absent until a marketing feature actually exists.
- [ ] Add tests proving signup cannot call `createUserWithEmailAndPassword` before required gates pass.
- [ ] Apply accessibility/focus/contrast/mobile-reflow review to all new legal/signup UI.

## Phase 2 — Age architecture

Original item: **17**

- [ ] Implement Korea V1 product rule: service is 14+.
- [ ] Put the age gate before email/password account creation or cloud profile creation.
- [ ] Ensure under-14 rejection sends no signup credentials to Firebase.
- [ ] Do not persist exact DOB merely for the age gate.
- [ ] Add tests for allowed, blocked, reset, and repeated-attempt states.
- [ ] Document parental-consent support as a separate future project rather than a partial V1 implementation.

## Phase 3 — Data minimization and overseas-transfer ledger

Original items: **7, 8**

- [ ] Trace actual release-runtime data paths rather than package names alone.
- [ ] Document Firebase Authentication data, processor/location, purpose, retention, and deletion path.
- [ ] Document Cloud Firestore production region once verified; keep release state blocked while unknown.
- [ ] Document MediaPipeTasksVision as on-device processing and verify no raw media/network transfer path is introduced by the app.
- [ ] Document Expo Image Picker/camera/photo-library access and local-media handling.
- [ ] Document AsyncStorage/SecureStore/session use where active.
- [ ] Document web `app_session_id` cookie path and lifetime.
- [ ] Audit whether any legacy Manus/server/MySQL path is reachable in the release build; remove or explicitly classify it.
- [ ] Review duplicated Firebase Auth email in Firestore `/users/{uid}`.
- [ ] If email duplication has no release requirement, remove it from Firestore profile writes/contracts/rules/tests.
- [ ] Map each collected/stored field to App Store privacy-label candidate categories.
- [ ] Map each overseas transfer/processing path to Korean disclosure/legal-basis requirements.

## Phase 4 — Full account and data deletion

Original item: **20**

- [ ] Design idempotent owner-bound account deletion orchestration.
- [ ] Delete V2 shooting-profile subordinate evidence/revisions/capture records before profile heads as required by existing rules.
- [ ] Delete governed legacy private-pose records.
- [ ] Delete `/users/{uid}` only after subordinate data is absent.
- [ ] Delete the Firebase Auth principal after cloud data cleanup succeeds.
- [ ] Clear local profile/session/cache state after cloud/Auth deletion reaches terminal success.
- [ ] Handle Firebase recent-login/reauthentication error explicitly.
- [ ] Never show deletion success on partial failure.
- [ ] Add tests proving deletion order and failure semantics.
- [ ] Add Firestore-rules regression tests for any contract/rule change.
- [ ] Add real-device deletion QA to release checklist.

## Phase 5 — Apple privacy manifest / SDK release gate

Original item: **8**

- [ ] Inventory SDKs/frameworks actually shipped in the iOS archive.
- [ ] Determine project-owned `PrivacyInfo.xcprivacy` needs based on actual required-reason API use.
- [ ] Verify dependency-provided privacy manifests rather than assuming package declarations are sufficient.
- [ ] Add repository/CI static checks possible without Xcode.
- [ ] Add macOS/Xcode final archive privacy-report checklist.
- [ ] Keep this item `BLOCKED` until final release IPA/archive evidence exists.

## Phase 6 — Unsupported claims and legacy-route cleanup

Original items: **11, 12**

- [ ] Audit every production-reachable route for named-player and 3D wording.
- [ ] Remove or hard-redirect obsolete `motion`, `assessment`, `library`, and legacy `settings` routes where they conflict with current product architecture.
- [ ] Ensure direct/deep-link navigation cannot bypass route cleanup.
- [ ] Remove production-visible `Stephen Curry / Image 3D`-style legacy wording.
- [ ] Preserve explicit representative-estimate wording: not synchronized capture, not triangulated/metric actual 3D, not proof of named-player match.
- [ ] Add source-level regression tests for prohibited production claims.
- [ ] Confirm fake-review/testimonial UI is absent from the shipping surface.

## Phase 7 — Accessibility release gate

Original items: **13, 14, 15**

- [ ] Preserve current `accessibilityLabel`/role/state coverage on existing screens.
- [ ] Preserve semantic-token contrast tests and no-screen-color-literal gate.
- [ ] Preserve visible focus state for keyboard-accessible controls.
- [ ] Add new legal/signup/deletion UI to accessibility static tests.
- [ ] Verify compact iPhone reflow and text scaling for new screens.
- [ ] Verify reduced-motion behavior where new animation/transition is introduced.
- [ ] Add manual VoiceOver QA.
- [ ] Add Full Keyboard Access / Switch Control QA where applicable.
- [ ] Do not mark accessibility fully `PASS` solely from source/static tests.

## Phase 8 — Licensing and shipping assets

Original item: **19**

- [ ] Create `THIRD_PARTY_NOTICES.md`.
- [ ] Inventory Barlow and Barlow Condensed license/provenance.
- [ ] Inventory Material/community icon packages and notices.
- [ ] Inventory MediaPipeTasksVision and bundled pose model resource license/provenance.
- [ ] Inventory Firebase/Expo notices required for redistribution.
- [ ] Re-verify CMU/reference data license boundary for anything actually shipped.
- [ ] Record app-icon/branding provenance.
- [ ] Remove unused template assets such as React-logo images if they are not referenced by the shipping product.
- [ ] Verify named-player/source-media research artifacts are not accidentally packaged as app assets.

## Phase 9 — Conditional future-feature gates

Original items: **3, 5, 9, 10, 18**

- [ ] Record `Refund policy` as `N/A` only while no IAP/subscription/paid digital feature exists; adding one reopens refund/cancellation/Korean e-commerce review.
- [ ] Record cookie-consent banner as `N/A` only while the web build uses no non-essential analytics/advertising cookies.
- [ ] Keep a dark-pattern review in the release checklist for subscription, consent, deletion, and pricing flows.
- [ ] Record hidden-fee review as `N/A` only while no paid feature exists; pricing work reopens it.
- [ ] Record marketing-email unsubscribe implementation as `N/A` only while no marketing-email system exists; introducing one reopens separate consent/withdrawal/unsubscribe work.

## Phase 10 — Business/App Store operator data

Original item: **16**

- [ ] Verify actual service/operator legal identity.
- [ ] Verify support email/contact.
- [ ] Verify privacy contact/officer information required for Korean privacy notice.
- [ ] Verify Korean App Store compliance information applicable to the account type.
- [ ] Verify business/representative/address/registration details if the launch model triggers Korean e-commerce seller disclosure.
- [ ] Do not replace unknown values with plausible-looking sample data.

## Phase 11 — Final verification

- [ ] Run targeted red→green tests per implementation task.
- [ ] Run `pnpm test:unit` with fresh output.
- [ ] Run `pnpm check` with fresh output.
- [ ] Run `pnpm lint` with fresh output.
- [ ] Run `pnpm test:rules` if Firebase schema/rules change.
- [ ] Run affected web export/route audit.
- [ ] Inspect supported mobile widths and destructive/error/loading states.
- [ ] Re-read all 20 original audit items line-by-line and assign evidence-backed `PASS/BLOCKED/N/A`.
- [ ] Verify unresolved operator facts, production Firebase region, physical-device QA, and Xcode archive/privacy report remain visibly `BLOCKED` until supplied/run.
- [ ] Run Superpowers `verification-before-completion` before any completion claim.
- [ ] Do not merge to `main` without separate user approval.

## Original 20-item coverage index

- [ ] 1. Privacy policy → Phase 1
- [ ] 2. Terms of service → Phase 1
- [ ] 3. Refund policy → Phase 9
- [ ] 4. Cookie policy → Phase 1 / Phase 3
- [ ] 5. Cookie consent banner → Phase 9
- [ ] 6. Check form consents → Phase 1
- [ ] 7. No unnecessary data → Phase 3
- [ ] 8. Audit third-party SDKs → Phase 3 / Phase 5
- [ ] 9. Remove dark patterns → Phase 9
- [ ] 10. Remove hidden fees → Phase 9
- [ ] 11. Remove fake reviews → Phase 6
- [ ] 12. Remove unsupported claims → Phase 6
- [ ] 13. Accessibility alt text/semantics → Phase 7
- [ ] 14. Fix color contrast → Phase 7
- [ ] 15. Keyboard navigation → Phase 7
- [ ] 16. Add business details → Phase 1 / Phase 10
- [ ] 17. Age consent for kids' data → Phase 2
- [ ] 18. Unsubscribe link in emails → Phase 9
- [ ] 19. License fonts/images/assets → Phase 8
- [ ] 20. Data deletion request → Phase 4
