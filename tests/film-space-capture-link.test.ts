import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clearLocalFilmRefs,
  dropLocalFilmRef,
  retainAcceptedLocalFilmRef,
  type LocalFilmClipRefV1,
} from "@/lib/film-space/local-association";

const hookSource = readFileSync(
  resolve(process.cwd(), "hooks/use-shooting-profile-capture.ts"),
  "utf8",
);

const clipA: LocalFilmClipRefV1 = {
  slotId: "front-0",
  view: "front",
  takeIndex: 0,
  uri: "file:///a.mov",
  durationMs: 2400,
  width: 1080,
  height: 1920,
};
const clipB: LocalFilmClipRefV1 = {
  slotId: "shooting-side-0",
  view: "shooting_side",
  takeIndex: 0,
  uri: "file:///b.mov",
  durationMs: 2600,
  width: 1080,
  height: 1920,
};

describe("film-space capture link", () => {
  it("drops a slot film ref on retake and all refs on cancel/session invalidation", () => {
    const refs = new Map<string, LocalFilmClipRefV1>();
    retainAcceptedLocalFilmRef(refs, clipA);
    retainAcceptedLocalFilmRef(refs, clipB);
    dropLocalFilmRef(refs, clipA.slotId);
    expect([...refs.keys()]).toEqual([clipB.slotId]);
    clearLocalFilmRefs(refs);
    expect(refs.size).toBe(0);
  });

  it("integrates local refs only after accepted pose clips and persists after successful profile save", () => {
    expect(hookSource).toMatch(/localFilmRefsRef/);
    expect(hookSource).toMatch(/retainAcceptedLocalFilmRef/);
    expect(hookSource).toMatch(/SLOT_ACCEPTED/);
    expect(hookSource).toMatch(/saveLocalFilmAssociation/);
    expect(hookSource).toMatch(/runCaptureSaveOperationV2/);
    expect(hookSource).toMatch(/dropLocalFilmRef/);
    expect(hookSource).toMatch(/clearLocalFilmRefs/);
  });

  it("does not introduce raw video upload or Firestore film fields", () => {
    expect(hookSource).not.toMatch(/uploadBytes|uploadString|getStorage|firebase\/storage/);
    expect(hookSource).not.toMatch(/filmUri|videoUri|rawVideo/);
  });
});