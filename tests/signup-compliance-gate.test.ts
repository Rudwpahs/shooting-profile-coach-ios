import { describe, expect, it } from "vitest";

import { evaluateSignupGate } from "@/lib/compliance/signup-gate";

describe("signup compliance gate", () => {
  it("blocks signup until the 14+ confirmation passes", () => {
    expect(evaluateSignupGate({
      age14Plus: false,
      termsAccepted: true,
      privacyNoticeAcknowledged: true,
    })).toMatchObject({ ok: false, code: "age_required" });
  });

  it("blocks signup until Terms are accepted", () => {
    expect(evaluateSignupGate({
      age14Plus: true,
      termsAccepted: false,
      privacyNoticeAcknowledged: true,
    })).toMatchObject({ ok: false, code: "terms_required" });
  });

  it("blocks signup until the privacy notice is acknowledged", () => {
    expect(evaluateSignupGate({
      age14Plus: true,
      termsAccepted: true,
      privacyNoticeAcknowledged: false,
    })).toMatchObject({ ok: false, code: "privacy_notice_required" });
  });

  it("allows signup only when every required gate passes", () => {
    expect(evaluateSignupGate({
      age14Plus: true,
      termsAccepted: true,
      privacyNoticeAcknowledged: true,
    })).toEqual({ ok: true });
  });
});
