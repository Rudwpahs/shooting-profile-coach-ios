# FormPath Basketball — Product UI Refresh

## Design direction

FormPath Basketball will move from a scattered card feed to a **court-side analysis console**. The new visual language is decisive, calm, and sport-specific: a warm off-white court canvas, deep navy film panels, a single orange action signal, and small mint verification states. The interface keeps the existing verified-data boundaries but reduces their visual weight; users first see the action to take, then the evidence level only where it matters.

The experience is designed for a **390 × 844 iPhone portrait viewport** and one-handed use. Primary actions sit in the lower half of each card, bottom navigation remains reachable above the home indicator, and compact labels accompany icons so the three destinations remain clear without relying on color alone.

## Screen architecture

| Destination | New role | Primary content | Main action |
| --- | --- | --- | --- |
| **홈** | Daily practice command center | A short focus card, current goal, motion library status, and recent personal state | `모션 보기` |
| **모션** | Focused film room | A compact source selector, one active motion viewer, phase timeline, and expandable evidence card | `단계 비교` |
| **프로필** | Private training vault | Identity, goals, saved analyses, and account state | `내 분석 저장` |

The Library and assessment routes retain their existing navigation paths but adopt the same core tokens whenever they are edited later. The public product UI will never render raw intermediate source assets as primary content; only a final analysis card and its concise boundary appear in the normal flow.

## Visual system

| Token | Value | Use |
| --- | --- | --- |
| Court | `#F5F1E8` | Main canvas and warm background |
| Ink | `#102235` | Headings, court lines, strong outlines |
| Film | `#0B1623` | Motion stage, hero panels, bottom dock contrast |
| Signal | `#F97316` | Shooting hand, primary CTA, active phase |
| Verify | `#1D9B77` | Approved and private state |
| Cloud | `#E7EDF1` | Quiet fills and dividers |
| Muted | `#667789` | Supporting copy |

Use Barlow Condensed for display hierarchy and Barlow for reading text. Square-to-soft geometry communicates a performance tool rather than a social feed: cards use 18–22pt radii, while key controls use 14–16pt radii. Shadows are sparse and directional; no decorative blurred circles or repeated glass panels should compete with motion content.

## Layout rules

The top header has a small route label, a large screen name, and one utility action. The Home hero is a dark film-strip card with a large goal title, a concise drill, and a single orange CTA. Supporting content appears as two-column metric tiles and a compact verified-motion row.

Motion Studio starts with a source/analysis selector that behaves as a segmented control. Only the selected final analysis viewer is expanded. The viewer sits on a dark stage with an orange shooting arm, a clear head cue, and a lower phase rail. Evidence, auto-correction, and form-match notes become compact disclosure-style rows below the stage. The approved optical motion stays visibly separate as a verified reference, not a competing card pile.

Profile starts with a dark identity panel and a simple three-metric strip. Private poses are represented by a short list with explicit empty and locked states. Authentication remains fully functional, but its form is visually secondary until the user requests account access.

## Interaction and feedback

All tappable cards use 0.98 scale and opacity feedback. Primary actions use the orange signal; secondary actions use an outlined Ink treatment. Source selectors and phase controls use immediate state changes rather than animated page jumps. The floating dock has three labeled targets: `홈`, `모션`, and `프로필`; the active target sits on an orange capsule and uses a short haptic response on native devices.

## Data boundary in the refreshed UI

Every estimate continues to display `분석용 추정` and `추천 제외` in compact metadata. Approved optical motion displays `검증된 실제 3D`. The labels are concise, visible, and never hidden behind an interaction. No aesthetic treatment may make an analysis estimate look more verified than the approved optical reference.
