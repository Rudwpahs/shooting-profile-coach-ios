# Hoop Hub release compliance matrix

This matrix maps the original 20 checks. `PASS` means repository/code evidence is complete for that item; `BLOCKED` requires external/manual release evidence; `N/A` applies only while the corresponding feature remains absent.

| # | Item | Status | Evidence / release condition |
| ---: | --- | --- | --- |
| 1 | Privacy policy | BLOCKED | In-app privacy route exists, but a live public Privacy Policy URL and verified operator facts are still required for store submission. |
| 2 | Terms of service | BLOCKED | In-app Terms route + signup acknowledgement exist; final operator/contact facts must be approved. |
| 3 | Refund policy | N/A | No StoreKit/IAP/subscription/payment product is present. Re-open if monetization is added. |
| 4 | Cookie policy | N/A | Native app has no audited non-essential marketing/analytics cookie surface. Re-open for a tracking web surface. |
| 5 | Cookie consent banner | N/A | Same scope as item 4; do not add a meaningless native banner. |
| 6 | Form consents | PASS | Signup separately gates 14+, Terms and privacy acknowledgement; capture/cloud-save disclosure remains separate. |
| 7 | No unnecessary data | PASS | Duplicate Firestore root email/display-name sync removed; raw video/filename/EXIF/nonallowlisted landmarks are forbidden cloud writes. |
| 8 | Audit third-party SDKs | BLOCKED | `docs/compliance/third-party-sdk-inventory.md` and transfer ledger exist; final Xcode SDK manifests/signatures and Firestore region remain blocked. |
| 9 | Remove dark patterns | PASS | Reviewed signup/save/logout/delete flows use explicit choices; account deletion is one open action + password + one final confirmation. |
| 10 | Remove hidden fees | N/A | No billing/paid product path exists. |
| 11 | Remove fake reviews | PASS | No review/testimonial system found; demo fixtures are production-export gated. |
| 12 | Remove unsupported claims | PASS | Named-player/research analysis removed from production route/bundle; estimate/not-actual-3D boundaries remain in supported analysis flows. |
| 13 | Accessibility labels / alt text | BLOCKED | Broad RN accessibility labels/roles are source-tested; physical VoiceOver QA is still required. |
| 14 | Fix color contrast | PASS | Token contrast tests enforce text/UI/focus thresholds; real-overlay contrast is also rechecked in device QA. |
| 15 | Keyboard navigation | BLOCKED | Focusable/focus-ring source implementation exists; external keyboard/Full Keyboard Access QA is not yet recorded. |
| 16 | Add business details | BLOCKED | Do not invent legal operator name, support contact or business disclosure. Verified operator facts are required. |
| 17 | Age consent for kids' data | PASS | V1 signup is explicitly 14+; under-14 account creation is not supported by this release path. |
| 18 | Unsubscribe link in emails | N/A | No marketing-email system exists; Firebase transactional auth emails are not a marketing list. Re-open if marketing email is added. |
| 19 | License fonts/images | BLOCKED | Font/icon/library/CMU evidence is inventoried, but bundled pose model and app-branding asset provenance remain BLOCKED. |
| 20 | Data deletion request | PASS | In-app deletion reauthenticates first, deletes V2 + legacy owner data, deletes Firebase Auth last, then clears local profile only after remote success. |

## Current manual blocker codes

`operator_facts`, `privacy_policy_url`, `voiceover_qa`, `keyboard_qa`, `text_scaling_qa`, `ios_privacy_gate`, `shipping_licenses`.

The iOS gate additionally requires `xcode_privacy_report`, `required_reason_apis`, `third_party_sdk_manifests`, `app_store_privacy_labels`, and `firestore_region` evidence from the exact release build/project.
