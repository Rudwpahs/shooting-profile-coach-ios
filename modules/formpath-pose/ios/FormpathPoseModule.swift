import AVFoundation
import ExpoModulesCore
import MediaPipeTasksVision
import UIKit

private struct AnalyzeClipRequest {
  let uri: String
  let requestId: String
  let view: String
  let shootingHand: String
  let takeIndex: Int
  let profile: String
}

private enum PoseAnalysisBeginResult {
  case started
  case duplicate
  case cancelled
}

private actor PoseAnalysisCancellationRegistry {
  private static let maximumCancellationTombstones = 256
  private var activeRequestIds = Set<String>()
  private var cancelledRequestIds = Set<String>()
  private var preBeginCancellationTombstones = Set<String>()
  private var preBeginCancellationOrder: [String] = []

  func begin(_ requestId: String) -> PoseAnalysisBeginResult {
    if activeRequestIds.contains(requestId) {
      return .duplicate
    }
    if preBeginCancellationTombstones.contains(requestId) {
      return .cancelled
    }
    activeRequestIds.insert(requestId)
    return .started
  }

  func cancel(_ requestId: String) {
    if activeRequestIds.contains(requestId) {
      cancelledRequestIds.insert(requestId)
      return
    }
    guard preBeginCancellationTombstones.insert(requestId).inserted else {
      return
    }
    preBeginCancellationOrder.append(requestId)
    let overflow = preBeginCancellationOrder.count - Self.maximumCancellationTombstones
    if overflow > 0 {
      let evicted = preBeginCancellationOrder.prefix(overflow)
      preBeginCancellationTombstones.subtract(evicted)
      preBeginCancellationOrder.removeFirst(overflow)
    }
  }

  func isCancelled(_ requestId: String) -> Bool {
    cancelledRequestIds.contains(requestId)
  }

  func finish(_ requestId: String) {
    activeRequestIds.remove(requestId)
    cancelledRequestIds.remove(requestId)
  }
}

private struct ClipMetadata {
  let durationSeconds: Double
  let durationMs: Int
  let displayWidth: Int
  let displayHeight: Int
  let nominalFrameRate: Double
  let frameRateMode: String
}

private struct DetectionCounters {
  var attemptedFrames = 0
  var decodedFrames = 0
  var detectedFrames = 0

}

private struct PoseLandmarkObservation {
  let x: Double
  let y: Double
  let z: Double
  let visibility: Double

  var dictionary: [String: Any] {
    ["x": x, "y": y, "z": z, "visibility": visibility]
  }
}

private struct DetectedPoseFrame {
  let timestampMs: Int
  let landmarks: [PoseLandmarkObservation]
  let cropRectPx: CGRect

  var dictionary: [String: Any] {
    let x = Int(cropRectPx.origin.x)
    let y = Int(cropRectPx.origin.y)
    let width = Int(cropRectPx.width)
    let height = Int(cropRectPx.height)
    return [
      "timestampMs": timestampMs,
      // z below is MediaPipe image-relative z. It is raw local detector data,
      // never reconstructed/metric depth and never uploaded by this bridge.
      "modelLandmarks": landmarks.map(\.dictionary),
      "cropRectPx": [
        "x": x,
        "y": y,
        "width": width,
        "height": height,
      ],
      "modelToSourcePx": [
        Double(width), 0.0, Double(x),
        0.0, Double(height), Double(y),
        0.0, 0.0, 1.0,
      ],
    ]
  }
}

private struct DetectionPassResult {
  let frames: [DetectedPoseFrame]
  let counters: DetectionCounters
  let motionSamples: [PoseMotionSample]
}

private struct LocatorVisiblePoint {
  let xPx: Double
  let yPx: Double
}

private struct LocatorFrameBodyEvidence {
  let centerXpx: Double
  let centerYpx: Double
  let bodyScalePx: Double
  let visiblePoints: [LocatorVisiblePoint]
}

private struct OutputAttemptEvidence {
  let requestedTimestampMs: Int
  var decodedTimestampMs: Int?
  var detectedTimestampMs: Int?

  var dictionary: [String: Any] {
    let decodedValue: Any
    if let decodedTimestampMs {
      decodedValue = decodedTimestampMs
    } else {
      decodedValue = NSNull()
    }
    let detectedValue: Any
    if let detectedTimestampMs {
      detectedValue = detectedTimestampMs
    } else {
      detectedValue = NSNull()
    }
    return [
      "requestedTimestampMs": requestedTimestampMs,
      "decodedTimestampMs": decodedValue,
      "detectedTimestampMs": detectedValue,
    ]
  }
}

private struct OutputDetectionPassResult {
  let frames: [DetectedPoseFrame]
  let counters: DetectionCounters
  let attempts: [OutputAttemptEvidence]
}

