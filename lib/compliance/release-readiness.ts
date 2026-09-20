export type ManualReleaseEvidence = {
  operatorFactsVerified: boolean;
  publicPrivacyPolicyUrlLive: boolean;
  voiceOverQaPassed: boolean;
  keyboardQaPassed: boolean;
  textScalingQaPassed: boolean;
  finalIosPrivacyGatePassed: boolean;
  shippingLicensesCleared: boolean;
};

export type ManualReleaseBlockerCode =
  | "operator_facts"
  | "privacy_policy_url"
  | "voiceover_qa"
  | "keyboard_qa"
  | "text_scaling_qa"
  | "ios_privacy_gate"
  | "shipping_licenses";

export function getManualReleaseBlockers(evidence: ManualReleaseEvidence): ManualReleaseBlockerCode[] {
  const blockers: ManualReleaseBlockerCode[] = [];
  if (!evidence.operatorFactsVerified) blockers.push("operator_facts");
  if (!evidence.publicPrivacyPolicyUrlLive) blockers.push("privacy_policy_url");
  if (!evidence.voiceOverQaPassed) blockers.push("voiceover_qa");
  if (!evidence.keyboardQaPassed) blockers.push("keyboard_qa");
  if (!evidence.textScalingQaPassed) blockers.push("text_scaling_qa");
  if (!evidence.finalIosPrivacyGatePassed) blockers.push("ios_privacy_gate");
  if (!evidence.shippingLicensesCleared) blockers.push("shipping_licenses");
  return blockers;
}
