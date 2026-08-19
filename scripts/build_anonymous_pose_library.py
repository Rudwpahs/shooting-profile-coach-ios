"""Build anonymous, non-metric biomechanical reference descriptors.

The source file is used only for de-identified summary-angle descriptors. It is
not a sequence-level 3D dataset and must never be exported as athlete motion.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def bounded_descriptor(value: float, input_low: float, input_high: float, output_low: int, output_high: int) -> int:
    normalized = max(0.0, min(1.0, (value - input_low) / (input_high - input_low)))
    return round(output_low + normalized * (output_high - output_low))


def traits_from_summary(metrics: dict[str, float]) -> dict[str, int]:
    lower_body_load = (360 - float(metrics["Hip angle"]) - float(metrics["Knee angle"])) / 2
    coupled_extension = 100 - abs(float(metrics["Hip angle"]) - float(metrics["Knee angle"]))
    return {
        "releaseElevation": bounded_descriptor(float(metrics["Shoulder angle"]), 100, 160, 38, 66),
        "armExtension": bounded_descriptor(float(metrics["Elbow angle"]), 115, 165, 38, 66),
        "lowerBodyDrive": bounded_descriptor(lower_body_load, 10, 50, 38, 66),
        "rhythm": bounded_descriptor(coupled_extension, 70, 100, 42, 58),
    }


def style_title(traits: dict[str, int]) -> str:
    highest = max(traits, key=traits.get)
    return {
        "releaseElevation": "높은 릴리스 참조",
        "armExtension": "상체 확장 강조",
        "lowerBodyDrive": "하체 연결 강조",
        "rhythm": "상승 리듬 강조",
    }[highest]


def source_status(profile: dict[str, object]) -> str:
    review = profile["review"]
    title = str(profile.get("source_title", "")).lower()
    if review.get("camera_view") == "multiple_unsynchronized" or "free throw" in title or "2k" in title:
        return "needs_manual_clip_selection"
    return "needs_manual_clip_selection"


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_anonymous_pose_library.py <input-json> <output-ts>")
    profiles = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["profiles"]
    records = []
    for index, profile in enumerate(profiles, start=1):
        traits = traits_from_summary(profile["metrics"])
        records.append({
            "id": f"motion-{index:02d}",
            "shortLabel": f"모션 {index:02d}",
            "styleTitle": style_title(traits),
            "traits": traits,
            "bodyFit": {"stature": "balanced", "reach": "balanced", "lowerBodyPower": "balanced", "shoulderMobility": "balanced"},
            "evidenceState": "summary_derived_biomechanical_reference_animation",
            "modelBoundary": "non_metric_reference_animation",
            "sourceSequenceStatus": source_status(profile),
        })
    target = Path(sys.argv[2])
    target.write_text("export const generatedAnonymousReferences = " + json.dumps(records, ensure_ascii=False, indent=2) + " as const;\n", encoding="utf-8")
    print(json.dumps({"profileCount": len(records), "output": str(target)}, ensure_ascii=False))


if __name__ == "__main__":
    raise SystemExit(main())
