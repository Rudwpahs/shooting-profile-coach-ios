import CoreMedia
import Foundation

struct PoseMotionSample {
  let timestampMs: Int
  let wristElbowMotion: Double
}

enum PoseSamplingPolicy {
  static let coarseFramesPerSecond = 15.0
  static let denseFramesPerSecond = 30.0
  static let maximumDenseWindowSeconds = 1.0
  private static let canonicalTimescale: CMTimeScale = 60_000

  static func coarseTimestamps(durationSeconds: Double) -> [CMTime] {
    timestamps(
      framesPerSecond: coarseFramesPerSecond,
      startSeconds: 0,
      endSeconds: durationSeconds,
      durationSeconds: durationSeconds
    )
  }

  static func denseTimestamps(
    durationSeconds: Double,
    coarseMotion: [PoseMotionSample]
  ) -> [CMTime] {
    guard durationSeconds > 0, let strongest = coarseMotion.max(by: motionOrder) else {
      return []
    }
    let windowDuration = min(maximumDenseWindowSeconds, durationSeconds)
    let centerSeconds = Double(strongest.timestampMs) / 1_000
    let startSeconds = min(
      max(0, centerSeconds - windowDuration / 2),
      max(0, durationSeconds - windowDuration)
    )
    return timestamps(
      framesPerSecond: denseFramesPerSecond,
      startSeconds: startSeconds,
      endSeconds: startSeconds + windowDuration,
      durationSeconds: durationSeconds
    )
  }

  static func mergedTimestamps(_ groups: [[CMTime]]) -> [CMTime] {
    var unique: [Int64: CMTime] = [:]
    for time in groups.flatMap({ $0 }) {
      let canonical = CMTimeConvertScale(time, timescale: canonicalTimescale, method: .roundHalfAwayFromZero)
      unique[canonical.value] = canonical
    }
    return unique.keys.sorted().compactMap { unique[$0] }
  }

  static func canonicalKey(_ time: CMTime) -> Int64 {
    CMTimeConvertScale(time, timescale: canonicalTimescale, method: .roundHalfAwayFromZero).value
  }

  private static func timestamps(
    framesPerSecond: Double,
    startSeconds: Double,
    endSeconds: Double,
    durationSeconds: Double
  ) -> [CMTime] {
    guard
      framesPerSecond > 0,
      startSeconds.isFinite,
      endSeconds.isFinite,
      durationSeconds.isFinite,
      durationSeconds > 0,
      startSeconds < endSeconds
    else {
      return []
    }
    let firstIndex = max(0, Int(ceil(startSeconds * framesPerSecond)))
    let lastExclusive = max(firstIndex, Int(ceil(min(endSeconds, durationSeconds) * framesPerSecond)))
    return (firstIndex..<lastExclusive).compactMap { index in
      let seconds = Double(index) / framesPerSecond
      guard seconds >= startSeconds, seconds < endSeconds, seconds < durationSeconds else {
        return nil
      }
      return CMTime(seconds: seconds, preferredTimescale: canonicalTimescale)
    }
  }

  private static func motionOrder(_ lhs: PoseMotionSample, _ rhs: PoseMotionSample) -> Bool {
    if lhs.wristElbowMotion == rhs.wristElbowMotion {
      return lhs.timestampMs > rhs.timestampMs
    }
    return lhs.wristElbowMotion < rhs.wristElbowMotion
  }
}
