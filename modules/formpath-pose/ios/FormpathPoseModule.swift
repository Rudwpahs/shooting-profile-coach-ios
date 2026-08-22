import AVFoundation
import ExpoModulesCore
import MediaPipeTasksVision
import UIKit

private struct AnalyzeClipRequestRecord: Record {
  @Field(.required) var uri: String
  @Field(.required) var requestId: String
  @Field(.required) var view: String
  @Field(.required) var shootingHand: String
  @Field(.required) var takeIndex: Int
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

  static func + (lhs: DetectionCounters, rhs: DetectionCounters) -> DetectionCounters {
    DetectionCounters(
      attemptedFrames: lhs.attemptedFrames + rhs.attemptedFrames,
      decodedFrames: lhs.decodedFrames + rhs.decodedFrames,
      detectedFrames: lhs.detectedFrames + rhs.detectedFrames
    )
  }
}

private struct DetectedPoseFrame {
  let timestampMs: Int
  let landmarks: [[String: Any]]
  let imageWidth: Int
  let imageHeight: Int

  var dictionary: [String: Any] {
    [
      "timestampMs": timestampMs,
      // z below is MediaPipe image-relative z. It is raw local detector data,
      // never reconstructed/metric depth and never uploaded by this bridge.
      "sourceLandmarks": landmarks,
      "cropRectPx": [
        "x": 0.0,
        "y": 0.0,
        "width": Double(imageWidth),
        "height": Double(imageHeight),
      ],
      "modelToSourcePx": [
        Double(imageWidth), 0.0, 0.0,
        0.0, Double(imageHeight), 0.0,
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

public class FormpathPoseModule: Module {
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

    AsyncFunction("analyzeClipAsync") { (request: AnalyzeClipRequestRecord) async throws -> [String: Any] in
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

  private func analyzeClip(_ request: AnalyzeClipRequestRecord) async throws -> [String: Any] {
    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "metadata", completed: 0, total: 1)

    let url = try localFileURL(request.uri)
    let asset = AVURLAsset(url: url)
    let metadata = try await loadMetadata(asset)

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "metadata", completed: 1, total: 1)

    let generator = makeImageGenerator(asset: asset)
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
    let coarse = try await detectFrames(
      requestedTimestamps: coarseTimestamps,
      generator: generator,
      landmarker: makeLandmarker(),
      requestId: request.requestId,
      excludedActualTimestampMs: [],
      progressStage: "coarse_pose"
    )

    let proposedDenseTimestamps = PoseSamplingPolicy.denseTimestamps(
      durationSeconds: metadata.durationSeconds,
      coarseMotion: coarse.motionSamples
    )
    let mergedTimestamps = PoseSamplingPolicy.mergedTimestamps([
      coarseTimestamps,
      proposedDenseTimestamps,
    ])
    let coarseKeys = Set(coarseTimestamps.map(PoseSamplingPolicy.canonicalKey))
    let denseTimestamps = mergedTimestamps.filter {
      !coarseKeys.contains(PoseSamplingPolicy.canonicalKey($0))
    }

    try await ensureNotCancelled(request.requestId)
    sendProgress(
      request.requestId,
      stage: "dense_pose",
      completed: 0,
      total: denseTimestamps.count
    )
    let dense = try await detectFrames(
      requestedTimestamps: denseTimestamps,
      generator: generator,
      landmarker: makeLandmarker(),
      requestId: request.requestId,
      excludedActualTimestampMs: Set(coarse.frames.map(\.timestampMs)),
      progressStage: "dense_pose"
    )

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "quality", completed: 0, total: 1)

    let counters = coarse.counters + dense.counters
    let frames = (coarse.frames + dense.frames).sorted { lhs, rhs in
      lhs.timestampMs < rhs.timestampMs
    }
    let qualityReasons = qualityReasons(for: counters)
    let rejectedFrames = counters.attemptedFrames - counters.detectedFrames
    let output: [String: Any] = [
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
        "attemptedFrames": counters.attemptedFrames,
        "decodedFrames": counters.decodedFrames,
        "detectedFrames": counters.detectedFrames,
        "rejectedFrames": counters.attemptedFrames - counters.detectedFrames,
      ],
      "frames": frames.map(\.dictionary),
      "transformConvention": "upright_source_top_left_v1",
      "quality": [
        "passed": qualityReasons.isEmpty,
        "reasons": qualityReasons,
      ],
    ]
    precondition(rejectedFrames >= 0)

    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "quality", completed: 1, total: 1)
    try await ensureNotCancelled(request.requestId)
    sendProgress(request.requestId, stage: "complete", completed: 1, total: 1)
    return output
  }

