import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { getLegalReleaseBlockers, LEGAL_DOCUMENT_VERSION } from "@/lib/compliance/legal-config";

const privacySource = readFileSync("app/legal/privacy.tsx", "utf8");
const termsSource = readFileSync("app/legal/terms.tsx", "utf8");
const cookieSource = readFileSync("app/legal/cookies.tsx", "utf8");
const indexSource = readFileSync("app/legal/index.tsx", "utf8");
const sharedScreenSource = readFileSync("components/legal/legal-document-screen.tsx", "utf8");

describe("legal release configuration", () => {
  it("keeps missing production operator facts as explicit blockers", () => {
    expect(LEGAL_DOCUMENT_VERSION).toMatch(/^2026-/);
    expect(getLegalReleaseBlockers()).toEqual(expect.arrayContaining([
      "operator_name",
      "support_email",
      "privacy_contact",
      "privacy_policy_url",
      "terms_url",
      "firestore_region",
    ]));
  });
});

describe("legal surfaces", () => {
  it("documents the actual privacy boundary without claiming raw video upload", () => {
    expect(privacySource).toContain("Firebase Authentication");
    expect(privacySource).toContain("원본 영상");
    expect(privacySource).toContain("업로드하지 않습니다");
    expect(privacySource).toContain("만 14세");
  });

  it("promises device-only footage by default and names cloud keeping only in a build that opted in", () => {
    // The promise follows the same build flag as the code that could break it, never a hand-written claim.
    expect(privacySource).toContain("FORMPATH_EXPERIMENTAL_FLAGS.cloudFilmShotsV1");
    expect(privacySource).toContain("이 기기에만 남으며 클라우드에 업로드하지 않습니다");
    // The opted-in text says who decides, where it goes, who can see it and how it ends.
    for (const phrase of ["샷마다", "비공개 Firebase Storage", "다른 사용자는 볼 수 없", "계정을 삭제하면 함께 지워집니다", "파일명과 EXIF는 저장하지 않"]) {
      expect(privacySource, phrase).toContain(phrase);
    }
    const settingsSource = readFileSync("app/(tabs)/settings.tsx", "utf8");
    expect(settingsSource).toContain("FORMPATH_EXPERIMENTAL_FLAGS.cloudFilmShotsV1");
    expect(settingsSource).toContain("원본 영상은 저장하지 않으며");
    expect(settingsSource).toContain("'클라우드에도 보관'을 켠 샷");
    // The release sheets must not keep an unconditional "never uploads" once the opt-in path exists.
    const questionnaire = readFileSync("docs/release/app-store-privacy-questionnaire.md", "utf8");
    expect(questionnaire).toContain("EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1");
    expect(questionnaire).toMatch(/default[^\n]*off/i);
    const gate = readFileSync("docs/release/ios-privacy-release-gate.md", "utf8");
    expect(gate).toContain("EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1");
    expect(gate).toContain("HOOPHUB_AI_PRODUCT_ARCHITECTURE");
  });

  it("documents the necessary web session cookie without inventing tracking", () => {
    expect(cookieSource).toContain("app_session_id");
    expect(cookieSource).toContain("인증");
    expect(cookieSource).toContain("광고");
  });

  it("keeps named-player claims out of user-facing Terms", () => {
    expect(termsSource).not.toMatch(/Stephen Curry|Paul George|Curry|Image 3D/i);
    expect(termsSource).toContain("의료");
    expect(termsSource).toContain("사용자가 제공하는 영상");
  });

  it("offers one reachable Legal & Privacy index and accessible shared screen", () => {
    expect(indexSource).toContain("개인정보 처리방침");
    expect(indexSource).toContain("이용약관");
    expect(indexSource).toContain("쿠키");
    expect(sharedScreenSource).toContain('accessibilityRole="header"');
    expect(sharedScreenSource).toContain("focusable");
  });
});
