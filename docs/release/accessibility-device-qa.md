# Accessibility device QA — release blocker

Automated source tests are necessary but do not replace physical-device QA. Record exact device / iOS / app version / build / git SHA before checking any box.

Device ___  iOS ___  version/build ___  git SHA ___  tester/date ___

- [ ] VoiceOver: logical reading order on Home, Explore, Capture, Analysis, Profile, signup/legal controls, and account deletion.
- [ ] VoiceOver: labels/roles/states/actions are meaningful; destructive confirmation and errors are announced.
- [ ] External keyboard / Full Keyboard Access: every interactive control receives visible focus in usable order; no keyboard trap.
- [ ] Dynamic Type / text scaling: largest supported text sizes remain readable with no hidden legal/delete action.
- [ ] Compact-screen reflow: signup consent, legal links, profile lists, and deletion controls remain reachable.
- [ ] Reduce Motion: animation-heavy surfaces honor the existing reduced-motion paths without losing content.
- [ ] Contrast under real overlays/video: text, focus, destructive and status controls remain distinguishable.
- [ ] Legal links are reachable before signup and from the account/legal surface.
- [ ] Account deletion can be completed with assistive technology and requires the current password + one final destructive confirmation.

Until these checks are performed on a release build, `voiceover_qa`, `keyboard_qa`, and `text_scaling_qa` remain blockers.
