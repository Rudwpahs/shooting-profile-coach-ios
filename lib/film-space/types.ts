export type LocalFilmViewV1 = "front" | "shooting_side";

export type LocalFilmClipRefV1 = Readonly<{
  slotId: string;
  view: LocalFilmViewV1;
  takeIndex: number;
  uri: string;
  durationMs: number;
  width: number;
  height: number;
}>;

export type LocalFilmAssociationV1 = Readonly<{
  version: "local_film_association_v1";
  profileId: string;
  clips: readonly LocalFilmClipRefV1[];
}>;