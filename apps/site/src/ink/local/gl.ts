export const fullscreenVertex = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

export type Program = {
  handle: WebGLProgram;
  use: () => void;
  uniform: (name: string) => WebGLUniformLocation | null;
};

export function link(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const handle = gl.createProgram();
  gl.attachShader(handle, vertex);
  gl.attachShader(handle, fragment);
  gl.bindAttribLocation(handle, 0, "aPosition");
  gl.linkProgram(handle);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(handle));
    gl.deleteProgram(handle);
    return null;
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  const program: Program = {
    handle,
    use: () => gl.useProgram(handle),
    uniform: (name) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(handle, name));
      return locations.get(name) ?? null;
    },
  };
  return program;
}

export type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

type Format = { internal: number; format: number; type: number; filter: number };

export function formats(gl: WebGL2RenderingContext) {
  return {
    rgba: { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT, filter: gl.LINEAR },
    rg: { internal: gl.RG16F, format: gl.RG, type: gl.HALF_FLOAT, filter: gl.LINEAR },
    r: { internal: gl.R16F, format: gl.RED, type: gl.HALF_FLOAT, filter: gl.NEAREST },
    exact: { internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST },
  } satisfies Record<string, Format>;
}

export function texture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  { internal, format, type, filter }: Format,
  data: ArrayBufferView | null = null,
) {
  const handle = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, handle);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
  return handle;
}

export function target(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  format: Format,
  data: ArrayBufferView | null = null,
): Target {
  const handle = texture(gl, width, height, format, data);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, handle, 0);
  if (!data) {
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  return { texture: handle, framebuffer, width, height };
}

export function release(gl: WebGL2RenderingContext, ...targets: Target[]) {
  for (const { texture: handle, framebuffer } of targets) {
    gl.deleteTexture(handle);
    gl.deleteFramebuffer(framebuffer);
  }
}

export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
