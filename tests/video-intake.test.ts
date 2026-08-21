import { describe, expect, it } from "vitest";

import { validateSelectedShootingVideo } from "@/lib/video-intake";

describe("private shooting video intake", () => {
  it("accepts a device video within the visible-shot duration range", () => {
    expect(validateSelectedShootingVideo({ uri: "file:///shot.mov", type: "video", mimeType: "video/quicktime", duration: 7_000 })).toBeNull();
  });

  it("rejects wrong media types and durations before native detection", () => {
    expect(validateSelectedShootingVideo({ uri: "file:///photo.jpg", type: "image", duration: null })).toContain("사진이 아닌");
    expect(validateSelectedShootingVideo({ uri: "file:///short.mov", type: "video", duration: 1_500 })).toContain("2초 이상");
    expect(validateSelectedShootingVideo({ uri: "file:///long.mov", type: "video", duration: 20_001 })).toContain("20초 이하");
  });
});
