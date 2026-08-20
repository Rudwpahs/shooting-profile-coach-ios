import type { PersonalPoseCandidate } from "@/lib/personal-pose";

export type PoseDetectionProgress = { completed: number; total: number };
export type PoseDetectionResult =
  | { status: "complete"; candidate: PersonalPoseCandidate; sampledFrames: number }
  | { status: "rejected"; candidate: PersonalPoseCandidate; sampledFrames: number; reason: string }
  | { status: "native_build_required"; reason: string }
  | { status: "error"; reason: string };
