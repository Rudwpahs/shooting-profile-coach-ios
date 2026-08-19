import fs from "node:fs";
import path from "node:path";

const sourceRoot = process.argv[2];
const outputPath = process.argv[3];

if (!sourceRoot || !outputPath) {
  throw new Error("Usage: node scripts/verify_initial_roster.mjs <source-root> <output-json>");
}

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(sourceRoot, relativePath), "utf8"));
const models = readJson("models/nba_player_models.json");
const modelDir = path.join(sourceRoot, "models");
const canonicalFiles = fs.readdirSync(modelDir).filter((file) => file.endsWith("_canonical3d_validation.json"));
const canonicalRows = canonicalFiles.map((file) => ({ file, payload: JSON.parse(fs.readFileSync(path.join(modelDir, file), "utf8")) }));

const normalize = (value) => String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const roster = Object.entries(models).map(([name, profile]) => {
  const playerKey = profile?.meta?.player_key ?? name.toLowerCase().replaceAll(" ", "_");
  const views = Object.values(profile?.views ?? {});
  const clips = views.flatMap((view) => view?.clips ?? []);
  const uniqueUrls = [...new Set(clips.map((clip) => clip?.youtube_url).filter(Boolean))];
  const normalizedName = normalize(name);
  const matchingTitleCount = clips.filter((clip) => normalize(clip?.title).includes(normalizedName)).length;
  const validQualityCount = clips.filter((clip) => clip?.quality?.valid === true).length;
  const ballEvidenceCount = clips.filter((clip) => clip?.ball_track || clip?.ball_detected || clip?.shot_event?.ball_hand_separation).length;
  const manualReviewCount = clips.filter((clip) => clip?.provenance?.reviewed === true || clip?.review?.approved === true).length;
  const licensingCount = clips.filter((clip) => clip?.provenance?.license_status || clip?.license_status).length;
  const calibratedViewCount = views.filter((view) => view?.calibration?.intrinsics && view?.calibration?.extrinsics).length;
  const matchingValidation = canonicalRows.filter(({ payload }) => normalize(payload?.player_key ?? payload?.player) === normalize(playerKey));
  const canonicalPassed = matchingValidation.some(({ payload }) => Boolean(payload?.valid ?? payload?.passed));
  const reasons = [];

  if (manualReviewCount !== clips.length) reasons.push("human identity and real-shot review is absent");
  if (licensingCount !== clips.length) reasons.push("source license/use status is absent");
  if (ballEvidenceCount !== clips.length) reasons.push("ball-hand separation / shot-event evidence is absent");
  if (calibratedViewCount < 2) reasons.push("at least two calibrated camera views are absent");
  if (!canonicalPassed) reasons.push("no passing canonical 3D validation is present");
  if (uniqueUrls.length < 3) reasons.push("fewer than three distinct source clips");

  return {
    player: name,
    playerKey,
    clipCount: clips.length,
    uniqueSourceCount: uniqueUrls.length,
    titleNameMatchCount: matchingTitleCount,
    validPoseQualityCount: validQualityCount,
    ballEvidenceCount,
    manualReviewCount,
    licensingCount,
    calibratedViewCount,
    canonicalValidationFiles: matchingValidation.map(({ file }) => file),
    canonicalPassed,
    decision: reasons.length ? "blocked_unverified" : "eligible_for_reconstruction",
    reasons,
  };
});

const summary = {
  sourceCommit: "27eada5",
  rosterCount: roster.length,
  eligibleForReconstruction: roster.filter((item) => item.decision === "eligible_for_reconstruction").length,
  blockedUnverified: roster.filter((item) => item.decision === "blocked_unverified").length,
  roster,
};

fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ rosterCount: summary.rosterCount, eligibleForReconstruction: summary.eligibleForReconstruction, blockedUnverified: summary.blockedUnverified }, null, 2));
