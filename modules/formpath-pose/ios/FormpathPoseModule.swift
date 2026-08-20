import ExpoModulesCore
import AVFoundation
import MediaPipeTasksVision
import UIKit

public class FormpathPoseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FormpathPose")

    AsyncFunction("analyzeVideoAsync") { (uri: String, sampleCount: Int) async throws -> [String: Any] in
      let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
      let asset = AVAsset(url: url)
      let duration = CMTimeGetSeconds(asset.duration)
      guard duration.isFinite, duration > 0 else {
        throw PoseBridgeError.invalidVideo
      }
      guard let modelPath = Bundle.module.path(forResource: "pose_landmarker_full", ofType: "task") else {
        throw PoseBridgeError.modelMissing
      }

      let options = PoseLandmarkerOptions()
      options.runningMode = .video
      options.numPoses = 1
      options.minPoseDetectionConfidence = 0.55
      options.minPosePresenceConfidence = 0.55
      options.minTrackingConfidence = 0.50
      options.baseOptions.modelAssetPath = modelPath
      let landmarker = try PoseLandmarker(options: options)

      let generator = AVAssetImageGenerator(asset: asset)
      generator.appliesPreferredTrackTransform = true
      generator.requestedTimeToleranceBefore = CMTime(value: 1, timescale: 25)
      generator.requestedTimeToleranceAfter = CMTime(value: 1, timescale: 25)
      let count = min(max(sampleCount, 8), 48)
      var frames: [[String: Any]] = []

      for index in 0..<count {
        let seconds = duration * Double(index) / Double(max(count - 1, 1))
        let timestampMs = Int((seconds * 1000).rounded())
        let time = CMTime(value: Int64(timestampMs), timescale: 1000)
        guard let image = try? generator.copyCGImage(at: time, actualTime: nil), let mpImage = try? MPImage(uiImage: UIImage(cgImage: image)) else { continue }
        guard let result = try? landmarker.detect(videoFrame: mpImage, timestampInMilliseconds: timestampMs), let pose = result.landmarks.first, pose.count == 33 else { continue }
        let landmarks: [[String: Any]] = pose.map { point in
          ["x": point.x, "y": point.y, "z": point.z, "visibility": point.visibility ?? 1]
        }
        frames.append(["timestampMs": timestampMs, "landmarks": landmarks])
      }
      return ["frames": frames, "sampledFrames": count]
    }
  }
}

private enum PoseBridgeError: Error, LocalizedError {
  case invalidVideo
  case modelMissing

  var errorDescription: String? {
    switch self {
    case .invalidVideo: return "The selected video could not be read."
    case .modelMissing: return "The bundled MediaPipe pose model is missing."
    }
  }
}
