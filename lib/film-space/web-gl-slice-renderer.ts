import {
  FILM_SLICE_ATTRIBUTES,
  FILM_SLICE_CLEAR_COLOR,
  FILM_SLICE_FRAGMENT_SHADER,
  FILM_SLICE_MAX_TEXTURES,
  FILM_SLICE_QUAD,
  FILM_SLICE_UNIFORMS,
  FILM_SLICE_UV,
  FILM_SLICE_VERTEX_SHADER,
  degreesToRadians,
  orderFilmSlicesForDraw,
} from "@/lib/film-space/gl-slice-shader";
import type { FilmSpaceCameraV1, FilmSpaceSlicePoseV1 } from "@/lib/film-space/slice-stack";

/**
 * Browser WebGL engine for the Film Space slice stack. It owns every GPU
 * resource it creates (program, two buffers, one texture per sampled frame)
 * and releases them exactly once. It never reads files or URLs: textures come
 * from already-decoded, bounded, browser-local bitmaps.
 */

/** The subset of WebGLRenderingContext the engine uses; WebGL2 contexts satisfy it too. */
export type FilmSliceGLContext = Pick<
  WebGLRenderingContext,
  | "VERTEX_SHADER" | "FRAGMENT_SHADER" | "COMPILE_STATUS" | "LINK_STATUS" | "ARRAY_BUFFER" | "STATIC_DRAW"
  | "TEXTURE_2D" | "TEXTURE_MIN_FILTER" | "TEXTURE_MAG_FILTER" | "TEXTURE_WRAP_S" | "TEXTURE_WRAP_T" | "LINEAR"
  | "CLAMP_TO_EDGE" | "RGBA" | "UNSIGNED_BYTE" | "COLOR_BUFFER_BIT" | "DEPTH_BUFFER_BIT" | "DEPTH_TEST" | "BLEND"
  | "SRC_ALPHA" | "ONE_MINUS_SRC_ALPHA" | "FLOAT" | "TRIANGLES" | "TEXTURE0" | "UNPACK_FLIP_Y_WEBGL"
  | "createShader" | "shaderSource" | "compileShader" | "getShaderParameter" | "deleteShader"
  | "createProgram" | "attachShader" | "linkProgram" | "getProgramParameter" | "deleteProgram"
  | "createBuffer" | "bindBuffer" | "bufferData" | "deleteBuffer"
  | "createTexture" | "bindTexture" | "texParameteri" | "pixelStorei" | "texImage2D" | "deleteTexture"
  | "getAttribLocation" | "getUniformLocation"
  | "viewport" | "clearColor" | "clear" | "disable" | "enable" | "blendFunc" | "useProgram"
  | "enableVertexAttribArray" | "vertexAttribPointer" | "uniform1f" | "uniform1i" | "activeTexture"
  | "drawArrays" | "flush" | "isContextLost"
>;

export type FilmSliceTextureFrameV1 = Readonly<{
  /** A decoded browser image source (ImageBitmap or canvas); never a URL. */
  source: unknown;
  width: number;
  height: number;
}>;

export type FilmSliceGLEngine = Readonly<{
  setTextures(frames: readonly FilmSliceTextureFrameV1[]): void;
  draw(
    slices: readonly FilmSpaceSlicePoseV1[],
    camera: FilmSpaceCameraV1,
    viewport: Readonly<{ width: number; height: number }>,
  ): void;
  textureCount(): number;
  dispose(): void;
}>;

type Program = {
  program: WebGLProgram;
  positionBuffer: WebGLBuffer;
  uvBuffer: WebGLBuffer;
  positionLocation: number;
  uvLocation: number;
  depth: WebGLUniformLocation | null;
  sliceScale: WebGLUniformLocation | null;
  yaw: WebGLUniformLocation | null;
  pitch: WebGLUniformLocation | null;
  planeAspect: WebGLUniformLocation | null;
  viewportAspect: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  sampler: WebGLUniformLocation | null;
};

type Texture = { texture: WebGLTexture; aspect: number };

function compileShader(gl: FilmSliceGLContext, type: number, source: string): WebGLShader {
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

function createProgram(gl: FilmSliceGLContext): WebGLProgram {
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
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("film-space GL program link failed");
    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    if (vertex) gl.deleteShader(vertex);
    if (fragment) gl.deleteShader(fragment);
  }
}

function createBuffer(gl: FilmSliceGLContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error("film-space GL buffer allocation failed");
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return buffer;
}

