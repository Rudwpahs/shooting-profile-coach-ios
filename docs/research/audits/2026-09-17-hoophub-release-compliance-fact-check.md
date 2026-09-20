# Fact Check — Hoop Hub Release Compliance Research

Verified: 2026-09-17
Source artifact: `docs/research/2026-09-17-hoophub-release-compliance-audit.md`

## Verdict

Overall reliability: **High**
Load-bearing claims externally checked: **8 / 8**

The legal/platform claims below were re-opened against Apple Developer, Firebase, and Korea's National Law Information Center after the research synthesis was drafted. Product-code claims were separately checked against repository source.

## Claim ledger

| ID | Claim | Type | Status | Primary evidence | Independent support | Correction / note |
|---|---|---|---|---|---|---|
| C1 | Apps that support account creation must let users initiate account deletion in-app. | HARD_FACT | CONFIRMED | Apple `Offering account deletion in your app` | App Review Guideline 5.1.1(v) | Entire-account deletion, not deactivation only. Reauthentication is permitted. |
| C2 | All App Store apps need an accessible privacy-policy link in App Store Connect and in-app. | HARD_FACT | CONFIRMED | App Review Guideline 5.1.1(i) | Apple App Review privacy guidance | Policy must cover collection/use, third parties, retention/deletion, consent/deletion. |
| C3 | When consent is required for processing a child under 14 in Korea, legal-representative consent must be obtained and verified. | HARD_FACT | CONFIRMED | PIPA Article 22-2 | National Law Information Center full statute | The V1 14+ boundary is a product decision; the statute itself does not say every service must exclude under-14 users. |
| C4 | PIPA requires minimum necessary collection and places the burden of proving minimum collection on the controller. | HARD_FACT | CONFIRMED | PIPA Article 16 | National Law Information Center full statute | Supports reviewing duplicated Firestore email, but does not by itself prove that duplicate storage is always unlawful. |
| C5 | PIPA Article 28-8 provides specific legal bases for overseas transfer and includes a contract-performance outsourcing/storage route tied to disclosure/notice. | HARD_FACT | CONFIRMED | PIPA Article 28-8(1)(3) | Article 28-8 paragraph 2 disclosure fields | Exact legal basis for production should be chosen with final operator/privacy counsel; engineering must expose truthful facts. |
| C6 | Firebase Authentication processes data exclusively in the United States. | HARD_FACT | CONFIRMED | Firebase `Privacy and Security in Firebase`, US-only services | Google/Firebase service documentation | Source states Authentication is run only from US data centers. |
| C7 | Cloud Firestore location is configurable, so the production region cannot be inferred solely from this repository. | SOFT_FACT | CONFIRMED | Firebase Cloud Firestore locations | Firebase privacy page lists Firestore among services with selectable/global infrastructure | Production console/config evidence is still required. |
| C8 | Required-reason API use without an approved reason in the appropriate privacy manifest can block App Store Connect submission; final Xcode report is needed to aggregate SDK manifests. | HARD_FACT | CONFIRMED | Apple Required Reason API documentation | Apple privacy-manifest and third-party SDK requirement pages | Source repository inspection cannot replace archive inspection. |

## Repository claim audit

- `lib/firebase-auth.tsx` calls `createUserWithEmailAndPassword` and exposes no `deleteUser` path: **CONFIRMED**.
- `lib/firebase-private-data.ts` writes `user.email` to `/users/{uid}`: **CONFIRMED**.
- `firestore.rules` requires `request.resource.data.email is string` for `/users/{userId}` create/update: **CONFIRMED**.
- `components/profile/account-panel.tsx` currently exposes sign-in/sign-up/logout but not age/legal acceptance/account deletion: **CONFIRMED**.
- `.github/workflows/representative-4d-ci.yml` runs typecheck, lint, hermetic unit tests, Firestore emulator tests and Expo web export on pull requests: **CONFIRMED**.

## Contradictions

No load-bearing claim was contradicted.

One important narrowing was retained: Article 16 supports a minimization review of duplicated email storage, but the research must not state that duplicate storage is automatically illegal. The implementation will remove it because the current product has no demonstrated need for the duplicate and removing it produces a smaller data surface.

## Residual uncertainty

The following remain intentionally unverified until production/release evidence exists:

- real operator/company/contact facts;
- production Firestore region;
- final Xcode privacy report and linked SDK manifests/signatures;
- App Store Connect privacy labels and metadata;
- actual-device accessibility behavior.
