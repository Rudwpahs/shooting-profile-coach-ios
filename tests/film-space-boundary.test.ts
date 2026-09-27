import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const protectedCloudSource = [
  "lib/firebase-shooting-profile-contract.ts",
  "lib/firebase-shooting-profiles.ts",
  "firestore.rules",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

const localAssociationSource = readFileSync(
  resolve(process.cwd(), "lib/film-space/local-association.ts"),
  "utf8",
);

const nativeViewerSource = readFileSync(
  resolve(process.cwd(), "components/shooting-profile/film-space-viewer.native.tsx"),
  "utf8",
);

describe("film-space storage and privacy boundary", () => {
  it("does not introduce local-film or raw-media fields into protected Firestore/profile contracts", () => {
    expect(protectedCloudSource).not.toMatch(
      /LocalFilm|filmUri|videoUri|thumbnailUri|sourceFilename|rawVideo|rawMedia/i,
    );
  });

  it("keeps profile-to-video association local-only", () => {
    expect(localAssociationSource).toMatch(/AsyncStorage/);
    expect(localAssociationSource).not.toMatch(/firebase|fetch\(|axios|trpc|upload/i);
  });

  it("never renders the local URI/path in Film Space user-visible UI", () => {
    expect(nativeViewerSource).not.toMatch(/\{\s*clip\.uri\s*\}/);
    expect(nativeViewerSource).not.toMatch(/Text[^>]*>[^<]*clip\.uri/i);
  });
});