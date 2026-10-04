import type { FilmShotCloudSource } from "@/lib/film-shot-cloud-source";
import { isFirebaseConfigured } from "@/lib/firebase";
import {
  createFirebaseFilmShotCloudPortsV1,
  deleteCloudFilmShotV1,
  downloadCloudFilmShotV1,
  listCloudFilmShotsV1,
  resumePendingCloudFilmShotDeletionsV1,
  uploadFilmShotV1,
  type FilmShotCloudPortsV1,
} from "@/lib/firebase-film-shots";

/**
 * The owner-only Firebase source for cloud film shots. Loaded only by a build
 * that opted in (see lib/film-shot-cloud-source.ts); every call is bound to
 * the signed-in owner's uid and goes through the orchestration that the
 * rules mirror.
 */

let cachedPorts: FilmShotCloudPortsV1 | null = null;
const ports = (): FilmShotCloudPortsV1 => {
  if (!cachedPorts) cachedPorts = createFirebaseFilmShotCloudPortsV1();
  return cachedPorts;
};

export const firebaseFilmShotCloudSource: FilmShotCloudSource = Object.freeze({
  available: isFirebaseConfigured,
  upload: (user, shot, files) => uploadFilmShotV1({ uid: user.uid, shot, files, ports: ports() }),
  list: (user) => listCloudFilmShotsV1({ uid: user.uid, ports: ports() }),
  download: (user, shotId) => downloadCloudFilmShotV1({ uid: user.uid, shotId, ports: ports() }),
  remove: (user, shotId) => deleteCloudFilmShotV1({ uid: user.uid, shotId, ports: ports() }),
  resumePendingDeletions: (user) => resumePendingCloudFilmShotDeletionsV1({ uid: user.uid, ports: ports() }),
});
