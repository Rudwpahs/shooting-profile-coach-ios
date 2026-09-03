# P1.1 derived report file sharing design

Status: approved corrective design for open PR #4.

## Problem

The development-only evaluation panel promises that the owner can save a derived
`TwoViewEvaluationReportV1` as JSON. The current implementation passes the JSON in
React Native Share's `message` field. That opens a text share sheet; it does not
create a `.json` file and therefore does not reliably offer "Save to Files".

The report itself is already strict-schema and rejects raw landmarks, native depth,
frame timestamps, source file names, and source URIs. This correction must preserve
that boundary and must not alter the capture, reconstruction, or Firestore paths.

## Options considered

1. Keep sharing text and change the runbook. Rejected because it prevents the
   physical-iPhone validation workflow from producing the promised JSON artifact.
2. Write a temporary `.json` file and pass its local URL to React Native Share.
   Chosen because iOS supports a URL share item and the existing shared/dismissed
   result remains available.
3. Add Expo Sharing and use `shareAsync`. Rejected for this bounded correction:
   it adds a second sharing dependency and does not expose the existing iOS
   dismissed-versus-shared outcome.

## Design

- Add the Expo SDK 54-compatible `expo-file-system` dependency.
- Keep report generation pure. `shareRealVideoEvaluation` receives two injected
  boundaries: one prepares a temporary report file and one opens the share sheet.
- The prepared item contains only a local `.json` URI plus a cleanup function.
- The hook implements the file boundary with Expo FileSystem's cache directory and
  invokes React Native Share with `url`, never `message`.
- A random opaque filename is used. It contains no account, video, take, file, or
  session identifier.
- Cleanup runs after shared, dismissed, and thrown-share outcomes. A cleanup error
  yields `share_failed`; the report remains available in memory for a retry.
- File preparation failure yields `share_failed` and never opens the share sheet.
- The feature stays behind the exact `"1"` development-build flag. No automatic
  upload, Firestore write, HTTP request, or raw sequence export is added.

## Verification

Behavior tests prove that the share boundary receives a `file://...json` URL, never
the JSON message; that the file contains the exact validated derived JSON; and that
cleanup is attempted for success, dismissal, and error. Existing privacy guards,
unit tests, Firestore Emulator tests, typecheck, lint, and Expo web export remain
required. PR #4 stays open until a Basic 1+1 pair is run on a physical iPhone.
