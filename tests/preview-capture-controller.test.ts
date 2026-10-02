import { describe, expect, it, vi } from "vitest";

import type { WebLocalVideoSourceV1 } from "@/lib/film-space/web-local-video";
import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";
import {
  createPreviewCaptureMachine,
  type PreviewCaptureMachinePorts,
  type PreviewLocalVideoPick,
} from "@/lib/preview/preview-capture-machine";
import { PREVIEW_PROFILE_ID, buildPreviewData } from "@/lib/preview/preview-runtime";

const data = buildPreviewData();

function source(tag: string): WebLocalVideoSourceV1 & { revoked: () => number } {
  let revoked = 0;
  return {
    uri: `blob:https://rudwpahs.github.io/${tag}`,
    durationMs: 4433,
    width: 512,
    height: 910,
    sizeBytes: 2_824_524,
    revoke: () => { revoked += 1; },
    revoked: () => revoked,
  };
}

function machine(picks: PreviewLocalVideoPick[] = []) {
  const queue = [...picks];
  const saved: { profileId: string; clips: readonly LocalFilmClipRefV1[] }[] = [];
  const ports: PreviewCaptureMachinePorts = {
    data,
    pickLocalVideo: vi.fn(async () => queue.shift() ?? { status: "cancelled" as const }),
    saveAssociation: vi.fn(async (profileId: string, clips: readonly LocalFilmClipRefV1[]) => { saved.push({ profileId, clips }); }),
  };
  const controller = createPreviewCaptureMachine(ports);
  return { controller, ports, saved };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("preview capture machine", () => {
  it("walks the unchanged capture state machine from mode select to collecting", () => {
    const { controller } = machine();
    expect(controller.state.status).toBe("mode_select");
    controller.selectMode("basic_1_plus_1");
    expect(controller.state.status).toBe("setup");
    controller.setShootingHand("left");
    expect(controller.state.shootingHand).toBe("left");
    controller.startCollection();
    expect(controller.state.status).toBe("collecting");
    expect(controller.state.slots).toHaveLength(2);
    expect(controller.canSave).toBe(false);
  });

  it("accepts a picked local video as the slot's clip, keeps the raw video local, and aggregates to review when every slot is filled", async () => {
    const front = source("front");
    const side = source("side");
    const { controller, saved } = machine([{ status: "ready", source: front }, { status: "ready", source: side }]);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    const [frontSlot, sideSlot] = controller.state.slots;

    await controller.acquireSlot(frontSlot.id, "library");
    expect(controller.state.slots[0].status).toBe("accepted");
    expect(controller.state.slots[1].status).toBe("empty");
    expect(controller.retainedClips().map((clip) => clip.slotId)).toEqual([frontSlot.id]);
    expect(controller.retainedClips()[0]).toMatchObject({ view: "front", takeIndex: 0, uri: front.uri, durationMs: 4433, width: 512, height: 910 });

    await controller.acquireSlot(sideSlot.id, "camera");
    await settle();
    expect(controller.state.status).toBe("result_review");
    expect(controller.state.profile?.quality.passed).toBe(true);
    expect(controller.canSave).toBe(true);
    expect(saved).toEqual([]);
    expect(front.revoked()).toBe(0);
  });

  it("treats a cancelled picker as a cancelled slot and a rejected file as a typed rejection with a user-facing reason", async () => {
    const { controller } = machine([{ status: "cancelled" }, { status: "rejected", reason: "unsupported_type" }]);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    const slotId = controller.state.slots[0].id;
    await controller.acquireSlot(slotId, "library");
    // The unchanged reducer records a dismissed chooser as a cancelled slot the user can retry.
    expect(controller.state.slots[0].status).toBe("cancelled");
    await controller.acquireSlot(slotId, "library");
    expect(controller.state.slots[0].status).toBe("rejected");
    expect(controller.state.slots[0].rejectionReason).toMatch(/영상|MP4|MOV/);
    expect(controller.retainedClips()).toEqual([]);
  });

  it("drops and revokes a clip on retake, and revokes everything on cancel, mode change or dispose", async () => {
    const front = source("front");
    const side = source("side");
    const replacement = source("front-2");
    const { controller } = machine([{ status: "ready", source: front }, { status: "ready", source: side }, { status: "ready", source: replacement }]);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    const [frontSlot, sideSlot] = controller.state.slots;
    await controller.acquireSlot(frontSlot.id, "library");
    await controller.acquireSlot(sideSlot.id, "library");
    await settle();
    expect(controller.state.status).toBe("result_review");

    controller.retakeSlot(frontSlot.id);
    expect(front.revoked()).toBe(1);
    expect(side.revoked()).toBe(0);
    expect(controller.state.status).toBe("collecting");
    await controller.acquireSlot(frontSlot.id, "library");
    await settle();
    expect(controller.retainedClips().map((clip) => clip.uri).sort()).toEqual([replacement.uri, side.uri].sort());

    controller.cancelSession();
    expect(controller.state.status).toBe("cancelled");
    expect(replacement.revoked()).toBe(1);
    expect(side.revoked()).toBe(1);
    expect(controller.retainedClips()).toEqual([]);
    controller.dispose();
    expect(replacement.revoked()).toBe(1);
  });

  it("ignores a pick that lands after the slot was retaken or the session was cancelled, revoking the late source", async () => {
    const pending: { resolve?: (pick: PreviewLocalVideoPick) => void } = {};
    const late = source("late");
    const ports: PreviewCaptureMachinePorts = {
      data,
      pickLocalVideo: () => new Promise<PreviewLocalVideoPick>((resolve) => { pending.resolve = resolve; }),
      saveAssociation: vi.fn(async () => undefined),
    };
    const controller = createPreviewCaptureMachine(ports);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    const slotId = controller.state.slots[0].id;
    const acquisition = controller.acquireSlot(slotId, "library");
    expect(controller.state.slots[0].status).toBe("acquiring");
    controller.cancelSession();
    pending.resolve?.({ status: "ready", source: late });
    await acquisition;
    expect(late.revoked()).toBe(1);
    expect(controller.retainedClips()).toEqual([]);
    expect(controller.state.status).toBe("cancelled");
  });

  it("saves by associating the picked clips with the preview profile, completes with that id and hands the object URLs to the association", async () => {
    const front = source("front");
    const side = source("side");
    const { controller, saved } = machine([{ status: "ready", source: front }, { status: "ready", source: side }]);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    for (const slot of controller.state.slots) await controller.acquireSlot(slot.id, "library");
    await settle();
    await controller.save();
    expect(controller.state.status).toBe("complete");
    expect(controller.state.savedProfileId).toBe(PREVIEW_PROFILE_ID);
    expect(saved).toHaveLength(1);
    expect(saved[0].profileId).toBe(PREVIEW_PROFILE_ID);
    expect(saved[0].clips.map((clip) => clip.uri).sort()).toEqual([front.uri, side.uri].sort());
    // Ownership moved to the association: the machine must not revoke them on dispose.
    controller.dispose();
    expect(front.revoked()).toBe(0);
    expect(side.revoked()).toBe(0);
  });

  it("reports a failed association save as a recoverable error without losing the review", async () => {
    const front = source("front");
    const side = source("side");
    const { controller, ports } = machine([{ status: "ready", source: front }, { status: "ready", source: side }]);
    (ports.saveAssociation as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("no"));
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    for (const slot of controller.state.slots) await controller.acquireSlot(slot.id, "library");
    await settle();
    await controller.save();
    expect(controller.state.status).toBe("error");
    controller.retrySession();
    expect(controller.state.status).toBe("result_review");
    expect(front.revoked()).toBe(0);
  });

  it("notifies subscribers on every transition and stops after unsubscribe", () => {
    const { controller } = machine();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    controller.selectMode("basic_1_plus_1");
    controller.startCollection();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    controller.cancelSession();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
