# License and provenance risk — InstagramUI reference

Source snapshot: `bhavnishkumar/InstagramUI@b64437a0b1757c5ead6b08e9c1eb00e870e88b41`  
Verified: 2026-09-19 KST

This is an engineering provenance note, not legal advice.

## Finding

Treat this repository as **reference-only and clean-room-patterns-only** for Hoop Hub.

Why:

1. The complete recursive Git tree for the inspected snapshot contains no root or nested file named `LICENSE`, `LICENSE.md`, `COPYING`, or an equivalent explicit project-wide license grant.
2. `InstagramUI/MVVM/View/PostCell.swift` contains a separate authorship/copyright header:
   - created by Stephen Dowless on 2020-02-27;
   - `Copyright © 2020 Stephan Dowless. All rights reserved.`
3. The repository README credits Bhavnish Kumar (2022), but a credit line is not an explicit license grant.
4. The asset tree includes Instagram/Meta logos, social icons, portraits/highlights, and assorted post imagery whose provenance and reuse rights were not established during this extraction.
5. Public availability on GitHub does not by itself establish permission to copy source expression or assets into Hoop Hub.

## Mandatory clean-room policy

For all future work derived from this archive:

- **Do not copy upstream Swift code** into production, translated or otherwise.
- **Do not copy upstream image/icon/logo assets**.
- **Do not use Instagram/Meta branding or wordmarks**.
- **Do not reproduce exact clone-specific strings, decorative composition, or exact constants merely for fidelity**.
- Re-express useful ideas in Hoop Hub's existing React Native architecture, components, design tokens, accessibility rules, and data/privacy contracts.
- Prefer current Hoop Hub components whenever the extracted idea is already represented there.
- Keep source/provenance references in this research folder when a design decision was informed by the upstream source.

## Reuse classification

### Green — safe reference at an abstract level

These are generic product/interaction ideas that can be independently implemented:

- feed information hierarchy: context → media → actions → caption;
- horizontal highlight/category rail;
- asymmetric mosaic grammar;
- profile hierarchy: identity → stats → actions/context → content grid;
- persistent bottom navigation as a general mobile pattern;
- centralized light/dark theme concept;
- transient feedback after non-critical actions.

Use only the idea. Implement independently.

### Yellow — independently redesign, do not trace line-for-line

- layout proportions such as one tall tile beside four squares;
- action placement and card anatomy;
- grid switching rules;
- follow/edit/profile action grouping;
- feedback banner behavior.

These are common UI patterns but should be expressed through Hoop Hub's own component structure, spacing, naming, state model, and visual language.

### Red — do not reuse without a separate rights determination

- `PostCell.swift` source or a translation of it;
- any Swift source copied verbatim or closely transformed;
- Instagram/Meta logos and brand assets;
- upstream avatar, highlight, post, and screenshot image files;
- exact clone branding/trade dress;
- third-party code or assets whose separate license cannot be established.

## Specific high-risk file

`InstagramUI/MVVM/View/PostCell.swift`  
SHA: `12f3e6013126c2f339999476e15132844a025032`

The file header explicitly says `All rights reserved` and names a different author from the repository owner. This is sufficient reason to prohibit direct code reuse in Hoop Hub under the current evidence record.

## Dependency note

The project pins `SDWebImage 5.13.2` and `SDWebImageSwiftUI 2.0.2`. Their presence does not imply the surrounding repository source is licensed under the dependencies' licenses. Hoop Hub also does not need these Swift dependencies for its React Native implementation.

## Asset note

The tree contains assets with names such as Instagram logos, Meta gradient logos, avatar/people images, social action icons, and demo post images. No binary asset was adopted into Hoop Hub during this extraction. Continue that rule.

## When direct reuse may be reconsidered

Only reconsider source-level reuse if future work obtains and records:

1. an explicit license or permission covering the exact repository/file revision;
2. confirmation that third-party file headers are compatible with that permission;
3. asset-specific provenance for any image/icon to be reused;
4. compatibility with Hoop Hub's own distribution model.

Until then, this archive is a **design-reference record, not a code/vendor dependency**.