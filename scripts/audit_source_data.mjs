import fs from 'node:fs';
import path from 'node:path';

const sourceRoot = process.argv[2];
if (!sourceRoot) {
  throw new Error('Usage: node scripts/audit_source_data.mjs <shooting-form-analysis-root>');
}

const readJson = (relativePath) => {
  const filePath = path.join(sourceRoot, relativePath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const models = readJson('models/nba_player_models.json');
const catalog = readJson('models/youtube_candidate_catalog.json');
const dataQuality = readJson('models/data_quality_report.json');
const validationFiles = fs.readdirSync(path.join(sourceRoot, 'models'))
  .filter((file) => file.endsWith('_canonical3d_validation.json'))
  .sort();

const playerRows = Object.entries(models).map(([displayName, profile]) => {
  const meta = profile?.meta ?? {};
  const views = profile?.views ?? {};
  const clips = Object.values(views).flatMap((view) => view?.clips ?? []);
  const sourceUrls = new Set(clips.map((clip) => clip?.youtube_url).filter(Boolean));
  const metrics = {
    elbow: Number(profile?.metrics?.['Elbow angle'] ?? 0),
    shoulder: Number(profile?.metrics?.['Shoulder angle'] ?? 0),
    hip: Number(profile?.metrics?.['Hip angle'] ?? 0),
    knee: Number(profile?.metrics?.['Knee angle'] ?? 0),
  };
  const hasAngles = ['Elbow angle', 'Shoulder angle', 'Hip angle', 'Knee angle']
    .every((key) => Number.isFinite(Number(profile?.metrics?.[key])) ||
      Object.values(views).some((view) => Number.isFinite(Number(view?.angles?.[key.toLowerCase().replace(' angle', '')]))));
  return {
    displayName,
    playerKey: meta.player_key ?? displayName.toLowerCase().replaceAll(' ', '_'),
    source: meta.source ?? 'unknown',
    space: meta.space ?? 'unknown',
    views: Object.keys(views),
    clipCount: clips.length,
    uniqueSourceCount: sourceUrls.size,
    metrics,
    hasAngles,
    hasManualProvenance: false,
    status: 'unverified_legacy',
    reasons: [
      'player identity and shot-event review records are absent',
      'source clips do not use approved provenance manifest',
      'legacy angle profile cannot be published as a verified reference',
    ],
  };
});

const candidateEntries = Array.isArray(catalog) ? catalog : Object.values(catalog ?? {}).flat();
const candidateSummary = candidateEntries.reduce((acc, item) => {
  const key = item?.player_key ?? item?.player ?? 'unknown';
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});

const canonicalValidations = validationFiles.map((file) => {
  const payload = readJson(path.join('models', file));
  return {
    file,
    playerKey: payload?.player_key ?? payload?.player ?? 'unknown',
    status: payload?.status ?? payload?.validation_status ?? 'unknown',
    valid: Boolean(payload?.valid ?? payload?.passed ?? false),
    reasons: payload?.reasons ?? payload?.errors ?? [],
  };
});

const numericSummary = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = (ratio) => {
    if (!sorted.length) return 0;
    const index = (sorted.length - 1) * ratio;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  return {
    min: Number(quantile(0).toFixed(2)),
    p25: Number(quantile(0.25).toFixed(2)),
    median: Number(quantile(0.5).toFixed(2)),
    p75: Number(quantile(0.75).toFixed(2)),
    max: Number(quantile(1).toFixed(2)),
  };
};

const featureDistribution = Object.fromEntries(
  ['elbow', 'shoulder', 'hip', 'knee'].map((feature) => [
    feature,
    numericSummary(playerRows.map((row) => row.metrics[feature])),
  ]),
);

console.log(JSON.stringify({
  sourceCommit: '27eada5',
  playerProfiles: playerRows,
  playerProfileCount: playerRows.length,
  candidateCount: candidateEntries.length,
  candidateByPlayer: candidateSummary,
  featureDistribution,
  canonicalValidations,
  dataQualityTopLevel: Object.keys(dataQuality ?? {}),
}, null, 2));
