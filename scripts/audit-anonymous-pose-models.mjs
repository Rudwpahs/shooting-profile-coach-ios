import { readFileSync } from "node:fs";

const sourcePath = "/home/ubuntu/initial-roster-source/models/youtube_single_view_pose_profiles.json";
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const profiles = source.profiles;
const metricNames = ["Elbow angle", "Shoulder angle", "Hip angle", "Knee angle"];

const bounds = Object.fromEntries(metricNames.map((name) => [
  name,
  {
    min: Math.min(...profiles.map((profile) => profile.metrics[name])),
    max: Math.max(...profiles.map((profile) => profile.metrics[name])),
  },
]));

function normalize(value, { min, max }) {
  return Math.round(Math.max(0, Math.min(100, ((value - min) * 100) / (max - min))));
}

function boundedDescriptor(value, inputLow, inputHigh, outputLow, outputHigh) {
  const normalized = Math.max(0, Math.min(1, (value - inputLow) / (inputHigh - inputLow)));
  return Math.round(outputLow + normalized * (outputHigh - outputLow));
}

function traitSummary(profile) {
  const elbow = normalize(profile.metrics["Elbow angle"], bounds["Elbow angle"]);
  const shoulder = normalize(profile.metrics["Shoulder angle"], bounds["Shoulder angle"]);
  const hip = normalize(profile.metrics["Hip angle"], bounds["Hip angle"]);
  const knee = normalize(profile.metrics["Knee angle"], bounds["Knee angle"]);
  return {
    releaseElevation: shoulder,
    armExtension: elbow,
    lowerBodyDrive: Math.round((hip + knee) / 2),
    rhythm: Math.round((100 - Math.abs(hip - knee) + shoulder) / 2),
  };
}

function conservativeDescriptor(profile) {
  const { metrics } = profile;
  const lowerBodyLoad = (360 - metrics["Hip angle"] - metrics["Knee angle"]) / 2;
  const coupledExtension = 100 - Math.abs(metrics["Hip angle"] - metrics["Knee angle"]);
  return {
    releaseElevation: boundedDescriptor(metrics["Shoulder angle"], 100, 160, 38, 66),
    armExtension: boundedDescriptor(metrics["Elbow angle"], 115, 165, 38, 66),
    lowerBodyDrive: boundedDescriptor(lowerBodyLoad, 10, 50, 38, 66),
    rhythm: boundedDescriptor(coupledExtension, 70, 100, 42, 58),
  };
}

const rows = profiles.map((profile, index) => {
  const traits = traitSummary(profile);
  const conservativeTraits = conservativeDescriptor(profile);
  const extremeTraits = Object.entries(traits).filter(([, value]) => value === 0 || value === 100).map(([key]) => key);
  const flags = [
    "단일 시점·비보정 좌표계",
    profile.sample_count < 4 ? "표본 3개" : null,
    profile.review.camera_view === "multiple_unsynchronized" ? "비동기 다중 클립" : null,
    extremeTraits.length ? `표본 내 min-max 정규화 극단값: ${extremeTraits.join(", ")}` : null,
  ].filter(Boolean);
  return {
    motion: `motion-${String(index + 1).padStart(2, "0")}`,
    samples: profile.sample_count,
    camera: profile.review.camera_view,
    traits,
    conservativeTraits,
    flags,
    decision: "재구성 필요",
  };
});

const summary = {
  profileCount: rows.length,
  calibration: "not_available",
  metric3d: "not_available",
  minMaxNormalizedExtremeModels: rows.filter((row) => row.flags.some((flag) => flag.startsWith("표본 내 min-max"))).map((row) => row.motion),
  sampleCount3Models: rows.filter((row) => row.samples === 3).map((row) => row.motion),
  unsynchronizedMultiClipModels: rows.filter((row) => row.camera === "multiple_unsynchronized").map((row) => row.motion),
  recomposeRequired: rows.map((row) => row.motion),
};

console.log(JSON.stringify({ bounds, summary, models: rows }, null, 2));
