import Foundation

enum FormpathPoseResources {
  static func poseLandmarkerModelPath() -> String? {
    let containingBundle = Bundle(for: FormpathPoseModule.self)
    guard
      let resourceBundleURL = containingBundle.url(
        forResource: "FormpathPose",
        withExtension: "bundle"
      ),
      let resourceBundle = Bundle(url: resourceBundleURL),
      let modelURL = resourceBundle.url(
        forResource: "pose_landmarker_full",
        withExtension: "task"
      )
    else {
      return nil
    }
    return modelURL.path
  }
}
