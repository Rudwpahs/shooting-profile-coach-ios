export type BodyBand = 'compact' | 'balanced' | 'extended';
export type PoseTraits = { releaseElevation: number; armExtension: number; lowerBodyDrive: number; rhythm: number };
export type AnonymousPoseReference = { id: string; shortLabel: string; styleTitle: string; traits: PoseTraits; bodyFit: { stature: BodyBand; reach: BodyBand; lowerBodyPower: BodyBand; shoulderMobility: BodyBand }; evidenceState: 'youtube_pose_candidate'; modelBoundary: 'single_view_camera_relative_pose' };

export const ANONYMOUS_POSE_REFERENCES: AnonymousPoseReference[] = [
  {
    "id": "motion-01",
    "shortLabel": "모션 01",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 0,
      "armExtension": 69,
      "lowerBodyDrive": 56,
      "rhythm": 46
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "compact",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "compact"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-02",
    "shortLabel": "모션 02",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 63,
      "armExtension": 99,
      "lowerBodyDrive": 70,
      "rhythm": 79
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "extended",
      "lowerBodyPower": "extended",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-03",
    "shortLabel": "모션 03",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 73,
      "armExtension": 49,
      "lowerBodyDrive": 94,
      "rhythm": 81
    },
    "bodyFit": {
      "stature": "extended",
      "reach": "balanced",
      "lowerBodyPower": "extended",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-04",
    "shortLabel": "모션 04",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 12,
      "armExtension": 68,
      "lowerBodyDrive": 76,
      "rhythm": 50
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "balanced",
      "lowerBodyPower": "extended",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-05",
    "shortLabel": "모션 05",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 36,
      "armExtension": 0,
      "lowerBodyDrive": 63,
      "rhythm": 58
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "compact",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "compact"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-06",
    "shortLabel": "모션 06",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 52,
      "armExtension": 91,
      "lowerBodyDrive": 46,
      "rhythm": 70
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "extended",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-07",
    "shortLabel": "모션 07",
    "styleTitle": "리듬 연결",
    "traits": {
      "releaseElevation": 33,
      "armExtension": 50,
      "lowerBodyDrive": 10,
      "rhythm": 56
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "balanced",
      "lowerBodyPower": "compact",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-08",
    "shortLabel": "모션 08",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 60,
      "armExtension": 80,
      "lowerBodyDrive": 62,
      "rhythm": 76
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "extended",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-09",
    "shortLabel": "모션 09",
    "styleTitle": "높은 릴리스 흐름",
    "traits": {
      "releaseElevation": 99,
      "armExtension": 81,
      "lowerBodyDrive": 77,
      "rhythm": 92
    },
    "bodyFit": {
      "stature": "extended",
      "reach": "extended",
      "lowerBodyPower": "extended",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-10",
    "shortLabel": "모션 10",
    "styleTitle": "높은 릴리스 흐름",
    "traits": {
      "releaseElevation": 100,
      "armExtension": 100,
      "lowerBodyDrive": 82,
      "rhythm": 96
    },
    "bodyFit": {
      "stature": "extended",
      "reach": "extended",
      "lowerBodyPower": "extended",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-11",
    "shortLabel": "모션 11",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 58,
      "armExtension": 81,
      "lowerBodyDrive": 82,
      "rhythm": 76
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "extended",
      "lowerBodyPower": "extended",
      "shoulderMobility": "extended"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-12",
    "shortLabel": "모션 12",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 66,
      "armExtension": 45,
      "lowerBodyDrive": 71,
      "rhythm": 61
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "balanced",
      "lowerBodyPower": "extended",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-13",
    "shortLabel": "모션 13",
    "styleTitle": "하체 드라이브",
    "traits": {
      "releaseElevation": 25,
      "armExtension": 49,
      "lowerBodyDrive": 86,
      "rhythm": 49
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "compact",
      "lowerBodyPower": "extended",
      "shoulderMobility": "compact"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-14",
    "shortLabel": "모션 14",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 30,
      "armExtension": 66,
      "lowerBodyDrive": 62,
      "rhythm": 34
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "balanced",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-15",
    "shortLabel": "모션 15",
    "styleTitle": "리듬 연결",
    "traits": {
      "releaseElevation": 42,
      "armExtension": 39,
      "lowerBodyDrive": 52,
      "rhythm": 66
    },
    "bodyFit": {
      "stature": "balanced",
      "reach": "balanced",
      "lowerBodyPower": "balanced",
      "shoulderMobility": "balanced"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  },
  {
    "id": "motion-16",
    "shortLabel": "모션 16",
    "styleTitle": "확장형 팔 경로",
    "traits": {
      "releaseElevation": 20,
      "armExtension": 44,
      "lowerBodyDrive": 25,
      "rhythm": 35
    },
    "bodyFit": {
      "stature": "compact",
      "reach": "compact",
      "lowerBodyPower": "compact",
      "shoulderMobility": "compact"
    },
    "evidenceState": "youtube_pose_candidate",
    "modelBoundary": "single_view_camera_relative_pose"
  }
] as AnonymousPoseReference[];

export const ANONYMOUS_POSE_LIBRARY_STATUS = { profileCount: 16, visiblePlayerIdentity: false, sourceType: 'reviewed_youtube_single_view_pose', calibrationStatus: 'not_available' } as const;
