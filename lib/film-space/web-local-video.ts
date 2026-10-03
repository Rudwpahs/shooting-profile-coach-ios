/**
 * A browser-local video the user picked. The file never leaves the browser:
 * it becomes an object URL that only this document can read, plus the
 * metadata deterministic sampling needs. Nothing here records the file name.
 */

export const MAX_WEB_LOCAL_VIDEO_BYTES = 256 * 1024 * 1024;

const ACCEPTED_TYPES = /^video\/(mp4|quicktime|webm|x-m4v|mpeg)$/i;
const ACCEPTED_EXTENSIONS = /\.(mp4|m4v|mov|webm)$/i;
const DEFAULT_PROBE_TIMEOUT_MS = 12_000;

export type WebLocalVideoCandidate = Readonly<{ name: string; type: string; size: number }>;

export type WebLocalVideoRejection = "unsupported_type" | "empty" | "too_large" | "metadata_unavailable";

export type WebLocalVideoSourceV1 = Readonly<{
  /** The object URL; the only handle the rest of Film Space ever sees. */
  uri: string;
  durationMs: number;
  width: number;
  height: number;
  sizeBytes: number;
  /** The picked file itself, held only so a saved film shot can keep it on this device. Never sent anywhere. */
  blob?: Blob;
  /** Releases the object URL. Idempotent. */
  revoke(): void;
}>;

export type WebLocalVideoPorts = Readonly<{
  createObjectURL(file: Blob): string;
  revokeObjectURL(uri: string): void;
  probe(uri: string, signal?: AbortSignal): Promise<Readonly<{ durationMs: number; width: number; height: number }>>;
}>;

export type WebLocalVideoOptions = Readonly<{ probeTimeoutMs?: number }>;

export type WebLocalVideoResult =
  | Readonly<{ status: "ready"; source: WebLocalVideoSourceV1 }>
  | Readonly<{ status: "rejected"; reason: WebLocalVideoRejection }>;

export function rejectWebLocalVideoCandidate(file: WebLocalVideoCandidate): WebLocalVideoRejection | null {
  const typeOk = ACCEPTED_TYPES.test(file.type);
  const extensionOk = ACCEPTED_EXTENSIONS.test(file.name);
  if (!typeOk && !extensionOk) return "unsupported_type";
  if (!Number.isFinite(file.size) || file.size <= 0) return "empty";
  if (file.size > MAX_WEB_LOCAL_VIDEO_BYTES) return "too_large";
  return null;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("film-space web probe timed out")), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export async function createWebLocalVideoSource(
  file: WebLocalVideoCandidate & Partial<Blob>,
  ports: WebLocalVideoPorts,
  options: WebLocalVideoOptions = {},
): Promise<WebLocalVideoResult> {
  const rejection = rejectWebLocalVideoCandidate(file);
  if (rejection) return { status: "rejected", reason: rejection };

  const uri = ports.createObjectURL(file as Blob);
  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    revoked = true;
    ports.revokeObjectURL(uri);
  };

  try {
    const metadata = await withTimeout(ports.probe(uri), options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS);
    if (!positiveFinite(metadata.durationMs) || !positiveFinite(metadata.width) || !positiveFinite(metadata.height)) {
      revoke();
      return { status: "rejected", reason: "metadata_unavailable" };
    }
    return {
      status: "ready",
      source: {
        uri,
        durationMs: Math.round(metadata.durationMs),
        width: Math.round(metadata.width),
        height: Math.round(metadata.height),
        sizeBytes: file.size,
        ...(typeof Blob !== "undefined" && file instanceof Blob ? { blob: file } : {}),
        revoke,
      },
    };
  } catch {
    revoke();
    return { status: "rejected", reason: "metadata_unavailable" };
  }
}

/** User-facing copy for a rejected pick. Never includes the file name. */
export function describeWebLocalVideoRejection(reason: WebLocalVideoRejection): string {
  switch (reason) {
    case "unsupported_type":
      return "MP4 또는 MOV 영상 파일만 선택할 수 있습니다.";
    case "empty":
      return "선택한 영상 파일이 비어 있습니다. 다른 영상을 선택하세요.";
    case "too_large":
      return "영상 파일이 너무 큽니다. 2–20초 길이의 짧은 슈팅 영상을 선택하세요.";
    case "metadata_unavailable":
      return "이 브라우저에서 선택한 영상을 읽지 못했습니다. 다른 MP4 영상을 선택하세요.";
  }
}
