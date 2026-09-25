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

export type FilmSpaceSamplingPlan = Readonly<{
  version: "film_space_sampling_v1";
  durationMs: number;
  sliceCount: number;
  targetLongEdgePx: number;
  timestampsMs: readonly number[];
  estimatedRawRgbaBytes: number;
  maxRawRgbaBytes: number;
}>;

export type FilmSpaceFrameV1<TImageRef = unknown> = Readonly<{
  timestampMs: number;
  requestedTimestampMs: number;
  width: number;
  height: number;
  imageRef: TImageRef;
}>;

export type FilmSpaceFrameCacheV1<TImageRef = unknown> = {
  version: "film_space_frame_cache_v1";
  status: "ready";
  sourceSlotId: string;
  targetLongEdgePx: number;
  frames: readonly FilmSpaceFrameV1<TImageRef>[];
  released: boolean;
};

export type FilmSpaceFrameSourceUnavailable = Readonly<{
  status: "unavailable";
  reason: "source_unavailable" | "frame_generation_failed";
}>;

export type FilmSpaceFrameSourceCancelled = Readonly<{
  status: "cancelled";
}>;

export type FilmSpaceFrameSourceUnsupported = Readonly<{
  status: "unsupported_platform";
  message: string;
}>;

export type FilmSpaceFrameSourceResult<TImageRef = unknown> =
  | FilmSpaceFrameCacheV1<TImageRef>
  | FilmSpaceFrameSourceUnavailable
  | FilmSpaceFrameSourceCancelled
  | FilmSpaceFrameSourceUnsupported;