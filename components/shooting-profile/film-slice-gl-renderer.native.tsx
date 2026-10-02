import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import type { FilmSpaceGLTextureSourceV1 } from "@/lib/film-space/gl-texture-source";
import type {
  FilmSpaceCameraV1,
  FilmSpaceSlicePoseV1,
} from "@/lib/film-space/slice-stack";

type FilmSliceGLRendererProps = Readonly<{
  sources: readonly FilmSpaceGLTextureSourceV1[];
  slices: readonly FilmSpaceSlicePoseV1[];
  camera: FilmSpaceCameraV1;
  style?: StyleProp<ViewStyle>;
  onRendererError?: () => void;
}>;

type GLResources = {
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  uvBuffer: WebGLBuffer;
  textures: WebGLTexture[];
  positionLocation: number;
  uvLocation: number;
  depthLocation: WebGLUniformLocation | null;
  zoomLocation: WebGLUniformLocation | null;
  yawLocation: WebGLUniformLocation | null;
  pitchLocation: WebGLUniformLocation | null;
  planeAspectLocation: WebGLUniformLocation | null;
  viewportAspectLocation: WebGLUniformLocation | null;
  opacityLocation: WebGLUniformLocation | null;
  samplerLocation: WebGLUniformLocation | null;
};

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
uniform float u_depth;
uniform float u_zoom;
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
    (p.x * u_zoom * perspective) / max(0.6, u_viewportAspect),
    p.y * u_zoom * perspective,
    0.0,
    1.0
  );
  v_uv = a_uv;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_texture;
uniform float u_opacity;
varying vec2 v_uv;

void main() {
  vec4 sampled = texture2D(u_texture, vec2(v_uv.x, 1.0 - v_uv.y));
  gl_FragColor = vec4(sampled.rgb, sampled.a * u_opacity);
}
`;

const QUAD = new Float32Array([
  -0.5, -0.5,
   0.5, -0.5,
  -0.5,  0.5,
  -0.5,  0.5,
   0.5, -0.5,
   0.5,  0.5,
]);

const UV = new Float32Array([
  0, 0,
  1, 0,
  0, 1,
  0, 1,
  1, 0,
  1, 1,
]);

function compileShader(
  gl: ExpoWebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("film-space GL shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    throw new Error("film-space GL shader compilation failed");
  }
  return shader;
}

function createProgram(gl: ExpoWebGLRenderingContext): WebGLProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error("film-space GL program allocation failed");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    throw new Error("film-space GL program link failed");
  }
  return program;
}

function createBuffer(
  gl: ExpoWebGLRenderingContext,
  data: Float32Array,
): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("film-space GL buffer allocation failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function createTexture(
  gl: ExpoWebGLRenderingContext,
  source: FilmSpaceGLTextureSourceV1,
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("film-space GL texture allocation failed");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    source as unknown as TexImageSource,
  );
  return texture;
}

function destroyResources(
  gl: ExpoWebGLRenderingContext,
  resources: GLResources | null,
): void {
  if (!resources) return;
  resources.textures.forEach((texture) => gl.deleteTexture(texture));
  gl.deleteBuffer(resources.positionBuffer);
  gl.deleteBuffer(resources.uvBuffer);
  gl.deleteProgram(resources.program);
}

function buildResources(
  gl: ExpoWebGLRenderingContext,
  sources: readonly FilmSpaceGLTextureSourceV1[],
): GLResources {
  const program = createProgram(gl);
  const positionBuffer = createBuffer(gl, QUAD);
  const uvBuffer = createBuffer(gl, UV);
  const textures = sources.map((source) => createTexture(gl, source));

  return {
    program,
    positionBuffer,
    uvBuffer,
    textures,
    positionLocation: gl.getAttribLocation(program, "a_position"),
    uvLocation: gl.getAttribLocation(program, "a_uv"),
    depthLocation: gl.getUniformLocation(program, "u_depth"),
    zoomLocation: gl.getUniformLocation(program, "u_zoom"),
    yawLocation: gl.getUniformLocation(program, "u_yaw"),
    pitchLocation: gl.getUniformLocation(program, "u_pitch"),
    planeAspectLocation: gl.getUniformLocation(program, "u_planeAspect"),
    viewportAspectLocation: gl.getUniformLocation(program, "u_viewportAspect"),
    opacityLocation: gl.getUniformLocation(program, "u_opacity"),
    samplerLocation: gl.getUniformLocation(program, "u_texture"),
  };
}

function draw(
  gl: ExpoWebGLRenderingContext,
  resources: GLResources,
  sources: readonly FilmSpaceGLTextureSourceV1[],
  slices: readonly FilmSpaceSlicePoseV1[],
  camera: FilmSpaceCameraV1,
): void {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0.035, 0.039, 0.043, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(resources.program);

  gl.bindBuffer(gl.ARRAY_BUFFER, resources.positionBuffer);
  gl.enableVertexAttribArray(resources.positionLocation);
  gl.vertexAttribPointer(resources.positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, resources.uvBuffer);
  gl.enableVertexAttribArray(resources.uvLocation);
  gl.vertexAttribPointer(resources.uvLocation, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1f(resources.zoomLocation, camera.zoom);
  gl.uniform1f(resources.yawLocation, camera.yawDegrees * Math.PI / 180);
  gl.uniform1f(resources.pitchLocation, camera.pitchDegrees * Math.PI / 180);
  gl.uniform1f(
    resources.viewportAspectLocation,
    gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight),
  );
  gl.uniform1i(resources.samplerLocation, 0);

  const ordered = [
    ...slices.filter((slice) => !slice.selected),
    ...slices.filter((slice) => slice.selected),
  ];

  for (const slice of ordered) {
    const source = sources[slice.index];
    const texture = resources.textures[slice.index];
    if (!source || !texture) continue;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(resources.depthLocation, slice.centeredDepth);
    gl.uniform1f(resources.opacityLocation, slice.opacity);
    gl.uniform1f(
      resources.planeAspectLocation,
      source.width / Math.max(1, source.height),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  gl.flush();
  gl.endFrameEXP();
}

export function FilmSliceGLRenderer({
  sources,
  slices,
  camera,
  style,
  onRendererError,
}: FilmSliceGLRendererProps) {
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const resourcesRef = useRef<GLResources | null>(null);
  const latestRef = useRef({ sources, slices, camera });
  latestRef.current = { sources, slices, camera };

  const renderLatest = useCallback(() => {
    const gl = glRef.current;
    const resources = resourcesRef.current;
    if (!gl || !resources) return;
    try {
      draw(
        gl,
        resources,
        latestRef.current.sources,
        latestRef.current.slices,
        latestRef.current.camera,
      );
    } catch {
      onRendererError?.();
    }
  }, [onRendererError]);

  const handleContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    glRef.current = gl;
    try {
      resourcesRef.current = buildResources(gl, latestRef.current.sources);
      renderLatest();
    } catch {
      destroyResources(gl, resourcesRef.current);
      resourcesRef.current = null;
      onRendererError?.();
    }
  }, [onRendererError, renderLatest]);

  useEffect(() => {
    renderLatest();
  }, [camera, renderLatest, slices]);

  useEffect(() => () => {
    const gl = glRef.current;
    if (gl) destroyResources(gl, resourcesRef.current);
    resourcesRef.current = null;
    glRef.current = null;
  }, []);

  return (
    <GLView
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      msaaSamples={0}
      onContextCreate={handleContextCreate}
      style={style}
    />
  );
}
