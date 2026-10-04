import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type { FilmShotClipInputV1 } from "@/lib/film-space/film-shot-media";
import { createWebFilmCaptureMachine, type WebFilmCapturePorts } from "@/lib/film-space/web-film-capture-machine";
import type { WebLocalVideoSourceV1 } from "@/lib/film-space/web-local-video";
import type { WebLocalVideoPickResult } from "@/lib/film-space/web-local-video-picker";

/**
 * The browser's footage-only capture machine (shared by the preview and by a
 * production web build): picks become film evidence, a save keeps the clips
 * on this device, and only when the owner asked for it and the build offers
 * it are the clips also kept in the cloud. A failed upload never loses the
 * device shot.
 */

function source(tag: string): WebLocalVideoSourceV1 {
  return { uri: `blob:https://example.test/${tag}`, durationMs: 4433, width: 512, height: 910, sizeBytes: 2_824_524, blob: new Blob([tag], { type: "video/mp4" }), revoke: () => undefined };
}

function machine(cloud: "none" | "ok" | "fail") {
  const picks: WebLocalVideoPickResult[] = [{ status: "ready", source: source("front") }, { status: "ready", source: source("side") }];
  const saved: (readonly FilmShotClipInputV1[])[] = [];
  const uploadFilmShot = vi.fn(async (_shotId: string, _clips: readonly FilmShotClipInputV1[]) => {
    if (cloud === "fail") throw new Error("upload failed");
  });
  const ports: WebFilmCapturePorts = {
    pickLocalVideo: async () => picks.shift() ?? { status: "cancelled" },
    saveFilmShot: async (clips) => { saved.push(clips); return `film-shot-${saved.length}`; },
    ...(cloud === "none" ? {} : { uploadFilmShot }),
  };
  return { controller: createWebFilmCaptureMachine(ports), saved, uploadFilmShot };
}

async function fill(controller: ReturnType<typeof createWebFilmCaptureMachine>) {
  controller.selectMode("basic_1_plus_1");
  controller.startCollection();
  for (const slot of controller.state.slots) await controller.acquireSlot(slot.id, "library");
  expect(controller.state.status).toBe("film_review");
}

describe("web film capture machine and cloud keeping", () => {
  it("offers cloud keeping only when the build supplies an upload port", () => {
    expect(machine("none").controller.cloudKeepAvailable).toBe(false);
    expect(machine("ok").controller.cloudKeepAvailable).toBe(true);
    expect(machine("ok").controller.cloudKeepResult).toBe("none");
  });

  it("keeps the shot on this device only unless the owner asked for the cloud", async () => {
    const { controller, saved, uploadFilmShot } = machine("ok");
    await fill(controller);
    await controller.save();
    expect(controller.state).toMatchObject({ status: "complete", savedProfileId: "film-shot-1" });
    expect(saved).toHaveLength(1);
    expect(uploadFilmShot).not.toHaveBeenCalled();
    expect(controller.cloudKeepResult).toBe("none");
  });

  it("saves on the device first, then uploads the same clips with their files when the owner turned it on", async () => {
    const { controller, saved, uploadFilmShot } = machine("ok");
    await fill(controller);
    await controller.save({ cloud: true });
    expect(controller.state).toMatchObject({ status: "complete", savedProfileId: "film-shot-1" });
    expect(saved).toHaveLength(1);
    expect(uploadFilmShot).toHaveBeenCalledTimes(1);
    const [shotId, clips] = uploadFilmShot.mock.calls[0];
    expect(shotId).toBe("film-shot-1");
    expect(clips.map((clip) => clip.slotId).sort()).toEqual(["front-0", "shooting_side-0"]);
    expect(clips.every((clip) => clip.blob instanceof Blob)).toBe(true);
    expect(controller.cloudKeepResult).toBe("uploaded");
  });

  it("never loses the device shot when the upload fails: the session still completes and says the upload failed", async () => {
    const { controller, saved } = machine("fail");
    await fill(controller);
    await controller.save({ cloud: true });
    expect(controller.state).toMatchObject({ status: "complete", savedProfileId: "film-shot-1" });
    expect(saved).toHaveLength(1);
    expect(controller.cloudKeepResult).toBe("failed");
  });

  it("ignores a cloud request when the build has no upload port, and resets the result for a new session", async () => {
    const none = machine("none");
    await fill(none.controller);
    await none.controller.save({ cloud: true });
    expect(none.controller.state.status).toBe("complete");
    expect(none.controller.cloudKeepResult).toBe("none");

    const ok = machine("ok");
    await fill(ok.controller);
    await ok.controller.save({ cloud: true });
    expect(ok.controller.cloudKeepResult).toBe("uploaded");
    ok.controller.selectMode("basic_1_plus_1");
    expect(ok.controller.cloudKeepResult).toBe("none");
  });

  it("lives in production code so a web build can keep footage, and the preview re-uses it unchanged", () => {
    const machineSource = readFileSync("lib/film-space/web-film-capture-machine.ts", "utf8");
    expect(machineSource).toContain('type: "SLOT_FILM_ACCEPTED"');
    expect(machineSource).not.toMatch(/@\/lib\/preview\/|sequenceFor|AGGREGATE_|firebase|fetch\(/);
    const preview = readFileSync("lib/preview/preview-capture-machine.ts", "utf8");
    expect(preview).toContain('from "@/lib/film-space/web-film-capture-machine"');
  });
});
