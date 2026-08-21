# Anthropometric Display Template

## Purpose and boundary

The template gives the viewer a coherent **generic adult silhouette** when a video-derived skeleton has implausible limb proportions. It roots every phase at the pelvis, takes the median observed bi-acromial shoulder breadth as its scale, and assigns all other links fixed relative lengths. The parent-to-child direction in every source phase is retained exactly, so elbow, knee, trunk, release, and follow-through geometry remain source-derived.

> This is **not** a measurement of the player or the user. Single-view landmarks do not establish measured stature, body proportions, or calibrated depth; the output remains analysis-only and excluded from recommendations.

## Target link lengths

| Link group | Ratio to observed shoulder breadth | Rationale |
| --- | ---: | --- |
| Pelvis–spine / spine–neck / neck–head | 0.54 / 0.56 / 0.58 | Produces a readable head-and-trunk chain around joint centres. |
| Neck–shoulder | 0.50 per side | The two links span one shoulder breadth. |
| Upper arm / forearm | 0.86 / 0.88 | Keeps the two arm segments near comparable adult anatomical lengths. |
| Pelvis–hip / thigh / shank | 0.44 / 1.10 / 0.96 | Preserves a longer upper-leg than lower-leg silhouette. |

The template follows joint-centre segmentation conventions used in biomechanical anthropometry, while deliberately avoiding person-specific numerical claims. de Leva provides joint-centre-referenced segment definitions and estimates; later work shows that individual body segment parameters vary with individual anthropometric measures, reinforcing that this app’s template must remain generic. [1] [2]

## Correction record

Each corrected player asset records `templateId`, `scaleBasis`, `targetBoneLengths`, before/after length spread, and `source_joint_directions_and_phase_order_preserved`. Each private upload stores the same template ID and per-upload target lengths alongside its five original phase timestamps.

## References

[1] [Paolo de Leva, *Adjustments to Zatsiorsky-Seluyanov’s segment inertia parameters*](https://doi.org/10.1016/0021-9290(95)00178-6)

[2] [Merrill, Perera & Cham, *Predictive Regression Modeling of Body Segment Parameters using Individual-Based Anthropometric Measurements*](https://pmc.ncbi.nlm.nih.gov/articles/PMC6905426/)
