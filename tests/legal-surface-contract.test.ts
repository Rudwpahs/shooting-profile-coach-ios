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
