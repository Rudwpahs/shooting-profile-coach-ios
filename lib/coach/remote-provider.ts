import { parseCoachResponseForRequest, type CoachRequestV1 } from "@/lib/coach/contract";
import { serializeCoachRequest } from "@/lib/coach/privacy";
import { CANCELLED, unavailable, type CoachProvider, type CoachProviderOptions, type CoachProviderResult } from "@/lib/coach/provider";

/**
 * The remote FormPath Coach behind the same boundary as the deterministic
 * provider. It sends exactly one thing, the serialized (schema-checked,
 * privacy-audited) request, and accepts exactly one thing, a schema-valid
 * reply grounded in that request. Everything else is a typed outcome:
 * not configured, offline, timed out, an HTTP status, an invalid or
 * ungrounded reply, a cancelled call, or a stale answer to a request that
 * a newer one has since replaced.
 */
export type RemoteCoachTransport = (input: { url: string; body: string; signal: AbortSignal }) => Promise<{ status: number; text: string }>;

export type RemoteCoachProviderConfig = {
  /** The Coach endpoint; `null` means the service is not configured and nothing is sent. */
  url: string | null;
  timeoutMs?: number;
  transport?: RemoteCoachTransport;
};

export const DEFAULT_COACH_TIMEOUT_MS = 8000;

export const fetchCoachTransport: RemoteCoachTransport = async ({ url, body, signal }) => {
  const reply = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body,
    signal,
  });
  return { status: reply.status, text: await reply.text() };
};

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class RemoteCoachProvider implements CoachProvider {
  readonly id = "remote_formpath_coach_v1" as const;
  private latestRequestId: string | null = null;

  constructor(private readonly config: RemoteCoachProviderConfig) {}

  async coach(request: CoachRequestV1, options: CoachProviderOptions = {}): Promise<CoachProviderResult> {
    if (options.signal?.aborted) return CANCELLED;
    const url = this.config.url;
    if (!url) return unavailable("not_configured", false);

    let body: string;
    try {
      body = serializeCoachRequest(request);
    } catch (error) {
      return unavailable("provider_error", false, message(error));
    }

    this.latestRequestId = request.request_id;
    const timeoutMs = this.config.timeoutMs ?? DEFAULT_COACH_TIMEOUT_MS;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const reply = await (this.config.transport ?? fetchCoachTransport)({ url, body, signal: controller.signal });
      if (options.signal?.aborted) return CANCELLED;
      const stale = this.staleFor(request);
      if (stale) return stale;
      if (reply.status !== 200) return unavailable("http_error", reply.status === 429 || reply.status >= 500, String(reply.status));
      let json: unknown;
      try {
        json = JSON.parse(reply.text);
      } catch {
        return unavailable("schema_invalid", false, "reply is not JSON");
      }
      const parsed = parseCoachResponseForRequest(request, json);
      if (parsed.status === "schema_invalid") return unavailable("schema_invalid", false, parsed.issues.slice(0, 3).join("; "));
      if (parsed.status === "grounding_invalid") return unavailable("grounding_invalid", false, parsed.reasons.map((reason) => reason.code).join("; "));
      return { status: "ok", response: parsed.response };
    } catch (error) {
      if (options.signal?.aborted) return CANCELLED;
      if (timedOut) return unavailable("timeout", true, `${timeoutMs}ms`);
      return unavailable("offline", true, message(error));
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }
  }

  private staleFor(request: CoachRequestV1): CoachProviderResult | null {
    if (this.latestRequestId !== null && this.latestRequestId !== request.request_id) {
      return { status: "stale", superseded_by: this.latestRequestId };
    }
    return null;
  }
}
