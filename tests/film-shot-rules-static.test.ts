import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Static pins for the cloud film-shot rules. The behavioural suite runs in the
 * Firestore + Storage emulators in CI (`pnpm test:rules`); these pins keep the
 * shapes, the owner-only stance and the CI wiring from drifting between runs.
 */
describe("cloud film shot rules", () => {
  it("adds owner-only filmShots head and clip documents to firestore.rules with the contract's constants", () => {
    const rules = read("firestore.rules");
    expect(rules).toContain("match /filmShots/{shotId}");
    expect(rules).toContain("match /clips/{slotId}");
    for (const token of [
      "film_shot_head_v1",
      "film_shot_clip_v1",
      "owner_footage_only_no_pose_analysis_v1",
      "owner_private_raw_footage_v1",
      "owner_cloud_footage_consent_v1",
      "'users/' + userId + '/filmShots/' + shotId + '/' + slotId",
      "67108864",
    ]) {
      expect(rules, token).toContain(token);
    }
    // The head is the journal: created first as `uploading`, so a document names every object an upload may
    // create. Clip documents are only accepted under an uploading head that names them, and the head only
    // completes over existing clip documents.
    expect(rules).toMatch(/function filmShotHeadAcceptsClip\(/);
    expect(rules).toMatch(/function validFilmShotCompletionTransition\(/);
    expect(rules).toMatch(/function allFilmShotClipsExist\(/);
    expect(rules).toMatch(/request\.resource\.data\.status == 'uploading'/);
    expect(rules).toMatch(/affectedKeys\(\)\.hasOnly\(\['status', 'updatedAt'\]\)/);
    // A clip document can no longer exist without a head, so nothing may be written or deleted outside one.
    expect(rules).not.toMatch(/function noFilmShotHead\(/);
    // Titles are display names: no dot, so never a file name.
    expect(rules).toContain("^[A-Za-z0-9가-힣 ·]{1,24}$");
  });

  it("adds storage.rules that only let the owner create, read and delete bounded video objects under their own prefix", () => {
    expect(existsSync("storage.rules")).toBe(true);
    const rules = read("storage.rules");
    expect(rules).toContain("match /users/{userId}/filmShots/{shotId}/{slotId}");
    expect(rules).toContain("request.auth.uid == userId");
    expect(rules).toContain("64 * 1024 * 1024");
    expect(rules).toMatch(/contentType\.matches\('video\/\(mp4\|quicktime\|webm\)'\)/);
    expect(rules).toContain("^(front|shooting_side)-[0-2]$");
    expect(rules).toContain("allow update: if false;");
    // Write-once: the emulator evaluates an overwrite as a create, so the create rule itself must refuse an existing object.
    expect(rules).toMatch(/allow create:[\s\S]*?resource == null/);
    // Everything else in the bucket is closed.
    expect(rules).toMatch(/match \/\{allPaths=\*\*\}\s*\{\s*allow read, write: if false;/);
    expect(rules).not.toMatch(/allow read: if true|allow write: if true/);
  });

  it("runs both emulators in CI and points firebase.json at the storage rules", () => {
    const firebaseJson = JSON.parse(read("firebase.json")) as { storage?: { rules?: string }; emulators?: { storage?: { port?: number } } };
    expect(firebaseJson.storage?.rules).toBe("storage.rules");
    expect(firebaseJson.emulators?.storage?.port).toBe(9199);
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:rules"]).toContain("--only firestore,storage");
    expect(existsSync("tests/emulator/film-shot-rules.emulator.test.ts")).toBe(true);
    const suite = read("tests/emulator/film-shot-rules.emulator.test.ts");
    expect(suite).toContain("FIREBASE_STORAGE_EMULATOR_HOST");
    expect(suite).toContain('readFileSync("storage.rules", "utf8")');
  });
});