  private func detectFrames(
    requestedTimestamps: [CMTime],
    generator: AVAssetImageGenerator,
    landmarker: PoseLandmarker,
    requestId: String,
    excludedActualTimestampMs: Set<Int>,
    progressStage: String
  ) async throws -> DetectionPassResult {
    var counters = DetectionCounters()
    var frames: [DetectedPoseFrame] = []
    var motionSamples: [PoseMotionSample] = []
    var seenActualTimestampMs = excludedActualTimestampMs
    var previousTrackedPoints: [(Double, Double)]?

    for (index, requestedTime) in requestedTimestamps.enumerated() {
      try await ensureNotCancelled(requestId)
      counters.attemptedFrames += 1
      var actualTime = CMTime.invalid
      let image: CGImage
      let mpImage: MPImage
      do {
        image = try generator.copyCGImage(at: requestedTime, actualTime: &actualTime)
        mpImage = try MPImage(uiImage: UIImage(cgImage: image))
      } catch {
        sendProgress(requestId, stage: progressStage, completed: index + 1, total: requestedTimestamps.count)
        continue
      }
      counters.decodedFrames += 1

      let actualSeconds = CMTimeGetSeconds(actualTime)
      guard actualSeconds.isFinite, actualSeconds >= 0 else {
        sendProgress(requestId, stage: progressStage, completed: index + 1, total: requestedTimestamps.count)
        continue
      }
      let actualTimestampMs = Int((actualSeconds * 1_000).rounded())
      guard seenActualTimestampMs.insert(actualTimestampMs).inserted else {
        sendProgress(requestId, stage: progressStage, completed: index + 1, total: requestedTimestamps.count)
        continue
      }

      do {
        let result = try landmarker.detect(
          videoFrame: mpImage,
          timestampInMilliseconds: actualTimestampMs
        )
        guard let pose = result.landmarks.first, pose.count == 33 else {
          sendProgress(requestId, stage: progressStage, completed: index + 1, total: requestedTimestamps.count)
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
        counters.detectedFrames += 1
        frames.append(DetectedPoseFrame(
          timestampMs: actualTimestampMs,
          landmarks: landmarks,
          imageWidth: image.width,
          imageHeight: image.height
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
        // Pose failures remain rejected attempts; no media or landmark data is logged.
      }

      sendProgress(requestId, stage: progressStage, completed: index + 1, total: requestedTimestamps.count)
    }

    return DetectionPassResult(frames: frames, counters: counters, motionSamples: motionSamples)
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

  private func validate(_ request: AnalyzeClipRequestRecord) throws {
    let requestIdCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
    guard
      (8...128).contains(request.requestId.count),
      request.requestId.unicodeScalars.allSatisfy(requestIdCharacters.contains),
      request.view == "front" || request.view == "shooting_side",
      request.shootingHand == "left" || request.shootingHand == "right",
      (0...2).contains(request.takeIndex)
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

  private func qualityReasons(for counters: DetectionCounters) -> [String] {
    var reasons: [String] = []
    if counters.detectedFrames < 8 {
      reasons.append("too_few_detected_frames")
    }
    let detectionRatio = counters.attemptedFrames == 0
      ? 0
      : Double(counters.detectedFrames) / Double(counters.attemptedFrames)
    if detectionRatio < 0.6 {
      reasons.append("low_detection_ratio")
    }
    return reasons
  }
}

private func bridgeException(_ code: String) -> Exception {
  Exception(name: "FormpathPoseException", description: code, code: code)
}
