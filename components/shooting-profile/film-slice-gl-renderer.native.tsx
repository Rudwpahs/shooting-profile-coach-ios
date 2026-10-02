import { GLView, type ExpoWebGLRenderingContext } from "expo-gl";
import { useCallback, useEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";

import {
  FILM_SLICE_CLEAR_COLOR,
  FILM_SLICE_FRAGMENT_SHADER,
  FILM_SLICE_QUAD,
  FILM_SLICE_UV,
  FILM_SLICE_VERTEX_SHADER,
  degreesToRadians,
  orderFilmSlicesForDraw,
} from "@/lib/film-space/gl-slice-shader";
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
  sliceScaleLocation: WebGLUniformLocation | null;
  yawLocation: WebGLUniformLocation | null;
  pitchLocation: WebGLUniformLocation | null;
  planeAspectLocation: WebGLUniformLocation | null;
  viewportAspectLocation: WebGLUniformLocation | null;
  opacityLocation: WebGLUniformLocation | null;
  samplerLocation: WebGLUniformLocation | null;
};

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
  let vertex: WebGLShader | null = null;
  let fragment: WebGLShader | null = null;
  let program: WebGLProgram | null = null;
  try {
    vertex = compileShader(gl, gl.VERTEX_SHADER, FILM_SLICE_VERTEX_SHADER);
    fragment = compileShader(gl, gl.FRAGMENT_SHADER, FILM_SLICE_FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("film-space GL program allocation failed");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("film-space GL program link failed");
    }
    return program;
  } catch {
    if (program) gl.deleteProgram(program);
    throw new Error("film-space GL program preparation failed");
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
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
  try {
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
  } catch {
    gl.deleteTexture(texture);
    throw new Error("film-space GL texture preparation failed");
  }
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
  let program: WebGLProgram | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let uvBuffer: WebGLBuffer | null = null;
  const textures: WebGLTexture[] = [];
  try {
    program = createProgram(gl);
    positionBuffer = createBuffer(gl, FILM_SLICE_QUAD);
    uvBuffer = createBuffer(gl, FILM_SLICE_UV);
    sources.forEach((source) => textures.push(createTexture(gl, source)));

    return {
      program,
      positionBuffer,
      uvBuffer,
      textures,
      positionLocation: gl.getAttribLocation(program, "a_position"),
      uvLocation: gl.getAttribLocation(program, "a_uv"),
      depthLocation: gl.getUniformLocation(program, "u_depth"),
      sliceScaleLocation: gl.getUniformLocation(program, "u_sliceScale"),
      yawLocation: gl.getUniformLocation(program, "u_yaw"),
      pitchLocation: gl.getUniformLocation(program, "u_pitch"),
      planeAspectLocation: gl.getUniformLocation(program, "u_planeAspect"),
      viewportAspectLocation: gl.getUniformLocation(program, "u_viewportAspect"),
      opacityLocation: gl.getUniformLocation(program, "u_opacity"),
      samplerLocation: gl.getUniformLocation(program, "u_texture"),
    };
  } catch {
    textures.forEach((texture) => gl.deleteTexture(texture));
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (uvBuffer) gl.deleteBuffer(uvBuffer);
    if (program) gl.deleteProgram(program);
    throw new Error("film-space GL resource preparation failed");
  }
}

function draw(
  gl: ExpoWebGLRenderingContext,
  resources: GLResources,
  sources: readonly FilmSpaceGLTextureSourceV1[],
  slices: readonly FilmSpaceSlicePoseV1[],
  camera: FilmSpaceCameraV1,
): void {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(...FILM_SLICE_CLEAR_COLOR);
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

  gl.uniform1f(resources.yawLocation, degreesToRadians(camera.yawDegrees));
  gl.uniform1f(resources.pitchLocation, degreesToRadians(camera.pitchDegrees));
  gl.uniform1f(
    resources.viewportAspectLocation,
    gl.drawingBufferWidth / Math.max(1, gl.drawingBufferHeight),
  );
  gl.uniform1i(resources.samplerLocation, 0);

  for (const slice of orderFilmSlicesForDraw(slices)) {
    const source = sources[slice.index];
    const texture = resources.textures[slice.index];
    if (!source || !texture) continue;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(resources.depthLocation, slice.centeredDepth);
    gl.uniform1f(resources.sliceScaleLocation, slice.scale);
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

  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    try {
      destroyResources(gl, resourcesRef.current);
      resourcesRef.current = buildResources(gl, sources);
      renderLatest();
    } catch {
      resourcesRef.current = null;
      onRendererError?.();
    }
  }, [onRendererError, renderLatest, sources]);

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
