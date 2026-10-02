import { describe, expect, it, vi } from "vitest";

import {
  MAX_WEB_LOCAL_VIDEO_BYTES,
  createWebLocalVideoSource,
  rejectWebLocalVideoCandidate,
  type WebLocalVideoPorts,
} from "@/lib/film-space/web-local-video";

type Candidate = { name: string; type: string; size: number };

function fakePorts(probe: WebLocalVideoPorts["probe"]) {
  const revoked: string[] = [];
  let counter = 0;
  const ports: WebLocalVideoPorts = {
    createObjectURL: () => `blob:https://rudwpahs.github.io/${(counter += 1).toString(16).padStart(8, "0")}`,
    revokeObjectURL: (uri) => { revoked.push(uri); },
    probe,
  };
  return { ports, revoked };
}

const okProbe: WebLocalVideoPorts["probe"] = async () => ({ durationMs: 4433, width: 512, height: 910 });
const mp4: Candidate = { name: "IMG_0001.MP4", type: "video/mp4", size: 2_824_524 };

describe("web local video source", () => {
  it("accepts MP4 and QuickTime files by type or extension and rejects everything else before any object URL exists", () => {
    expect(rejectWebLocalVideoCandidate(mp4)).toBeNull();
    expect(rejectWebLocalVideoCandidate({ name: "clip.mov", type: "video/quicktime", size: 10 })).toBeNull();
    expect(rejectWebLocalVideoCandidate({ name: "clip.MOV", type: "", size: 10 })).toBeNull();
    expect(rejectWebLocalVideoCandidate({ name: "clip.webm", type: "video/webm", size: 10 })).toBeNull();
    expect(rejectWebLocalVideoCandidate({ name: "photo.jpg", type: "image/jpeg", size: 10 })).toBe("unsupported_type");
    expect(rejectWebLocalVideoCandidate({ name: "notes.txt", type: "text/plain", size: 10 })).toBe("unsupported_type");
    expect(rejectWebLocalVideoCandidate({ name: "clip.mp4", type: "video/mp4", size: 0 })).toBe("empty");
    expect(rejectWebLocalVideoCandidate({ name: "clip.mp4", type: "video/mp4", size: MAX_WEB_LOCAL_VIDEO_BYTES + 1 })).toBe("too_large");
  });

  it("creates a blob object URL, probes duration and dimensions, and reports them without exposing the file name", async () => {
    const { ports } = fakePorts(okProbe);
    const result = await createWebLocalVideoSource(mp4, ports);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.source.uri).toMatch(/^blob:/);
    expect(result.source).toMatchObject({ durationMs: 4433, width: 512, height: 910, sizeBytes: mp4.size });
    expect(JSON.stringify(result.source)).not.toContain("IMG_0001");
  });

  it("revokes the object URL when metadata cannot be read or probing times out", async () => {
    const failing = fakePorts(async () => { throw new Error("decode error"); });
    expect(await createWebLocalVideoSource(mp4, failing.ports)).toEqual({ status: "rejected", reason: "metadata_unavailable" });
    expect(failing.revoked).toHaveLength(1);

    const hanging = fakePorts(() => new Promise(() => undefined));
    expect(await createWebLocalVideoSource(mp4, hanging.ports, { probeTimeoutMs: 15 })).toEqual({ status: "rejected", reason: "metadata_unavailable" });
    expect(hanging.revoked).toHaveLength(1);
  });

  it("rejects clips whose probed metadata is not usable for deterministic sampling", async () => {
    const zero = fakePorts(async () => ({ durationMs: 0, width: 512, height: 910 }));
    expect(await createWebLocalVideoSource(mp4, zero.ports)).toEqual({ status: "rejected", reason: "metadata_unavailable" });
    const nan = fakePorts(async () => ({ durationMs: Number.NaN, width: 512, height: 910 }));
    expect(await createWebLocalVideoSource(mp4, nan.ports)).toEqual({ status: "rejected", reason: "metadata_unavailable" });
    const flat = fakePorts(async () => ({ durationMs: 3000, width: 0, height: 910 }));
    expect(await createWebLocalVideoSource(mp4, flat.ports)).toEqual({ status: "rejected", reason: "metadata_unavailable" });
    expect(zero.revoked.concat(nan.revoked, flat.revoked)).toHaveLength(3);
  });

  it("revokes the object URL exactly once no matter how many times the source is released", async () => {
    const { ports, revoked } = fakePorts(okProbe);
    const result = await createWebLocalVideoSource(mp4, ports);
    if (result.status !== "ready") throw new Error("expected ready");
    result.source.revoke();
    result.source.revoke();
    expect(revoked).toEqual([result.source.uri]);
  });

  it("does not open a decoder for a rejected candidate", async () => {
    const probe = vi.fn(okProbe);
    const { ports, revoked } = fakePorts(probe);
    expect(await createWebLocalVideoSource({ name: "a.jpg", type: "image/jpeg", size: 10 }, ports))
      .toEqual({ status: "rejected", reason: "unsupported_type" });
    expect(probe).not.toHaveBeenCalled();
    expect(revoked).toEqual([]);
  });
});
