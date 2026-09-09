# Authenticated Coach transport (C2-compatible)

The payload and `RemoteCoachProvider` remain frozen. Inject this new transport
through the existing `transport` option. Its exact endpoint is pinned before
retrieving a token, HTTPS is required, redirects fail, and bearer tokens stay in
HTTP headers. Cancellation covers both pending authentication and the fetch.

```ts
import { RemoteCoachProvider } from "@/lib/coach/remote-provider";
import { createAuthenticatedCoachTransport } from "@/lib/coach/authenticated-transport";

const endpoint = "https://YOUR-DEPLOYED-SERVICE/v1/coach";
const provider = new RemoteCoachProvider({
  url: endpoint,
  timeoutMs: 8000,
  transport: createAuthenticatedCoachTransport({
    endpoint,
    getIdToken: async () => auth.currentUser?.getIdToken() ?? null,
  }),
});
// provider.coach(frozenRequest, { signal }); unchanged C2 interface
```

`auth` is the UI's existing Firebase Auth instance. No service key is bundled in
the application. Server verification uses the same Firebase project, as described
in `coach-service-v1.md`. Firebase's server authentication contract is documented
at https://firebase.google.com/docs/auth/admin/verify-id-tokens .

`allowLoopbackHttp: true` allows only localhost/127.0.0.1/::1 for local tests. It
does not permit LAN HTTP. Production endpoint provisioning, TLS, credentials and
deployment are external configuration; this branch does not invent a deployed
URL. A native device's localhost is the device, not the development PC.

Network/token exceptions are replaced with bounded error codes. No request body,
bearer token or SDK error is logged. Non-200 HTTP statuses retain the existing
provider's retryability mapping. Stale-response arbitration remains in the frozen
provider; this module does not change its semantics.
