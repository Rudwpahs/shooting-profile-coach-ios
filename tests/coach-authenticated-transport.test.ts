import { describe, expect, it, vi } from "vitest";
import { createAuthenticatedCoachTransport } from "@/lib/coach/authenticated-transport";
import { RemoteCoachProvider } from "@/lib/coach/remote-provider";
import { request, response } from "@/tests/fixtures/coach-contract-fixtures";

const url = "https://coach.example.test/v1/coach";

describe("authenticated Coach transport", () => {
  it("uses a fresh token per call and preserves the frozen provider contract", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(response()), { status: 200 }));
    const getIdToken = vi.fn().mockResolvedValue("firebase-id-token");
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken, fetcher });
    const provider = new RemoteCoachProvider({ url, transport });
    expect((await provider.coach(request())).status).toBe("ok");
    expect((await provider.coach(request())).status).toBe("ok");
    expect(getIdToken).toHaveBeenCalledTimes(2);
    const init = fetcher.mock.calls[0][1];
    expect(init.headers.authorization).toBe("Bearer firebase-id-token");
    expect(init.redirect).toBe("error");
    expect(init.credentials).toBe("omit");
    expect(JSON.parse(init.body)).toEqual(request());
  });

  it("refuses a different destination before retrieving a token", async () => {
    const getIdToken = vi.fn();
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken });
    await expect(transport({ url: "https://attacker.test", body: "{}", signal: new AbortController().signal })).rejects.toThrow("coach_endpoint_mismatch");
    expect(getIdToken).not.toHaveBeenCalled();
  });

  it.each(["http://coach.example.test/v1/coach", "https://user:password@coach.example.test/v1/coach", `${url}?token=secret`, `${url}#secret`])("refuses unsafe endpoint %s", (endpoint) => {
    expect(() => createAuthenticatedCoachTransport({ endpoint, getIdToken: async () => null })).toThrow("coach_endpoint_invalid");
  });

  it("allows HTTP only for explicitly opted-in loopback development", () => {
    expect(() => createAuthenticatedCoachTransport({ endpoint: "http://127.0.0.1:8000/v1/coach", allowLoopbackHttp: true, getIdToken: async () => null })).not.toThrow();
    expect(() => createAuthenticatedCoachTransport({ endpoint: "http://192.168.0.2:8000/v1/coach", allowLoopbackHttp: true, getIdToken: async () => null })).toThrow();
  });

  it.each([null, "", "bad\r\ntoken", " ", "x".repeat(8193)])("fails closed without a usable token", async (token) => {
    const fetcher = vi.fn();
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken: async () => token, fetcher });
    await expect(transport({ url, body: "{}", signal: new AbortController().signal })).rejects.toThrow("coach_auth_unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("redacts token-provider exceptions", async () => {
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken: async () => { throw new Error("secret-token"); } });
    await expect(transport({ url, body: "{}", signal: new AbortController().signal })).rejects.toThrow(/^coach_auth_unavailable$/);
  });

  it("cancels while the token promise is pending", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn();
    const transport = createAuthenticatedCoachTransport({ endpoint: url, getIdToken: () => new Promise(() => {}), fetcher });
    const pending = transport({ url, body: "{}", signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
