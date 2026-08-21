export type SelectedVideoMetadata = { uri: string; type?: string | null; duration?: number | null; mimeType?: string | null };

/** Validates only device-provided metadata before a private on-device pose detector receives a URI. */
export function validateSelectedShootingVideo(asset: SelectedVideoMetadata): string | null {
  if (!asset.uri.trim()) return "선택한 영상의 기기 경로를 찾지 못했습니다. 다시 선택하세요.";
  if (asset.type && asset.type !== "video") return "사진이 아닌 2–20초 슈팅 영상을 선택하세요.";
  if (asset.mimeType && !asset.mimeType.startsWith("video/")) return "지원하지 않는 파일 형식입니다. 영상 파일을 선택하세요.";
  if (asset.duration !== null && asset.duration !== undefined && asset.duration < 2_000) return "2초 이상으로 준비부터 팔로우스루까지 보이는 영상을 선택하세요.";
  if (asset.duration !== null && asset.duration !== undefined && asset.duration > 20_000) return "20초 이하의 측면 전신 슈팅 영상을 선택하세요.";
  return null;
}
