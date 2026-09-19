# Hoop Hub Release Compliance Research

Verified: 2026-09-17 (Asia/Seoul)
Scope: Korea-first iOS release, Apple App Store review, Firebase account/data lifecycle, web authentication cookie, child-data boundary, SDK/privacy-manifest release gate.

## Research contract

This record answers the load-bearing questions needed before implementing the release-compliance spec:

1. What Apple review requirements are hard release gates for Hoop Hub?
2. What Korean privacy rules materially change signup, child-data, minimization, and Firebase overseas processing?
3. What does Firebase itself state about processing locations?
4. Which findings are enforceable in source code, and which remain final-build/App Store/operator-information checks?

Primary/official sources are preferred. Product code is treated as project evidence rather than external legal evidence. This document records engineering requirements, not legal advice.

## Primary sources

- Apple App Review Guidelines, privacy/account sign-in: https://developer.apple.com/kr/app-store/review/guidelines/
- Apple account-deletion guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Apple required-reason APIs: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api
- Apple third-party SDK requirements: https://developer.apple.com/support/third-party-SDK-requirements/
- Korea Personal Information Protection Act, effective 2026-09-11, Article 22-2: https://www.law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029334761
- Korea PIPA Article 16: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1020399353
- Korea PIPA Article 28-8: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029331979
- Firebase privacy/security and processing locations: https://firebase.google.com/support/privacy
- Cloud Firestore locations: https://firebase.google.com/docs/firestore/locations

## Findings

### Apple privacy policy and account deletion are release gates

Apple states that every app must link to its privacy policy in App Store Connect and within the app in an easily accessible place. The policy must describe collection/use, third-party sharing protections, retention/deletion, and consent/deletion mechanisms.

Apple also states that an app supporting account creation must offer account deletion within the app. Deactivation alone is insufficient. Reauthentication/confirmation is allowed when it protects against accidental or unauthorized deletion, but unnecessary friction is not.

**Engineering consequence:** Hoop Hub needs an in-app Legal & Privacy entry point and a complete account-deletion initiation flow before App Store submission.

### Korea V1 child-data boundary

PIPA Article 22-2 states that when consent is required to process personal information of a child under 14, the legal representative's consent must be obtained and verified. Child notices must use an easily understood form and clear language.

**Product decision:** V1 is 14+. The age gate must occur before Firebase email/password account creation or cloud profile creation. The app should not store an exact date of birth merely to enforce this rule. Under-14 parental-consent support is a separate future project rather than a partial V1 feature.

This 14+ rule is a product-scope choice that avoids implementing an incomplete guardian-consent system; it is not a claim that all users aged 14+ are free from every other applicable legal requirement.

### Data minimization

PIPA Article 16 requires collection of the minimum personal information necessary for the stated purpose and places the burden of proving necessity on the controller.

Current code evidence shows `Firebase Authentication` already owns the account email, while `ensureFirebaseProfile` writes the same email again to `/users/{uid}` and the Firestore rule requires an email string for the owner document.

**Engineering consequence:** remove the duplicate Firestore email unless a concrete product requirement proves it necessary. The owner document can be reduced to non-email metadata required by the product. Security rules and tests must change together.

### Firebase is an overseas-processing concern for a Korean release

Firebase states that Firebase Authentication is run only from US data centers and therefore processes Authentication data exclusively in the United States. Firebase describes Cloud Firestore as a service for which a data location can be selected; the actual production database location must therefore be verified from the production project rather than inferred from source code.

PIPA Article 28-8 permits overseas transfer only under specified bases. For the contract-performance outsourcing/storage route in Article 28-8(1)(3), the information listed in paragraph 2 must be disclosed through the privacy policy or prescribed notice. If separate overseas-transfer consent is used, paragraph 2 requires advance notice of transferred fields, country/timing/method, recipient/contact, purpose/retention, and refusal method/effect.

