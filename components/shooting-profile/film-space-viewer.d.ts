import type { ReactElement } from "react";

import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

export type FilmSpaceViewerProps = Readonly<{
  clip: LocalFilmClipRefV1;
  onSourceUnavailable?: (clip: LocalFilmClipRefV1) => void | Promise<void>;
}>;

export declare function FilmSpaceViewer(props: FilmSpaceViewerProps): ReactElement;