function buildProgram(gl: FilmSliceGLContext): Program {
  let program: WebGLProgram | null = null;
  let positionBuffer: WebGLBuffer | null = null;
  let uvBuffer: WebGLBuffer | null = null;
  try {
    program = createProgram(gl);
    positionBuffer = createBuffer(gl, FILM_SLICE_QUAD);
    uvBuffer = createBuffer(gl, FILM_SLICE_UV);
    return {
      program,
      positionBuffer,
      uvBuffer,
      positionLocation: gl.getAttribLocation(program, FILM_SLICE_ATTRIBUTES.position),
      uvLocation: gl.getAttribLocation(program, FILM_SLICE_ATTRIBUTES.uv),
      depth: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.depth),
      sliceScale: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.sliceScale),
      yaw: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.yaw),
      pitch: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.pitch),
      planeAspect: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.planeAspect),
      viewportAspect: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.viewportAspect),
      opacity: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.opacity),
      sampler: gl.getUniformLocation(program, FILM_SLICE_UNIFORMS.sampler),
    };
  } catch (error) {
    if (positionBuffer) gl.deleteBuffer(positionBuffer);
    if (uvBuffer) gl.deleteBuffer(uvBuffer);
    if (program) gl.deleteProgram(program);
    throw error;
  }
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function createSliceTexture(gl: FilmSliceGLContext, frame: FilmSliceTextureFrameV1): Texture {
  if (!positiveFinite(frame.width) || !positiveFinite(frame.height) || frame.source === null || frame.source === undefined) {
    throw new Error("film-space GL texture frame is malformed");
  }
  const texture = gl.createTexture();
  if (!texture) throw new Error("film-space GL texture allocation failed");
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame.source as TexImageSource);
    return { texture, aspect: frame.width / frame.height };
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}

export function createFilmSliceGLEngine(gl: FilmSliceGLContext): FilmSliceGLEngine {
  let program: Program | null = buildProgram(gl);
  let textures: Texture[] = [];

  const deleteTextures = () => {
    for (const entry of textures) gl.deleteTexture(entry.texture);
    textures = [];
  };

  return {
    setTextures(frames) {
      if (!program) throw new Error("film-space GL engine is disposed");
      deleteTextures();
      if (frames.length < 1 || frames.length > FILM_SLICE_MAX_TEXTURES) {
        throw new Error(`film-space GL textures require 1..${FILM_SLICE_MAX_TEXTURES} frames`);
      }
      const created: Texture[] = [];
      try {
        for (const frame of frames) created.push(createSliceTexture(gl, frame));
      } catch (error) {
        for (const entry of created) gl.deleteTexture(entry.texture);
        throw error;
      }
      textures = created;
    },

    draw(slices, camera, viewport) {
      if (!program || textures.length === 0) return;
      const width = Math.max(1, Math.floor(viewport.width));
      const height = Math.max(1, Math.floor(viewport.height));
      gl.viewport(0, 0, width, height);
      gl.clearColor(...FILM_SLICE_CLEAR_COLOR);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program.program);

      gl.bindBuffer(gl.ARRAY_BUFFER, program.positionBuffer);
      gl.enableVertexAttribArray(program.positionLocation);
      gl.vertexAttribPointer(program.positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, program.uvBuffer);
      gl.enableVertexAttribArray(program.uvLocation);
      gl.vertexAttribPointer(program.uvLocation, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(program.yaw, degreesToRadians(camera.yawDegrees));
      gl.uniform1f(program.pitch, degreesToRadians(camera.pitchDegrees));
      gl.uniform1f(program.viewportAspect, width / height);
      gl.uniform1i(program.sampler, 0);

      for (const slice of orderFilmSlicesForDraw(slices)) {
        const entry = textures[slice.index];
        if (!entry) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, entry.texture);
        gl.uniform1f(program.depth, slice.centeredDepth);
        gl.uniform1f(program.sliceScale, slice.scale);
        gl.uniform1f(program.opacity, slice.opacity);
        gl.uniform1f(program.planeAspect, entry.aspect);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.flush();
    },

    textureCount: () => textures.length,

    dispose() {
      deleteTextures();
      if (!program) return;
      gl.deleteBuffer(program.positionBuffer);
      gl.deleteBuffer(program.uvBuffer);
      gl.deleteProgram(program.program);
      program = null;
    },
  };
}
