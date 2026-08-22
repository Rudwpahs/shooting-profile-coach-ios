require 'json'

Pod::Spec.new do |s|
  s.name = 'FormpathPose'
  s.version = '1.0.0'
  s.summary = 'Private on-device MediaPipe pose extraction for FormPath.'
  s.description = 'Extracts pose landmarks from a user-selected local video.'
  s.license = { :type => 'MIT' }
  s.author = 'FormPath'
  s.homepage = 'https://github.com/Rudwpahs/shooting-form-analysis'
  s.platforms = { :ios => '15.0' }
  s.source = { :git => 'https://github.com/Rudwpahs/shooting-form-analysis.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  # 0.10.21 is pinned deliberately. Newer CocoaPods releases require an explicit
  # macOS/Xcode integration check before this native bridge is upgraded.
  s.dependency 'MediaPipeTasksVision', '= 0.10.21'
  s.source_files = 'ios/**/*.{swift,h,m,mm}'
  s.resource_bundles = { 'FormpathPose' => ['ios/Resources/*.task'] }
  s.swift_version = '5.9'
end