private enum PoseV2EngineeringDefaults {
  // Engineering defaults only; physical-device and biomechanics validation is pending.
  static let minimumLocatorDetectedFrames = 5
  static let minimumLocatorDetectionRatio = 0.5
  static let minimumLocatorLandmarkVisibility = 0.5
  static let minimumLocatorCriticalLandmarksPerFrame = 10
  static let minimumLocatorBodyScalePixels = 16.0
  static let maximumLocatorCenterDeviationBodyScales = 0.75
  static let minimumLocatorBodyScaleRatio = 0.55
  static let maximumLocatorBodyScaleRatio = 1.80
  static let minimumLocatorInlierRatio = 0.60
  static let maximumLocatorPointDistanceBodyScales = 4.0
  static let personROIPaddingProportion = 0.12
  static let minimumPersonROIDimensionProportion = 0.08
  static let minimumPersonROIDimensionPixels = 32.0
  static let minimumDetectedFrames = 8
  static let minimumFinalDetectionRatio = 0.8
  static let minimumCriticalJointCoverage = 0.85
  static let minimumCriticalJointVisibility = 0.5
  static let maximumReleaseProxyDetectionGapMs = 150
  static let criticalLandmarkIndices = [11, 12, 15, 16, 23, 24, 25, 26, 27, 28]
}

public class FormpathPoseModule: Module {
  private static let analyzeClipRequestKeys: Set<String> = [
    "uri", "requestId", "view", "shootingHand", "takeIndex", "profile",
  ]
  private let cancellationRegistry = PoseAnalysisCancellationRegistry()

  public func definition() -> ModuleDefinition {
    Name("FormpathPose")
    Events("onPoseAnalysisProgress")

    // V1 remains additive and unchanged at its JavaScript boundary.
    AsyncFunction("analyzeVideoAsync") { (uri: String, sampleCount: Int) async throws -> [String: Any] in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      let asset = AVAsset(url: url)
      let duration = CMTimeGetSeconds(asset.duration)
      guard duration.isFinite, duration > 0 else {
        throw bridgeException("invalid_video")
      }
      let landmarker = try self.makeLandmarker()
      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 25)
      generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 25)
      let count = min(max(sampleCount, 8), 48)
      var frames: [[String: Any]] = []

