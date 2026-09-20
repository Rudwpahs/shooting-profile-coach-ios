import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const profileSource = readFileSync("app/(tabs)/profile.tsx", "utf8");
const accountPanelSource = readFileSync("components/profile/account-panel.tsx", "utf8");

describe("signup compliance wiring", () => {
  it("evaluates the compliance gate before Firebase signup", () => {
    const submitStart = profileSource.indexOf("const submit = async");
    const submitEnd = profileSource.indexOf("const deletePose", submitStart);
    const submitSource = profileSource.slice(submitStart, submitEnd);

    expect(profileSource).toContain('from "@/lib/compliance/signup-gate"');
    expect(submitSource).toContain("evaluateSignupGate");
    expect(submitSource.indexOf("evaluateSignupGate")).toBeLessThan(submitSource.indexOf("signUp(email, password)"));
  });

  it("keeps all three required signup states in the route", () => {
    expect(profileSource).toContain("age14Plus");
    expect(profileSource).toContain("termsAccepted");
    expect(profileSource).toContain("privacyNoticeAcknowledged");
    expect(profileSource).toContain('router.push("/legal/terms"');
    expect(profileSource).toContain('router.push("/legal/privacy"');
  });

  it("renders three accessible checkbox controls only for signup", () => {
    expect(accountPanelSource).toContain('mode === "signup"');
    expect(accountPanelSource.match(/accessibilityRole="checkbox"/g)?.length).toBe(3);
    expect(accountPanelSource).toContain("만 14세 이상입니다");
    expect(accountPanelSource).toContain("이용약관에 동의합니다");
    expect(accountPanelSource).toContain("개인정보 처리 안내를 확인했습니다");
    expect(accountPanelSource).toContain("accessibilityState={{ checked:");
  });

  it("provides in-context Terms and Privacy navigation without bundling marketing consent", () => {
    expect(accountPanelSource).toContain("onOpenTerms");
    expect(accountPanelSource).toContain("onOpenPrivacy");
    expect(accountPanelSource).not.toMatch(/마케팅.*동의|광고.*동의/);
  });
});
