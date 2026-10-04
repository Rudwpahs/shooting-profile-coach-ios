import type { User } from "firebase/auth";

import type { CloudFilmShotDownloadV1, CloudFilmShotHeadSummaryV1, CloudFilmShotInputV1 } from "@/lib/firebase-film-shots";

/**
 * Where the owner's film shots can be kept besides this device. By default
 * nowhere: raw footage stays on the device (docs/HOOPHUB_AI_PRODUCT_ARCHITECTURE.md
 * §6), so the ordinary build's source is unavailable and every call refuses.
 * A build that explicitly opts in with EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1=1
 * gets the owner-only Firebase Storage + Firestore source; the install-free
 * preview never does. The Firebase source is loaded through a literal gate so
 * Metro folds it, and the upload code, out of every other bundle.
 */
export type FilmShotCloudSource = Readonly<{
  /** False means this build cannot keep footage anywhere but the device; surfaces hide every cloud control. */
  available: boolean;
  upload(user: User, shot: CloudFilmShotInputV1, files: Readonly<Record<string, Blob>>): Promise<void>;
  list(user: User): Promise<CloudFilmShotHeadSummaryV1[]>;
  download(user: User, shotId: string): Promise<CloudFilmShotDownloadV1>;
  remove(user: User, shotId: string): Promise<void>;
  resumePendingDeletions(user: User): Promise<void>;
}>;

const refuse = async (): Promise<never> => {
  throw new Error("클라우드 내 영상 보관은 이 빌드에서 사용할 수 없습니다.");
};

export const unavailableFilmShotCloudSource: FilmShotCloudSource = Object.freeze({
  available: false,
  upload: refuse,
  list: refuse,
  download: refuse,
  remove: refuse,
  resumePendingDeletions: refuse,
});

function resolveFilmShotCloudSource(): FilmShotCloudSource {
  // The preview runs with a synthetic user and no Firebase; it never reaches the cloud, whatever else is set.
  if (process.env.EXPO_PUBLIC_HOOPHUB_UI_PREVIEW_BUILD === "1") return unavailableFilmShotCloudSource;
  // Default-off product flag. The literal lets Metro drop the Firebase Storage code from ordinary bundles.
  if (process.env.EXPO_PUBLIC_HOOPHUB_CLOUD_FILM_SHOTS_V1 === "1") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cloud = require("@/lib/firebase-film-shot-cloud-source") as typeof import("@/lib/firebase-film-shot-cloud-source");
    return cloud.firebaseFilmShotCloudSource;
  }
  return unavailableFilmShotCloudSource;
}

export const filmShotCloudSource: FilmShotCloudSource = resolveFilmShotCloudSource();
