import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Film shots (the owner's own footage, kept on this device without pose
 * analysis) appear wherever the owner's skeletons do: Home stories, the
 * Profile grid, and Reels. Never a file name, never an upload.
 */
describe("film shots on the product surfaces", () => {
  it("Home: film shots are stories after my own skeleton and before the reference, and open Reels at the shot", () => {
    const route = read("app/(tabs)/index.tsx");
    const feed = read("components/home/home-feed.tsx");
    const strip = read("components/home/story-strip.tsx");
    expect(route).toContain("useFilmShots(");
    expect(route).toContain("homeReelItems(latest, ANONYMOUS_POSE_REFERENCES, filmShots.shots)");
    expect(feed).toContain('kind: "film"');
    expect(feed).toContain("filmReelId(shot.id)");
    const own = feed.indexOf('key: "own"');
    const film = feed.indexOf('kind: "film"');
    const reference = feed.indexOf('key: "reference"');
    expect(own).toBeGreaterThan(-1);
    expect(film).toBeGreaterThan(own);
    expect(reference).toBeGreaterThan(film);
    expect(strip).toContain('name="filmstrip"');
    for (const source of [route, feed, strip]) expect(source).not.toMatch(/IMG_|\.mp4|\.mov|clip\.uri/i);
  });

  it("Profile: film tiles in the grid open Reels, delete on long press after a confirm, and stay honest in the label", () => {
    const profile = read("app/(tabs)/profile.tsx");
    const grid = read("components/profile/motion-grid.tsx");
    expect(profile).toContain("useFilmShots(");
    expect(profile).toContain("deleteFilmShot(");
    expect(profile).toMatch(/Alert\.alert\(\s*"내 영상 삭제"/);
    expect(profile).toContain("filmReelId(shotId)");
    expect(profile).toContain("/reels?start=");
    expect(profile).toContain('label: "내 영상"');
    expect(grid).toContain("readonly FilmShotV1[]");
    expect(grid).toContain("onOpenFilm");
    expect(grid).toContain("onDeleteFilm");
    expect(grid).toContain("내 영상 · 이 기기에만 보관 · 포즈 분석 없음");
    expect(grid).not.toMatch(/clip\.uri|\.mp4/);
  });

  it("Reels: a deep link to a film shot waits for the device list, surfaces a store failure with a retry, and tells a missing shot apart from it", () => {
    const route = read("app/reels.tsx");
    expect(route).toContain("useFilmShots(");
    expect(route).toContain("homeReelItems(latest, ANONYMOUS_POSE_REFERENCES, filmShots.shots)");
    expect(route).toContain("isFilmReelId(startId)");
    expect(route).toContain('filmShots.status === "loading"');
    expect(route).toContain('filmShots.status === "error"');
    expect(route).toContain("<FilmReelUnavailable");
    const unavailable = read("components/reels/film-reel-unavailable.tsx");
    expect(unavailable).toContain('"film-reel-storage-error"');
    expect(unavailable).toContain('"film-reel-missing"');
    expect(unavailable).toMatch(/accessibilityLabel="다시 읽기"/);
    expect(unavailable).toMatch(/accessibilityLabel="닫기"/);
    expect(unavailable).toContain("영상이 삭제된 것은 아닙니다");
    expect(unavailable).toContain("이 영상은 이 기기에 없습니다");
  });

  it("Profile: a film-store read failure is shown apart from the remote list, with a retry, and the 내 영상 count is not a confident zero", () => {
    const profile = read("app/(tabs)/profile.tsx");
    expect(profile).toContain('testID="film-shots-error"');
    expect(profile).toContain('accessibilityLabel="내 영상 다시 읽기"');
    expect(profile).toContain("filmShots.reload");
    expect(profile).toMatch(/filmShots\.status === "error" \? null : filmShots\.shots\.length/);
    const stats = read("components/profile/profile-stats.tsx");
    expect(stats).toContain("value: number | null");
    expect(stats).toContain("확인 불가");
  });

  it("Capture: a saved film shot completes into Reels at the shot, and the preview capture keeps footage as a film shot", () => {
    const route = read("app/private-capture.tsx");
    expect(route).toContain("isFilmShotId(savedProfileId)");
    expect(route).toContain("filmReelId(savedProfileId)");
    expect(route).toContain('completionActionLabel="내 영상 릴 열기"');
    const preview = read("lib/preview/preview-capture-session.tsx");
    expect(preview).toContain("saveFilmShot(");
    expect(preview).not.toContain("saveLocalFilmAssociation");
    expect(preview).not.toContain("buildPreviewData");
  });

  it("the hook restores every shot's media for this session and follows save and delete without a focus listener", () => {
    const hook = read("hooks/use-film-shots.ts");
    expect(hook).toContain("listFilmShots(");
    expect(hook).toContain("restoreFilmShot(");
    expect(hook).toContain("subscribeFilmShots(");
    expect(hook).not.toMatch(/@react-navigation|useFocusEffect|firebase|console\./);
  });
});
