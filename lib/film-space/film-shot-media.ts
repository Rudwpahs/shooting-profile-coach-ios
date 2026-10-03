import { createPassthroughFilmShotMedia, type FilmShotMedia } from "@/lib/film-space/film-shot-media-memory";

export { createMemoryFilmShotMedia, createPassthroughFilmShotMedia } from "@/lib/film-space/film-shot-media-memory";
export type { FilmShotClipInputV1, FilmShotMedia, MemoryFilmShotMedia } from "@/lib/film-space/film-shot-media-memory";

/** Native: the picked file URI is already persistent on this device. (The web build resolves `film-shot-media.web.ts`.) */
export function defaultFilmShotMedia(): FilmShotMedia {
  return createPassthroughFilmShotMedia();
}
