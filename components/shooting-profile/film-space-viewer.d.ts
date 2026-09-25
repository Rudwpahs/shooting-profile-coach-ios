import type { ReactElement } from "react";

import type { LocalFilmClipRefV1 } from "@/lib/film-space/types";

export type FilmSpaceViewerProps = Readonly<{
  clip: LocalFilmClipRefV1;
}>;

export declare function FilmSpaceViewer(props: FilmSpaceViewerProps): ReactElement;