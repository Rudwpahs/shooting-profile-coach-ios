/**
 * The preview's capture data source is the browser's footage-only capture
 * machine, unchanged: the same code a production web build uses. It lives in
 * production code (lib/film-space) so that build can reach it; the preview
 * never supplies a cloud port, so nothing leaves the browser here.
 */
export {
  createWebFilmCaptureMachine as createPreviewCaptureMachine,
  type WebFilmCaptureMachine as PreviewCaptureMachine,
  type WebFilmCapturePorts as PreviewCaptureMachinePorts,
} from "@/lib/film-space/web-film-capture-machine";
export type { WebLocalVideoPickResult as PreviewLocalVideoPick } from "@/lib/film-space/web-local-video-picker";
