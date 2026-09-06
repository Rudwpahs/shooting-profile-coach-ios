import {
  PERSISTED_JOINT_NAMES_V2,
  type PersistedJointNameV2,
  type RepresentativePose4DV2,
} from "@/lib/shooting-profile/types";

export const JOINT_LABELS_KO: Readonly<Record<PersistedJointNameV2, string>> = {
  leftShoulder: "왼쪽 어깨", leftElbow: "왼쪽 팔꿈치", leftWrist: "왼쪽 손목",
  rightShoulder: "오른쪽 어깨", rightElbow: "오른쪽 팔꿈치", rightWrist: "오른쪽 손목",
  leftHip: "왼쪽 골반", leftKnee: "왼쪽 무릎", leftAnkle: "왼쪽 발목",
  rightHip: "오른쪽 골반", rightKnee: "오른쪽 무릎", rightAnkle: "오른쪽 발목",
};

const ANCHOR_LABELS_KO: Readonly<Record<string, string>> = {
  ready: "준비", deepestDip: "딥", rise: "상승", releaseProxy: "릴리스 추정", followThrough: "팔로우스루",
};

export type JointConeSummary = {
  joint: PersistedJointNameV2;
  label: string;
  maxConeDegrees: number;
  meanConeDegrees: number;
};

/**
 * Per-joint directional uncertainty over the stored 101 phases, largest cone
 * first. This is the evidence layer: it reads the stored `heuristic_v1`
 * cones as they are and never recomputes or reinterprets them.
 */
export function jointConeSummary(profile: RepresentativePose4DV2): JointConeSummary[] {
  const summaries = PERSISTED_JOINT_NAMES_V2.map((joint) => {
    let max = 0;
    let sum = 0;
    let count = 0;
    for (const frame of profile.frames) {
      const cone = frame.uncertainty[joint]?.directionalConeDegrees;
      if (typeof cone !== "number" || !Number.isFinite(cone)) continue;
      max = Math.max(max, cone);
      sum += cone;
      count += 1;
    }
    return { joint, label: JOINT_LABELS_KO[joint], maxConeDegrees: max, meanConeDegrees: count ? sum / count : 0 };
  });
  return summaries.sort((left, right) => right.maxConeDegrees - left.maxConeDegrees || left.joint.localeCompare(right.joint));
}

export type AnchorPosition = { id: string; label: string; percent: number };

/** The five detected anchors as percentages of the normalized shot. */
export function anchorPositions(profile: RepresentativePose4DV2): AnchorPosition[] {
  return profile.phaseAnchors.map((anchor) => ({
    id: anchor.id,
    label: ANCHOR_LABELS_KO[anchor.id] ?? anchor.id,
    percent: Math.round(Math.max(0, Math.min(1, anchor.phase)) * 100),
  }));
}

export type PrimaryFinding = { joint: PersistedJointNameV2; maxConeDegrees: number; line: string };

/**
 * The one line layer 1 shows: the least certain joint and its cone. An
 * uncertainty statement is the only "finding" the stored profile can support
 * honestly; biomechanical claims would need evidence the record does not carry.
 */
export function primaryFinding(profile: RepresentativePose4DV2): PrimaryFinding {
  const [first] = jointConeSummary(profile);
  return {
    joint: first.joint,
    maxConeDegrees: first.maxConeDegrees,
    line: `가장 불확실한 관절 · ${first.label} · 콘 ${Math.round(first.maxConeDegrees)}°`,
  };
}

export type ConfidenceBandCopy = { band: "high" | "basic"; title: string; quality: string };

/** Mode and quality as a band, not a score; the percentage belongs to layer 2. */
export function confidenceBandCopy(profile: RepresentativePose4DV2): ConfidenceBandCopy {
  const high = profile.mode === "high_accuracy_3_plus_3";
  return {
    band: high ? "high" : "basic",
    title: high ? "High · 3회 반복 일치" : "Basic · 대표 스냅샷",
    quality: profile.quality.passed ? "품질 통과" : "재촬영 필요",
  };
}
