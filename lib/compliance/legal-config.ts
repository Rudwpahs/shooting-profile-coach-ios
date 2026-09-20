const clean = (value: string | undefined) => value?.trim() || null;

export const LEGAL_DOCUMENT_VERSION = "2026-09-17";

export type LegalConfig = {
  operatorName: string | null;
  supportEmail: string | null;
  privacyContact: string | null;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  firestoreRegion: string | null;
  businessInfo: string | null;
};

export const LEGAL_CONFIG: LegalConfig = {
  operatorName: clean(process.env.EXPO_PUBLIC_OPERATOR_NAME),
  supportEmail: clean(process.env.EXPO_PUBLIC_SUPPORT_EMAIL),
  privacyContact: clean(process.env.EXPO_PUBLIC_PRIVACY_CONTACT),
  privacyPolicyUrl: clean(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL),
  termsUrl: clean(process.env.EXPO_PUBLIC_TERMS_URL),
  firestoreRegion: clean(process.env.EXPO_PUBLIC_FIRESTORE_REGION),
  businessInfo: clean(process.env.EXPO_PUBLIC_BUSINESS_INFO),
};

export type LegalReleaseBlocker =
  | "operator_name"
  | "support_email"
  | "privacy_contact"
  | "privacy_policy_url"
  | "terms_url"
  | "firestore_region";

export function getLegalReleaseBlockers(config: LegalConfig = LEGAL_CONFIG): LegalReleaseBlocker[] {
  const blockers: LegalReleaseBlocker[] = [];
  if (!config.operatorName) blockers.push("operator_name");
  if (!config.supportEmail) blockers.push("support_email");
  if (!config.privacyContact) blockers.push("privacy_contact");
  if (!config.privacyPolicyUrl) blockers.push("privacy_policy_url");
  if (!config.termsUrl) blockers.push("terms_url");
  if (!config.firestoreRegion) blockers.push("firestore_region");
  return blockers;
}

export function legalValue(value: string | null, missingLabel: string): string {
  return value ?? `출시 전 설정 필요: ${missingLabel}`;
}
