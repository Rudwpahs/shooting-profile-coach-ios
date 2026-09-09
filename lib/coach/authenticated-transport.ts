import type { RemoteCoachTransport } from "@/lib/coach/remote-provider";

export type AuthenticatedCoachTransportConfig = {
  endpoint: string;
  /** Obtain the current Firebase user's ID token; never persist it in Coach data. */
  getIdToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
  allowLoopbackHttp?: boolean;
};

function abortError(): Error {
  const error = new Error("coach_request_cancelled");
  error.name = "AbortError";
  return error;
}

/** Add HTTP authentication without changing any frozen Coach payload/provider. */
export function createAuthenticatedCoachTransport(config: AuthenticatedCoachTransportConfig): RemoteCoachTransport {
  let endpoint: URL;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error("coach_endpoint_invalid");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if ((endpoint.protocol !== "https:" && !(config.allowLoopbackHttp && loopback && endpoint.protocol === "http:"))
    || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("coach_endpoint_invalid");
  }
  const fetcher = config.fetcher ?? fetch;
  return async ({ url, body, signal }) => {
    if (url !== config.endpoint) throw new Error("coach_endpoint_mismatch");
    if (signal.aborted) throw abortError();
    let onAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const token = await Promise.race([
        Promise.resolve().then(config.getIdToken).catch(() => { throw new Error("coach_auth_unavailable"); }),
        cancelled,
      ]);
      if (signal.aborted) throw abortError();
      if (!token || token.length > 8192 || !/^[A-Za-z0-9._-]+$/.test(token)) throw new Error("coach_auth_unavailable");
      const reply = await Promise.race([
        fetcher(url, {
          method: "POST", body, signal, redirect: "error", credentials: "omit",
          headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${token}` },
        }),
        cancelled,
      ]);
      const text = await Promise.race([reply.text(), cancelled]);
      return { status: reply.status, text };
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (error instanceof Error && error.message === "coach_auth_unavailable") throw error;
      throw new Error("coach_transport_unavailable");
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };
}
