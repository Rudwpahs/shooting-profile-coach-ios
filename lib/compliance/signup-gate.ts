export type SignupComplianceState = {
  age14Plus: boolean;
  termsAccepted: boolean;
  privacyNoticeAcknowledged: boolean;
};

export type SignupGateFailureCode =
  | "age_required"
  | "terms_required"
  | "privacy_notice_required";

export type SignupGateResult =
  | { ok: true }
  | { ok: false; code: SignupGateFailureCode; message: string };

export function evaluateSignupGate(state: SignupComplianceState): SignupGateResult {
  if (!state.age14Plus) {
    return {
      ok: false,
      code: "age_required",
      message: "Hoop Hub는 만 14세 이상부터 가입할 수 있습니다.",
    };
  }

  if (!state.termsAccepted) {
    return {
      ok: false,
      code: "terms_required",
      message: "회원가입 전에 이용약관에 동의해 주세요.",
    };
  }

  if (!state.privacyNoticeAcknowledged) {
    return {
      ok: false,
      code: "privacy_notice_required",
      message: "회원가입 전에 개인정보 처리 안내를 확인해 주세요.",
    };
  }

  return { ok: true };
}