**Engineering consequence:** create a data/processor ledger. Firebase Authentication must be recorded as US processing. Firestore country/region remains a release blocker until the production database region is verified.

### Privacy manifests and required-reason APIs require final-build evidence

Apple states that Xcode combines privacy manifests from linked SDKs into a privacy report. Apple also rejects submissions that use a required-reason API without an approved reason in the appropriate privacy manifest. Apple maintains a list of SDKs that require manifests/signatures.

**Engineering consequence:** source-level SDK inventory and manifest checks are necessary but not sufficient. The final Xcode archive/privacy report is a manual release gate. Do not mark SDK/privacy-manifest compliance complete solely because a repository file exists.

### Web authentication cookie is real, but a tracking banner is not justified by current evidence

The repository contains `app_session_id` cookie-based web authentication. The cookie path is `/`, it is HttpOnly, and current server code uses `SameSite=None` with secure behavior determined by HTTPS. There is no current evidence of an advertising/analytics-cookie stack.

**Engineering consequence:** add a web cookie notice for necessary authentication/session behavior. Do not add a marketing-style cookie consent banner unless non-essential cookies or tracking are introduced.

### Unsupported-claim cleanup remains necessary

Current product policy correctly labels representative multi-view output as an estimate rather than synchronized measured 3D. However legacy routes/assets still contain named-player and `Image 3D` terminology. Hidden navigation (`href: null`) is not a sufficient production boundary if a route can still be reached directly.

**Engineering consequence:** production-route tests must prove legacy named-player/3D analysis routes are removed, redirected, or gated out of ordinary production exports.

## Code evidence checked

- `lib/firebase-auth.tsx`: email/password signup directly calls `createUserWithEmailAndPassword`; no account deletion method exists.
- `lib/firebase-private-data.ts`: owner profile duplicates `user.email` into Firestore and currently refuses users without email.
- `firestore.rules`: `/users/{userId}` create/update currently requires `request.resource.data.email`.
- `lib/firebase-shooting-profiles.ts`: owner-bound per-profile deletion already has a staged/subordinate deletion mechanism that can be reused for whole-account cleanup.
- `components/profile/account-panel.tsx`: no age/legal gate and no account-delete UI.
- `.github/workflows/representative-4d-ci.yml`: pull requests run typecheck, lint, hermetic unit tests, Firestore emulator rule tests, and Expo web export.

## Contrarian / failure-mode pass

1. A source-level `PrivacyInfo.xcprivacy` can exist while the final IPA still contains a dependency with undeclared required-reason API usage. Final archive report remains mandatory.
2. A 14+ checkbox placed after email entry would still allow the app to collect data before the gate. The gate must precede the Firebase account/network action.
3. Deleting Firebase Auth before Firestore owner data can strand owner-only data because Firestore rules require the authenticated UID. Reauthenticate first, delete owner data while credentials still exist, then delete Auth.
4. Deleting only visible V2 profiles is insufficient if legacy `/poses` or the root `/users/{uid}` document survives.
5. Removing the email field from application code without changing Firestore rules would break profile sync. Rules/tests and write code must be one change set.
6. A cookie policy cannot truthfully claim only one cookie if future web dependencies add analytics or storage. Re-audit the production web build before launch.
7. Legal screens with fabricated company/contact details create a worse compliance state than explicit release blockers. Unknown operator facts remain configuration blockers.

## Confidence and unresolved items

Confidence: **High** for Apple account-deletion/privacy-policy requirements, Korea under-14/minimization/overseas-transfer statutory text, and Firebase Authentication US-only processing because each is supported by current primary sources.

Still unresolved and must stay `BLOCKED` until verified:

- production Firestore database region;
- real operator/company/representative/support/privacy-contact details;
- public production privacy-policy URL;
- final Xcode privacy report and SDK signatures/manifests;
- final App Store Connect privacy labels/metadata;
- real-device VoiceOver/keyboard/accessibility QA.
