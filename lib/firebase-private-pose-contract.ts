export type FirebasePrivatePoseInput = {
  sourceLabel: string;
  poseJson: string;
  qualityJson: string;
  correctedMotionJson?: string;
  correctionJson?: string;
};

const LIMITS = { sourceLabel: 255, poseJson: 900000, qualityJson: 20000, correctedMotionJson: 450000, correctionJson: 20000 } as const;

function isJson(value: string) {
  try { JSON.parse(value); return true; } catch { return false; }
}

/** Validates the client payload before the matching Firestore rule evaluates it. */
export function validateFirebasePrivatePoseInput(input: FirebasePrivatePoseInput): string[] {
  const failures: string[] = [];
  if (!input.sourceLabel.trim() || input.sourceLabel.length > LIMITS.sourceLabel) failures.push("invalid_source_label");
  if (!input.poseJson || input.poseJson.length > LIMITS.poseJson || !isJson(input.poseJson)) failures.push("invalid_pose_json");
  if (!input.qualityJson || input.qualityJson.length > LIMITS.qualityJson || !isJson(input.qualityJson)) failures.push("invalid_quality_json");
  const hasMotion = input.correctedMotionJson !== undefined;
  const hasCorrection = input.correctionJson !== undefined;
  if (hasMotion !== hasCorrection) failures.push("incomplete_corrected_motion_pair");
  if (hasMotion && (!input.correctedMotionJson || input.correctedMotionJson.length > LIMITS.correctedMotionJson || !isJson(input.correctedMotionJson))) failures.push("invalid_corrected_motion_json");
  if (hasCorrection && (!input.correctionJson || input.correctionJson.length > LIMITS.correctionJson || !isJson(input.correctionJson))) failures.push("invalid_correction_json");
  return failures;
}
