export type IosReleaseEvidence = {
  xcodePrivacyReportReviewed: boolean;
  requiredReasonApisReviewed: boolean;
  thirdPartySdkManifestsReviewed: boolean;
  appStorePrivacyLabelsReviewed: boolean;
  productionFirestoreRegionVerified: boolean;
};

export type IosReleaseBlockerCode =
  | "xcode_privacy_report"
  | "required_reason_apis"
  | "third_party_sdk_manifests"
  | "app_store_privacy_labels"
  | "firestore_region";

export function getIosReleaseBlockers(evidence: IosReleaseEvidence): IosReleaseBlockerCode[] {
  const blockers: IosReleaseBlockerCode[] = [];
  if (!evidence.xcodePrivacyReportReviewed) blockers.push("xcode_privacy_report");
  if (!evidence.requiredReasonApisReviewed) blockers.push("required_reason_apis");
  if (!evidence.thirdPartySdkManifestsReviewed) blockers.push("third_party_sdk_manifests");
  if (!evidence.appStorePrivacyLabelsReviewed) blockers.push("app_store_privacy_labels");
  if (!evidence.productionFirestoreRegionVerified) blockers.push("firestore_region");
  return blockers;
}