      for index in 0..<count {
        let seconds = duration * Double(index) / Double(max(count - 1, 1))
        let requestedTimestampMs = Int((seconds * 1_000).rounded())
        let requestedTime = CMTime(value: Int64(requestedTimestampMs), timescale: 1_000)
        guard
          let image = try? generator.copyCGImage(at: requestedTime, actualTime: nil),
          let mpImage = try? MPImage(uiImage: UIImage(cgImage: image))
        else {
          continue
        }
        guard
          let result = try? landmarker.detect(
            videoFrame: mpImage,
            timestampInMilliseconds: requestedTimestampMs
          ),
          let pose = result.landmarks.first,
          pose.count == 33
        else {
          continue
        }
        let landmarks: [[String: Any]] = pose.map { point in
          [
            "x": Double(point.x),
            "y": Double(point.y),
            "z": Double(point.z),
            "visibility": point.visibility?.doubleValue ?? 1.0,
          ]
        }
        frames.append(["timestampMs": requestedTimestampMs, "landmarks": landmarks])
      }
      return ["frames": frames, "sampledFrames": count]
    }

    AsyncFunction("analyzeClipAsync") { (request: [String: Any]) async throws -> [String: Any] in
      let request = try self.parseAnalyzeClipRequest(request)
      try self.validate(request)
      switch await self.cancellationRegistry.begin(request.requestId) {
      case .started:
        break
      case .duplicate:
        throw bridgeException("duplicate_request_id")
      case .cancelled:
        throw bridgeException("analysis_cancelled")
      }

      do {
        let output = try await self.analyzeClip(request)
        await self.cancellationRegistry.finish(request.requestId)
        return output
      } catch {
        await self.cancellationRegistry.finish(request.requestId)
        throw error
      }
    }

    AsyncFunction("cancelAnalysisAsync") { (requestId: String) async in
      await self.cancellationRegistry.cancel(requestId)
    }
  }

  private func analyzeClip(_ request: AnalyzeClipRequest) async throws -> [String: Any] {
    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "metadata", completed: 0, total: 1)

    let url = try localFileURL(request.uri)
    let asset = AVURLAsset(url: url)
    let metadata = try await loadMetadata(asset)

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "metadata", completed: 1, total: 1)

    let coarseTimestamps = PoseSamplingPolicy.coarseTimestamps(
      durationSeconds: metadata.durationSeconds
    )
    try await ensureNotCancelled(request.requestId)
    sendProgress(
      request.requestId,
      stage: "coarse_pose",
      completed: 0,
      total: coarseTimestamps.count
    )
    let locatorGenerator = makeImageGenerator(asset: asset)
    let locatorLandmarker = try makeLandmarker()
    let locator = try await detectFullFrameLocatorFrames(
      requestedTimestamps: coarseTimestamps,
      generator: locatorGenerator,
      landmarker: locatorLandmarker,
      requestId: request.requestId,
      progressStage: "coarse_pose"
    )
    guard let stableROI = deriveStablePersonROI(
      locator: locator,
      sourceWidth: metadata.displayWidth,
      sourceHeight: metadata.displayHeight
    ) else {
      throw bridgeException("person_roi_unavailable")
    }

    let proposedDenseTimestamps = PoseSamplingPolicy.denseTimestamps(
      durationSeconds: metadata.durationSeconds,
      coarseMotion: locator.motionSamples
    )
    let mergedTimestamps = PoseSamplingPolicy.mergedTimestamps([
      coarseTimestamps,
      proposedDenseTimestamps,
    ])
    guard let releaseProxyTimestampMs = releaseProxyTimestamp(
      locatorMotion: locator.motionSamples,
      durationMs: metadata.durationMs
    ) else {
      throw bridgeException("person_roi_unavailable")
    }

    try await ensureNotCancelled(request.requestId)
    sendProgress(
      request.requestId,
      stage: "dense_pose",
      completed: 0,
      total: mergedTimestamps.count
    )
    let outputGenerator = makeImageGenerator(asset: asset)
    let outputLandmarker = try makeLandmarker()
    let output = try await detectCroppedOutputFrames(
      requestedTimestamps: mergedTimestamps,
      generator: outputGenerator,
      landmarker: outputLandmarker,
      stableROI: stableROI,
      sourceWidth: metadata.displayWidth,
      sourceHeight: metadata.displayHeight,
      requestId: request.requestId,
      progressStage: "dense_pose"
    )
    guard timestampEvidenceIsValid(
      output,
      releaseProxyTimestampMs: releaseProxyTimestampMs,
      durationMs: metadata.durationMs
    ) else {
      throw bridgeException("pose_analysis_failed")
    }

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "quality", completed: 0, total: 1)
    let qualityReasons = qualityReasons(
      for: output,
      releaseProxyTimestampMs: releaseProxyTimestampMs
    )
    let outputPayload: [String: Any] = [
      "version": 2,
      "view": request.view,
      "shootingHand": request.shootingHand,
      "takeIndex": request.takeIndex,
      "metadata": [
        "durationMs": metadata.durationMs,
        "displayWidth": metadata.displayWidth,
        "displayHeight": metadata.displayHeight,
        "nominalFrameRate": metadata.nominalFrameRate,
        "frameRateMode": metadata.frameRateMode,
        "locatorAttemptedFrames": locator.counters.attemptedFrames,
        "locatorDecodedFrames": locator.counters.decodedFrames,
        "locatorDetectedFrames": locator.counters.detectedFrames,
        "attemptedFrames": output.counters.attemptedFrames,
        "decodedFrames": output.counters.decodedFrames,
        "detectedFrames": output.counters.detectedFrames,
        "rejectedFrames": output.counters.attemptedFrames - output.counters.detectedFrames,
        "releaseProxyTimestampMs": releaseProxyTimestampMs,
        "attempts": output.attempts.map(\.dictionary),
      ],
      "frames": output.frames.map(\.dictionary),
      "transformConvention": "cropped_model_to_upright_source_v1",
      "quality": [
        "passed": qualityReasons.isEmpty,
        "reasons": qualityReasons,
      ],
    ]

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "quality", completed: 1, total: 1)
    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "complete", completed: 1, total: 1)
    return outputPayload
  }

  private func detectFullFrameLocatorFrames(
    requestedTimestamps: [CMTime],
    generator: AVAssetImageGenerator,
    landmarker: PoseLandmarker,
    requestId: String,
    progressStage: String
  ) async throws -> DetectionPassResult {
    var counters = DetectionCounters()
    var frames: [DetectedPoseFrame] = []
    var motionSamples: [PoseMotionSample] = []
    var seenActualTimestampMs = Set<Int>()
    var lastSubmittedTimestampMs: Int?
    var previousTrackedPoints: [(Double, Double)]?

    for (index, requestedTime) in requestedTimestamps.enumerated() {
      // Cancellation boundary: locator decode
      try await ensureNotCancelled(requestId)
      counters.attemptedFrames += 1
      locatorAttempt: repeat {
        var actualTime = CMTime.invalid
        let image: CGImage
        let mpImage: MPImage
        do {
          image = try generator.copyCGImage(at: requestedTime, actualTime: &actualTime)
          mpImage = try MPImage(uiImage: UIImage(cgImage: image))
        } catch {
          break locatorAttempt
        }
        counters.decodedFrames += 1

        guard let actualTimestampMs = timestampMilliseconds(actualTime) else {
          break locatorAttempt
        }
        guard seenActualTimestampMs.insert(actualTimestampMs).inserted else {
          break locatorAttempt
        }
        if let lastSubmittedTimestampMs, actualTimestampMs <= lastSubmittedTimestampMs {
          break locatorAttempt
        }

        // Cancellation boundary: locator detect
        try await ensureNotCancelled(requestId)
        do {
          let result = try landmarker.detect(
            videoFrame: mpImage,
            timestampInMilliseconds: actualTimestampMs
          )
          lastSubmittedTimestampMs = actualTimestampMs
          guard let pose = result.landmarks.first, pose.count == 33 else {
            break locatorAttempt
          }
          let landmarks = pose.map { point in
            PoseLandmarkObservation(
              x: Double(point.x),
              y: Double(point.y),
              z: Double(point.z),
              visibility: point.visibility?.doubleValue ?? 0.0
            )
          }
          counters.detectedFrames += 1
          frames.append(DetectedPoseFrame(
            timestampMs: actualTimestampMs,
            landmarks: landmarks,
            cropRectPx: CGRect(
              x: 0,
              y: 0,
              width: CGFloat(image.width),
              height: CGFloat(image.height)
            )
          ))

          let trackedPoints = [13, 14, 15, 16].map { landmarkIndex in
            (Double(pose[landmarkIndex].x), Double(pose[landmarkIndex].y))
          }
          let motion = wristElbowMotion(previous: previousTrackedPoints, current: trackedPoints)
          motionSamples.append(PoseMotionSample(
            timestampMs: actualTimestampMs,
            wristElbowMotion: motion
          ))
          previousTrackedPoints = trackedPoints
        } catch {
          lastSubmittedTimestampMs = actualTimestampMs
          // Locator failures are counted but never returned or logged.
        }
      } while false
      sendProgress(
        requestId,
        stage: progressStage,
        completed: index + 1,
        total: requestedTimestamps.count
      )
    }

    return DetectionPassResult(frames: frames, counters: counters, motionSamples: motionSamples)
  }

  private func detectCroppedOutputFrames(
    requestedTimestamps: [CMTime],
    generator: AVAssetImageGenerator,
    landmarker: PoseLandmarker,
    stableROI: CGRect,
    sourceWidth: Int,
    sourceHeight: Int,
    requestId: String,
    progressStage: String
  ) async throws -> OutputDetectionPassResult {
    var counters = DetectionCounters()
    var frames: [DetectedPoseFrame] = []
    var attempts: [OutputAttemptEvidence] = []
    var seenActualTimestampMs = Set<Int>()
    var lastSubmittedTimestampMs: Int?

    for (index, requestedTime) in requestedTimestamps.enumerated() {
      var attempt = OutputAttemptEvidence(
        requestedTimestampMs: timestampMilliseconds(requestedTime) ?? 0,
        decodedTimestampMs: nil,
        detectedTimestampMs: nil
      )

      // Cancellation boundary: decode
      try await ensureNotCancelled(requestId)
      counters.attemptedFrames += 1
      outputAttempt: repeat {
        var actualTime = CMTime.invalid
        let sourceImage: CGImage
        do {
          sourceImage = try generator.copyCGImage(at: requestedTime, actualTime: &actualTime)
        } catch {
          break outputAttempt
        }
        guard let actualTimestampMs = timestampMilliseconds(actualTime) else {
          break outputAttempt
        }

        // Cancellation boundary: crop
        try await ensureNotCancelled(requestId)
        let sourceBounds = CGRect(
          x: 0,
          y: 0,
          width: CGFloat(sourceWidth),
          height: CGFloat(sourceHeight)
        )
        guard
          sourceImage.width == sourceWidth,
          sourceImage.height == sourceHeight,
          sourceBounds.contains(stableROI),
          let croppedImage = sourceImage.cropping(to: stableROI),
          let mpImage = try? MPImage(uiImage: UIImage(cgImage: croppedImage))
        else {
          break outputAttempt
        }
        counters.decodedFrames += 1
        attempt.decodedTimestampMs = actualTimestampMs
        guard seenActualTimestampMs.insert(actualTimestampMs).inserted else {
          break outputAttempt
        }
        if let lastSubmittedTimestampMs, actualTimestampMs <= lastSubmittedTimestampMs {
          break outputAttempt
        }

        // Cancellation boundary: detect
        try await ensureNotCancelled(requestId)
        do {
          let result = try landmarker.detect(
            videoFrame: mpImage,
            timestampInMilliseconds: actualTimestampMs
          )
          lastSubmittedTimestampMs = actualTimestampMs
          guard let pose = result.landmarks.first, pose.count == 33 else {
            break outputAttempt
          }
          let landmarks = pose.map { point in
            PoseLandmarkObservation(
              x: Double(point.x),
              y: Double(point.y),
              z: Double(point.z),
              visibility: point.visibility?.doubleValue ?? 0.0
            )
          }
          counters.detectedFrames += 1
          attempt.detectedTimestampMs = actualTimestampMs
          frames.append(DetectedPoseFrame(
            timestampMs: actualTimestampMs,
            landmarks: landmarks,
            cropRectPx: stableROI
          ))
        } catch {
          lastSubmittedTimestampMs = actualTimestampMs
          // Output pose failures remain exact rejected attempts; nothing private is logged.
        }
      } while false
      attempts.append(attempt)
      sendProgress(
        requestId,
        stage: progressStage,
        completed: index + 1,
        total: requestedTimestamps.count
      )
    }

    return OutputDetectionPassResult(frames: frames, counters: counters, attempts: attempts)
  }

  private func timestampMilliseconds(_ time: CMTime) -> Int? {
    let seconds = CMTimeGetSeconds(time)
    guard seconds.isFinite, seconds >= 0 else {
      return nil
    }
    return Int((seconds * 1_000).rounded())
  }

  private func timestampEvidenceIsValid(
    _ output: OutputDetectionPassResult,
    releaseProxyTimestampMs: Int,
    durationMs: Int
  ) -> Bool {
    guard
      durationMs > 0,
      releaseProxyTimestampMs >= 0,
      releaseProxyTimestampMs <= durationMs,
      output.attempts.count == output.counters.attemptedFrames,
      output.counters.decodedFrames <= output.counters.attemptedFrames,
      output.counters.detectedFrames <= output.counters.decodedFrames,
      output.frames.count == output.counters.detectedFrames
    else {
      return false
    }

    var decodedCount = 0
    var detectedTimestamps: [Int] = []
    var previousRequestedTimestampMs: Int?
    for attempt in output.attempts {
      guard
        attempt.requestedTimestampMs >= 0,
        attempt.requestedTimestampMs < durationMs,
        previousRequestedTimestampMs == nil
          || attempt.requestedTimestampMs > previousRequestedTimestampMs!
      else {
        return false
      }
      previousRequestedTimestampMs = attempt.requestedTimestampMs

      if let decodedTimestampMs = attempt.decodedTimestampMs {
        guard decodedTimestampMs >= 0, decodedTimestampMs <= durationMs else {
          return false
        }
        decodedCount += 1
      }
      if let detectedTimestampMs = attempt.detectedTimestampMs {
        guard
          detectedTimestampMs >= 0,
          detectedTimestampMs <= durationMs,
          attempt.decodedTimestampMs == detectedTimestampMs
        else {
          return false
        }
        detectedTimestamps.append(detectedTimestampMs)
      }
    }

    guard
      decodedCount == output.counters.decodedFrames,
      detectedTimestamps.count == output.counters.detectedFrames,
      output.frames.map(\.timestampMs) == detectedTimestamps
    else {
      return false
    }
    return zip(detectedTimestamps, detectedTimestamps.dropFirst()).allSatisfy { pair in
      pair.0 < pair.1
    }
  }

  private func releaseProxyTimestamp(
    locatorMotion: [PoseMotionSample],
    durationMs: Int
  ) -> Int? {
    guard
      durationMs > 0,
      let strongest = locatorMotion.sorted(by: { lhs, rhs in
        lhs.wristElbowMotion == rhs.wristElbowMotion
          ? lhs.timestampMs < rhs.timestampMs
          : lhs.wristElbowMotion > rhs.wristElbowMotion
      }).first
    else {
      return nil
    }
    guard strongest.timestampMs >= 0, strongest.timestampMs <= durationMs else {
      return nil
    }
    return strongest.timestampMs
  }

  private func deriveStablePersonROI(
    locator: DetectionPassResult,
    sourceWidth: Int,
    sourceHeight: Int
  ) -> CGRect? {
    guard sourceWidth > 0, sourceHeight > 0 else {
      return nil
    }
    let locatorRatio = locator.counters.attemptedFrames == 0
      ? 0
      : Double(locator.counters.detectedFrames) / Double(locator.counters.attemptedFrames)
    guard
      locator.counters.detectedFrames >= PoseV2EngineeringDefaults.minimumLocatorDetectedFrames,
      locatorRatio >= PoseV2EngineeringDefaults.minimumLocatorDetectionRatio
    else {
      return nil
    }

    let frameEvidence = locator.frames.compactMap { frame in
      locatorFrameBodyEvidence(
        frame: frame,
        sourceWidth: sourceWidth,
        sourceHeight: sourceHeight
      )
    }
    guard frameEvidence.count >= PoseV2EngineeringDefaults.minimumLocatorDetectedFrames else {
      return nil
    }

    let stableCenterX = median(frameEvidence.map(\.centerXpx))
    let stableCenterY = median(frameEvidence.map(\.centerYpx))
    let stableBodyScale = median(frameEvidence.map(\.bodyScalePx))
    guard stableCenterX.isFinite, stableCenterY.isFinite,
          stableBodyScale.isFinite,
          stableBodyScale >= PoseV2EngineeringDefaults.minimumLocatorBodyScalePixels else {
      return nil
    }

    let inliers = frameEvidence.filter { evidence in
      let centerDeviationBodyScales = hypot(
        evidence.centerXpx - stableCenterX,
        evidence.centerYpx - stableCenterY
      ) / stableBodyScale
      let scaleRatio = evidence.bodyScalePx / stableBodyScale
      return centerDeviationBodyScales
          <= PoseV2EngineeringDefaults.maximumLocatorCenterDeviationBodyScales
        && scaleRatio >= PoseV2EngineeringDefaults.minimumLocatorBodyScaleRatio
        && scaleRatio <= PoseV2EngineeringDefaults.maximumLocatorBodyScaleRatio
    }
    let inlierRatio = Double(inliers.count) / Double(frameEvidence.count)
    guard
      inliers.count >= PoseV2EngineeringDefaults.minimumLocatorDetectedFrames,
      inlierRatio >= PoseV2EngineeringDefaults.minimumLocatorInlierRatio
    else {
      return nil
    }

    let inlierBodyBoxes = inliers.compactMap { bodyBox(for: $0.visiblePoints) }
    guard inlierBodyBoxes.count == inliers.count else { return nil }
    var minX = Double.infinity
    var minY = Double.infinity
    var maxX = -Double.infinity
    var maxY = -Double.infinity
    for bodyBox in inlierBodyBoxes {
      minX = min(minX, Double(bodyBox.minX))
      minY = min(minY, Double(bodyBox.minY))
      maxX = max(maxX, Double(bodyBox.maxX))
      maxY = max(maxY, Double(bodyBox.maxY))
    }

    let observedWidth = maxX - minX
    let observedHeight = maxY - minY
    let paddingX = observedWidth * PoseV2EngineeringDefaults.personROIPaddingProportion
    let paddingY = observedHeight * PoseV2EngineeringDefaults.personROIPaddingProportion
    let padded = CGRect(
      x: minX - paddingX,
      y: minY - paddingY,
      width: observedWidth + paddingX * 2,
      height: observedHeight + paddingY * 2
    )
    let clampedToSourceBounds = clampedToSourceBounds(
      padded,
      sourceWidth: sourceWidth,
      sourceHeight: sourceHeight
    ).integral
    let minimumWidth = max(
      PoseV2EngineeringDefaults.minimumPersonROIDimensionPixels,
      Double(sourceWidth) * PoseV2EngineeringDefaults.minimumPersonROIDimensionProportion
    )
    let minimumHeight = max(
      PoseV2EngineeringDefaults.minimumPersonROIDimensionPixels,
      Double(sourceHeight) * PoseV2EngineeringDefaults.minimumPersonROIDimensionProportion
    )
    guard
      Double(clampedToSourceBounds.width) >= minimumWidth,
      Double(clampedToSourceBounds.height) >= minimumHeight
    else {
      return nil
    }
    return clampedToSourceBounds
  }

  private func locatorFrameBodyEvidence(
    frame: DetectedPoseFrame,
    sourceWidth: Int,
    sourceHeight: Int
  ) -> LocatorFrameBodyEvidence? {
    guard
      frame.landmarks.count == 33,
      Int(frame.cropRectPx.width) == sourceWidth,
      Int(frame.cropRectPx.height) == sourceHeight
    else {
      return nil
    }

    func visiblePixelPoint(_ index: Int) -> LocatorVisiblePoint? {
      let point = frame.landmarks[index]
      guard
        point.x.isFinite,
        point.y.isFinite,
        point.visibility >= PoseV2EngineeringDefaults.minimumLocatorLandmarkVisibility
      else {
        return nil
      }
      return LocatorVisiblePoint(
        xPx: min(max(point.x, 0), 1) * Double(sourceWidth),
        yPx: min(max(point.y, 0), 1) * Double(sourceHeight)
      )
    }

    let criticalCount = PoseV2EngineeringDefaults.criticalLandmarkIndices.filter {
      visiblePixelPoint($0) != nil
    }.count
    guard
      criticalCount >= PoseV2EngineeringDefaults.minimumLocatorCriticalLandmarksPerFrame,
      let leftShoulder = visiblePixelPoint(11),
      let rightShoulder = visiblePixelPoint(12),
      let leftHip = visiblePixelPoint(23),
      let rightHip = visiblePixelPoint(24)
    else {
      return nil
    }

    let shoulderCenter = LocatorVisiblePoint(
      xPx: (leftShoulder.xPx + rightShoulder.xPx) / 2,
      yPx: (leftShoulder.yPx + rightShoulder.yPx) / 2
    )
    let pelvisCenter = LocatorVisiblePoint(
      xPx: (leftHip.xPx + rightHip.xPx) / 2,
      yPx: (leftHip.yPx + rightHip.yPx) / 2
    )
    let centerXpx = (shoulderCenter.xPx + pelvisCenter.xPx) / 2
    let centerYpx = (shoulderCenter.yPx + pelvisCenter.yPx) / 2
    let torsoLength = hypot(
      shoulderCenter.xPx - pelvisCenter.xPx,
      shoulderCenter.yPx - pelvisCenter.yPx
    )
    let shoulderWidth = hypot(
      leftShoulder.xPx - rightShoulder.xPx,
      leftShoulder.yPx - rightShoulder.yPx
    )
    let hipWidth = hypot(leftHip.xPx - rightHip.xPx, leftHip.yPx - rightHip.yPx)
    let bodyScalePx = torsoLength + (shoulderWidth + hipWidth) / 2
    guard
      bodyScalePx.isFinite,
      bodyScalePx >= PoseV2EngineeringDefaults.minimumLocatorBodyScalePixels
    else {
      return nil
    }

    let visiblePoints = frame.landmarks.indices.compactMap { index -> LocatorVisiblePoint? in
      guard let point = visiblePixelPoint(index) else { return nil }
      let pointDistanceBodyScales = hypot(point.xPx - centerXpx, point.yPx - centerYpx)
        / bodyScalePx
      guard pointDistanceBodyScales
        <= PoseV2EngineeringDefaults.maximumLocatorPointDistanceBodyScales else {
        return nil
      }
      return point
    }
    guard visiblePoints.count >= PoseV2EngineeringDefaults.minimumLocatorCriticalLandmarksPerFrame else {
      return nil
    }
    return LocatorFrameBodyEvidence(
      centerXpx: centerXpx,
      centerYpx: centerYpx,
      bodyScalePx: bodyScalePx,
      visiblePoints: visiblePoints
    )
  }

  private func bodyBox(for points: [LocatorVisiblePoint]) -> CGRect? {
    guard !points.isEmpty else { return nil }
    let minX = points.map(\.xPx).min() ?? .infinity
    let minY = points.map(\.yPx).min() ?? .infinity
    let maxX = points.map(\.xPx).max() ?? -.infinity
    let maxY = points.map(\.yPx).max() ?? -.infinity
    guard minX.isFinite, minY.isFinite, maxX.isFinite, maxY.isFinite else { return nil }
    return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
  }

  private func median(_ values: [Double]) -> Double {
    let sorted = values.filter(\.isFinite).sorted()
    guard !sorted.isEmpty else { return .nan }
    let middle = sorted.count / 2
    return sorted.count.isMultiple(of: 2)
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle]
  }

  private func clampedToSourceBounds(
    _ rect: CGRect,
    sourceWidth: Int,
    sourceHeight: Int
  ) -> CGRect {
    let sourceBounds = CGRect(
      x: 0,
      y: 0,
      width: CGFloat(sourceWidth),
      height: CGFloat(sourceHeight)
    )
    let intersection = rect.intersection(sourceBounds)
    return intersection.isNull ? .zero : intersection
  }

  private func loadMetadata(_ asset: AVURLAsset) async throws -> ClipMetadata {
    do {
      let duration = try await asset.load(.duration)
      let isPlayable = try await asset.load(.isPlayable)
      let tracks = try await asset.loadTracks(withMediaType: .video)
      guard isPlayable, let track = tracks.first else {
        throw bridgeException("invalid_video")
      }
      let durationSeconds = CMTimeGetSeconds(duration)
      let naturalSize = try await track.load(.naturalSize)
      let preferredTransform = try await track.load(.preferredTransform)
      let nominalFrameRate = Double(try await track.load(.nominalFrameRate))
      let displayRect = CGRect(origin: .zero, size: naturalSize).applying(preferredTransform)
      let displayWidth = Int(abs(displayRect.width).rounded())
      let displayHeight = Int(abs(displayRect.height).rounded())
      guard
        durationSeconds.isFinite,
        durationSeconds > 0,
        displayWidth > 0,
        displayHeight > 0,
        nominalFrameRate.isFinite,
        nominalFrameRate >= 0
      else {
        throw bridgeException("invalid_video")
      }
      return ClipMetadata(
        durationSeconds: durationSeconds,
        durationMs: Int((durationSeconds * 1_000).rounded()),
        displayWidth: displayWidth,
        displayHeight: displayHeight,
        nominalFrameRate: nominalFrameRate,
        // AVAssetTrack.nominalFrameRate alone cannot truthfully distinguish VFR.
        frameRateMode: "unknown"
      )
    } catch let error as Exception {
      throw error
    } catch {
      throw bridgeException("invalid_video")
    }
  }

  private func makeImageGenerator(asset: AVAsset) -> AVAssetImageGenerator {
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero
    return generator
  }

  private func makeLandmarker() throws -> PoseLandmarker {
    guard let modelPath = FormpathPoseResources.poseLandmarkerModelPath() else {
      throw bridgeException("model_missing")
    }
    let options = PoseLandmarkerOptions()
    options.runningMode = .video
    options.numPoses = 1
    options.minPoseDetectionConfidence = 0.55
    options.minPosePresenceConfidence = 0.55
    options.minTrackingConfidence = 0.50
    options.baseOptions.modelAssetPath = modelPath
    return try PoseLandmarker(options: options)
  }

  private func parseAnalyzeClipRequest(_ request: [String: Any]) throws -> AnalyzeClipRequest {
    guard
      Set(request.keys) == Self.analyzeClipRequestKeys,
      let uri = request["uri"] as? String,
      let requestId = request["requestId"] as? String,
      let view = request["view"] as? String,
      let shootingHand = request["shootingHand"] as? String,
      let takeIndex = exactInteger(request["takeIndex"]),
      let profile = request["profile"] as? String
    else {
      throw bridgeException("invalid_request")
    }
    return AnalyzeClipRequest(
      uri: uri,
      requestId: requestId,
      view: view,
      shootingHand: shootingHand,
      takeIndex: takeIndex,
      profile: profile
    )
  }

  private func exactInteger(_ value: Any?) -> Int? {
    guard !(value is Bool) else {
      return nil
    }
    if let integer = value as? Int {
      return integer
    }
    if let double = value as? Double,
       double.isFinite,
       double.rounded() == double,
       double >= Double(Int.min),
       double <= Double(Int.max) {
      return Int(double)
    }
    return nil
  }

  private func validate(_ request: AnalyzeClipRequest) throws {
    let requestIdCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
    guard
      (8...128).contains(request.requestId.count),
      request.requestId.unicodeScalars.allSatisfy(requestIdCharacters.contains),
      request.view == "front" || request.view == "shooting_side",
      request.shootingHand == "left" || request.shootingHand == "right",
      (0...2).contains(request.takeIndex),
      request.profile == "personal_v2"
    else {
      throw bridgeException("invalid_request")
    }
    _ = try localFileURL(request.uri)
  }

  private func localFileURL(_ uri: String) throws -> URL {
    guard
      let url = URL(string: uri),
      url.isFileURL,
      FileManager.default.fileExists(atPath: url.path)
    else {
      throw bridgeException("invalid_video")
    }
    return url
  }

  private func ensureNotCancelled(_ requestId: String) async throws {
    if await cancellationRegistry.isCancelled(requestId) {
      throw bridgeException("analysis_cancelled")
    }
  }

  private func sendProgress(_ requestId: String, stage: String, completed: Int, total: Int) {
    sendEvent("onPoseAnalysisProgress", [
      "requestId": requestId,
      "stage": stage,
      "completed": completed,
      "total": total,
    ])
  }

  private func wristElbowMotion(
    previous: [(Double, Double)]?,
    current: [(Double, Double)]
  ) -> Double {
    guard let previous, previous.count == current.count, !current.isEmpty else {
      return 0
    }
    return zip(previous, current).reduce(0) { sum, pair in
      sum + hypot(pair.1.0 - pair.0.0, pair.1.1 - pair.0.1)
    } / Double(current.count)
  }

  private func qualityReasons(
    for output: OutputDetectionPassResult,
    releaseProxyTimestampMs: Int
  ) -> [String] {
    var reasons: [String] = []
    if output.counters.detectedFrames < PoseV2EngineeringDefaults.minimumDetectedFrames {
      reasons.append("too_few_detected_frames")
    }
    let detectionRatio = output.counters.attemptedFrames == 0
      ? 0
      : Double(output.counters.detectedFrames) / Double(output.counters.attemptedFrames)
    if detectionRatio < PoseV2EngineeringDefaults.minimumFinalDetectionRatio {
      reasons.append("low_detection_ratio")
    }

    let hasLowCriticalCoverage = PoseV2EngineeringDefaults.criticalLandmarkIndices.contains { index in
      guard !output.frames.isEmpty else {
        return true
      }
      let visibleFrames = output.frames.filter { frame in
        let point = frame.landmarks[index]
        return point.visibility >= PoseV2EngineeringDefaults.minimumCriticalJointVisibility
      }.count
      return Double(visibleFrames) / Double(output.frames.count)
        < PoseV2EngineeringDefaults.minimumCriticalJointCoverage
    }
    if hasLowCriticalCoverage {
      reasons.append("low_critical_joint_coverage")
    }

    let detectedTimestamps = output.attempts.compactMap(\.detectedTimestampMs).sorted()
    var detectedBeforeReleaseTimestampMs: Int?
    for detectedTimestampMs in detectedTimestamps where detectedTimestampMs <= releaseProxyTimestampMs {
      detectedBeforeReleaseTimestampMs = detectedTimestampMs
    }
    let detectedAfterReleaseTimestampMs = detectedTimestamps.first { detectedTimestampMs in
      detectedTimestampMs >= releaseProxyTimestampMs
    }
    if let detectedBeforeReleaseTimestampMs, let detectedAfterReleaseTimestampMs {
      if detectedAfterReleaseTimestampMs - detectedBeforeReleaseTimestampMs
        > PoseV2EngineeringDefaults.maximumReleaseProxyDetectionGapMs {
        reasons.append("critical_phase_gap")
      }
    } else {
      reasons.append("critical_phase_gap")
    }
    return reasons
  }
}

private func bridgeException(_ code: String) -> Exception {
  Exception(name: "FormpathPoseException", description: code, code: code)
}
