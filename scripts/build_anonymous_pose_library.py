"""Build an app-safe anonymous 16-form library from reviewed pose profiles.

The output deliberately removes player names, keys, source URLs, and review
file locations. It keeps only normalized pose traits and derived, explanatory
body/style fit signals for local recommendation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def scale(value: float, low: float, high: float) -> int:
    if high <= low:
        return 50
    return round(max(0.0, min(100.0, (value - low) * 100.0 / (high - low))))


def band(value: int) -> str:
    if value < 38:
        return "compact"
    if value > 66:
        return "extended"
    return "balanced"


def style_title(traits: dict[str, int]) -> str:
    highest = max(traits, key=traits.get)
    labels = {
        "releaseElevation": "높은 릴리스 흐름",
        "armExtension": "확장형 팔 경로",
        "lowerBodyDrive": "하체 드라이브",
        "rhythm": "리듬 연결",
    }
    return labels[highest]


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_anonymous_pose_library.py <input-json> <output-ts>")
    source = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    profiles = source["profiles"]
    metrics = [item["metrics"] for item in profiles]
    bounds = {
        key: (min(float(row[key]) for row in metrics), max(float(row[key]) for row in metrics))
        for key in ("Elbow angle", "Shoulder angle", "Hip angle", "Knee angle")
    }
    records = []
    for index, item in enumerate(profiles, start=1):
        raw = item["metrics"]
        elbow = scale(float(raw["Elbow angle"]), *bounds["Elbow angle"])
        shoulder = scale(float(raw["Shoulder angle"]), *bounds["Shoulder angle"])
        hip = scale(float(raw["Hip angle"]), *bounds["Hip angle"])
        knee = scale(float(raw["Knee angle"]), *bounds["Knee angle"])
        traits = {
            "releaseElevation": shoulder,
            "armExtension": elbow,
            "lowerBodyDrive": round((hip + knee) / 2),
            "rhythm": round((100 - abs(hip - knee) + shoulder) / 2),
        }
        records.append(
            {
                "id": f"motion-{index:02d}",
                "shortLabel": f"모션 {index:02d}",
                "styleTitle": style_title(traits),
                "traits": traits,
                "bodyFit": {
                    "stature": band(traits["releaseElevation"]),
                    "reach": band(round((traits["releaseElevation"] + traits["armExtension"]) / 2)),
                    "lowerBodyPower": band(traits["lowerBodyDrive"]),
                    "shoulderMobility": band(round((traits["releaseElevation"] + traits["armExtension"]) / 2)),
                },
                "evidenceState": "youtube_pose_candidate",
                "modelBoundary": "single_view_camera_relative_pose",
            }
        )
    target = Path(sys.argv[2])
    target.write_text(
        "export type BodyBand = 'compact' | 'balanced' | 'extended';\n"
        "export type PoseTraits = { releaseElevation: number; armExtension: number; lowerBodyDrive: number; rhythm: number };\n"
        "export type AnonymousPoseReference = { id: string; shortLabel: string; styleTitle: string; traits: PoseTraits; bodyFit: { stature: BodyBand; reach: BodyBand; lowerBodyPower: BodyBand; shoulderMobility: BodyBand }; evidenceState: 'youtube_pose_candidate'; modelBoundary: 'single_view_camera_relative_pose' };\n\n"
        "export const ANONYMOUS_POSE_REFERENCES: AnonymousPoseReference[] = "
        + json.dumps(records, ensure_ascii=False, indent=2)
        + " as AnonymousPoseReference[];\n\n"
        "export const ANONYMOUS_POSE_LIBRARY_STATUS = { profileCount: 16, visiblePlayerIdentity: false, sourceType: 'reviewed_youtube_single_view_pose', calibrationStatus: 'not_available' } as const;\n",
        encoding="utf-8",
    )
    print(json.dumps({"profileCount": len(records), "output": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
