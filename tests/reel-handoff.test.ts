import { beforeEach, describe, expect, it } from "vitest";

import { clearReelHandoff, setReelHandoff, takeReelHandoff } from "@/lib/reels/reel-handoff";
import { anonymousReferenceReel, syntheticProfileReel } from "@/tests/fixtures/reel-fixtures";

describe("reel handoff from Home", () => {
  beforeEach(() => clearReelHandoff());

  it("hands the items and the tapped id to the route exactly once", () => {
    const items = [syntheticProfileReel(), anonymousReferenceReel()];
    setReelHandoff({ items, startId: items[1].id });
    expect(takeReelHandoff()).toEqual({ items, startId: items[1].id });
    expect(takeReelHandoff()).toBeNull();
  });

  it("is empty until Home sets it and after it is cleared", () => {
    expect(takeReelHandoff()).toBeNull();
    setReelHandoff({ items: [anonymousReferenceReel()], startId: "reference:x" });
    clearReelHandoff();
    expect(takeReelHandoff()).toBeNull();
  });
});
