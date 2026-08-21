# Non-expansion TODO closeout scope

## Request boundary

This closeout pass implements unfinished work that improves the existing FormPath product without adding another player model, another approved motion, another source sequence, or another player-specific reconstruction. Existing approved CMU optical motion and the two analysis-only player motions remain the fixed model set.

| Existing TODO groups | Treatment in this pass | Reason |
| --- | --- | --- |
| 18, 42, 47, 48, 69, 71 | Implement verification contracts, tests, user-facing readiness messaging, and a device QA runbook | These improve reliability without changing model count. |
| 56, 57, 75 | Consolidate existing source/license findings into an admission matrix; do not collect or admit new inputs | Research documentation is permitted, new source intake is not. |
| 54–55, 58, 64, 76–78, 95–96, 101, 124–126, 130, 135, 147–149 | Explicitly deferred | Each would create, seek, promote, or expand a model/source candidate. |
| 17 | Complete after this pass’s automated validation and checkpoint | This is the delivery closeout item. |

## Completion standard for feasible items

The app must reject unavailable native pose detection with an actionable device-build message, accept a native bridge result only through the existing quality/correction/storage contract, preserve the analysis-only boundary through Firestore record lifecycle operations, and retain the two-player/one-optical-motion library boundary. Tests must cover these cases, and both iPhone custom-build prerequisites and web export must be documented.

## External-device limitation

An actual iPhone custom development build, a physical user video, Firebase credentials, and a native MediaPipe implementation are required to execute the final hardware-only acceptance test. The repository can provide the bridge interface, validation, error handling, and test doubles, but must not claim that this environment ran a real on-device detector.
