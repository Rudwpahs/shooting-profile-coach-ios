import {
  createWebLocalVideoSource,
  type WebLocalVideoPorts,
  type WebLocalVideoResult,
} from "@/lib/film-space/web-local-video";

/**
 * Opens the browser's own file chooser for one local video and turns the
 * pick into a browser-local source. No network request, no form, no server:
 * the file is read only through an object URL inside this document.
 */

export type WebLocalVideoPickResult = WebLocalVideoResult | Readonly<{ status: "cancelled" }>;

const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";

function probeWithVideoElement(uri: string): Promise<{ durationMs: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };
    const onLoaded = () => {
      const metadata = { durationMs: video.duration * 1000, width: video.videoWidth, height: video.videoHeight };
      cleanup();
      resolve(metadata);
    };
    const onError = () => {
      cleanup();
      reject(new Error("video metadata unavailable"));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("error", onError);
    video.src = uri;
  });
}

export const WEB_LOCAL_VIDEO_DOM_PORTS: WebLocalVideoPorts = {
  createObjectURL: (file) => URL.createObjectURL(file),
  revokeObjectURL: (uri) => URL.revokeObjectURL(uri),
  probe: probeWithVideoElement,
};

export function isWebLocalVideoPickerSupported(): boolean {
  return typeof document !== "undefined"
    && typeof URL !== "undefined"
    && typeof URL.createObjectURL === "function";
}

export type WebLocalVideoPickOptions = Readonly<{
  /** Ask a phone browser to offer its camera first; desktop browsers show the normal chooser. */
  capture?: boolean;
}>;

/** Resolves when the user picks a file or dismisses the chooser. */
export function pickWebLocalVideo(
  options: WebLocalVideoPickOptions = {},
  ports: WebLocalVideoPorts = WEB_LOCAL_VIDEO_DOM_PORTS,
): Promise<WebLocalVideoPickResult> {
  if (!isWebLocalVideoPickerSupported()) return Promise.resolve({ status: "cancelled" });
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT;
    input.multiple = false;
    if (options.capture) input.setAttribute("capture", "environment");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.width = "1px";
    input.style.height = "1px";
    input.style.opacity = "0";
    input.setAttribute("aria-hidden", "true");
    input.setAttribute("data-hoophub-local-video-input", "true");

    let settled = false;
    const finish = (result: Promise<WebLocalVideoPickResult> | WebLocalVideoPickResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", onFocusBack);
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
      input.remove();
      resolve(result);
    };
    const onChange = () => {
      const file = input.files?.[0];
      if (!file) {
        finish({ status: "cancelled" });
        return;
      }
      finish(createWebLocalVideoSource(file, ports));
    };
    const onCancel = () => finish({ status: "cancelled" });
    // Browsers without the `cancel` event: when focus returns and no file arrived shortly after, treat it as dismissed.
    const onFocusBack = () => {
      setTimeout(() => {
        if (!settled && !(input.files && input.files.length > 0)) finish({ status: "cancelled" });
      }, 400);
    };

    input.addEventListener("change", onChange);
    input.addEventListener("cancel", onCancel);
    window.addEventListener("focus", onFocusBack);
    document.body.appendChild(input);
    input.click();
  });
}
