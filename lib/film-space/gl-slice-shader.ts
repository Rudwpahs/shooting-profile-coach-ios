import type { FilmSpaceSlicePoseV1 } from "@/lib/film-space/slice-stack";

/**
 * The one textured-slice program shared by the native Expo GL renderer and
 * the browser WebGL renderer. Each sampled frame of the single local source
 * clip is drawn as a quad placed along the source-time axis; the depth is a
 * display arrangement of source time, not a measured or reconstructed depth.
 */

export const FILM_SLICE_MAX_TEXTURES = 96;

export const FILM_SLICE_VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform float u_depth;
uniform float u_sliceScale;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_planeAspect;
uniform float u_viewportAspect;
varying vec2 v_uv;

void main() {
  vec3 p = vec3(
    a_position.x * 0.72 * u_planeAspect,
    a_position.y * 0.72,
    u_depth * 1.6
  );

  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  p = vec3(
    p.x * cy + p.z * sy,
    p.y,
    -p.x * sy + p.z * cy
  );

  float cx = cos(u_pitch);
  float sx = sin(u_pitch);
  p = vec3(
    p.x,
    p.y * cx - p.z * sx,
    p.y * sx + p.z * cx
  );

  float perspective = 1.0 / max(0.58, 1.0 + p.z * 0.34);
  gl_Position = vec4(
    (p.x * u_sliceScale * perspective) / max(0.6, u_viewportAspect),
    p.y * u_sliceScale * perspective,
    0.0,
    1.0
  );
  v_uv = a_uv;
}
`;

export const FILM_SLICE_FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_opacity;
varying vec2 v_uv;

void main() {
  vec4 sampled = texture2D(u_texture, vec2(v_uv.x, 1.0 - v_uv.y));
  gl_FragColor = vec4(sampled.rgb, sampled.a * u_opacity);
}
`;

export const FILM_SLICE_QUAD = new Float32Array([
  -0.5, -0.5,
   0.5, -0.5,
  -0.5,  0.5,
  -0.5,  0.5,
   0.5, -0.5,
   0.5,  0.5,
]);

export const FILM_SLICE_UV = new Float32Array([
  0, 0,
  1, 0,
  0, 1,
  0, 1,
  1, 0,
  1, 1,
]);

/** Stage background behind the slices, as RGBA in 0..1. */
export const FILM_SLICE_CLEAR_COLOR: readonly [number, number, number, number] = [0.035, 0.039, 0.043, 1];

export const FILM_SLICE_ATTRIBUTES = Object.freeze({
  position: "a_position",
  uv: "a_uv",
});

export const FILM_SLICE_UNIFORMS = Object.freeze({
  depth: "u_depth",
  sliceScale: "u_sliceScale",
  yaw: "u_yaw",
  pitch: "u_pitch",
  planeAspect: "u_planeAspect",
  viewportAspect: "u_viewportAspect",
  opacity: "u_opacity",
  sampler: "u_texture",
});

/** Unselected slices first, the selected slice on top, so emphasis never depends on depth testing. */
export function orderFilmSlicesForDraw(
  slices: readonly FilmSpaceSlicePoseV1[],
): readonly FilmSpaceSlicePoseV1[] {
  return [
    ...slices.filter((slice) => !slice.selected),
    ...slices.filter((slice) => slice.selected),
  ];
}

export function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
