# Authenticated Coach V1 service

`formpath_coach.service_v1.create_app` is the backend boundary that consumes the
frozen `CoachRequestV1` and emits only a revalidated `CoachResponseV1`.

## Endpoint

`POST /v1/coach`

- `Authorization: Bearer <Firebase ID token>` is required exactly once.
- Request bytes are capped at 64 KiB before authentication, including chunked
  bodies. JSON is strict and unknown fields are rejected without echoing input.
- Firebase Admin verification is pinned to
  `FORMPATH_COACH_FIREBASE_PROJECT_ID`, checks revoked tokens with zero clock
  skew, and rejects the Auth emulator in production.
- Quotas are 10 requests per 60 seconds per verified UID, at most 10,000 UID
  buckets, and 32 in-flight requests. Retryable errors expose only stable error
  codes (`401`, `413`, `422`, `429`, `503`, `504`) and no token, UID, prompt, or
  provider exception.
- Provider execution is cancelled at the configured timeout (6 seconds by
  default). Output is parsed and passed through frozen grounding checks before
  returning `200` with `Cache-Control: no-store`.

## Configuration

Set `FORMPATH_COACH_FIREBASE_PROJECT_ID` and either
`GOOGLE_APPLICATION_CREDENTIALS` (service-account file) or
`FORMPATH_COACH_USE_ADC=1` for Application Default Credentials. The iOS/Expo app
uses its existing Firebase Auth instance and sends the ID token through
`createAuthenticatedCoachTransport`; no service key is bundled in the app.

The default provider is `deterministic_v1` and is a safe wiring baseline, not a
trained model. Replace it only with a provider that preserves frozen schema,
grounding, and evidence-aware guardrails.
