const vertexSource = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };
type Shared = {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  programs: Map<string, Program | null>;
  lost: boolean;
  frame: ImageData | null;
};

type Uniform = (name: string) => WebGLUniformLocation | null;

let shared: Shared | null | undefined;

function create(): Shared | null {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
    // Software WebGL (a blocklisted GPU) is slower than the CPU painters, so it counts as none.
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) return null;
  const state: Shared = { canvas, gl, programs: new Map(), lost: false, frame: null };
  // A lost context stays lost for the session; every caller falls back to its 2D painter.
  canvas.addEventListener("webglcontextlost", () => {
    state.lost = true;
  });
  return state;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string): Program | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = vertex && fragment ? gl.createProgram() : null;
  if (program && vertex && fragment) {
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (program && gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return { program, uniforms: new Map() };
  }
  gl.deleteProgram(program);
  return null;
}

/**
 * Draws `fragmentSource` (straight colour; gl_FragCoord.y counts down from the top) on one
 * shared WebGL2 context and copies it into `target`. Returns false, leaving `target`
 * untouched, when WebGL is unavailable, lost or rejects the shader; the caller then paints
 * on the CPU.
 */
export function paintWithGl(
  target: CanvasRenderingContext2D,
  fragmentSource: string,
  width: number,
  height: number,
  setUniforms: (gl: WebGL2RenderingContext, uniform: Uniform) => void,
): boolean {
  if (shared === undefined) shared = create();
  if (!shared || shared.lost || shared.gl.isContextLost()) return false;
  const { canvas, gl, programs } = shared;
  let entry = programs.get(fragmentSource);
  if (entry === undefined) {
    entry = link(gl, fragmentSource);
    programs.set(fragmentSource, entry);
  }
  if (!entry) return false;
  const { program, uniforms } = entry;
  if (canvas.width < width) canvas.width = width;
  if (canvas.height < height) canvas.height = height;
  gl.useProgram(program);
  setUniforms(gl, (name) => {
    let location = uniforms.get(name);
    if (location === undefined) {
      location = gl.getUniformLocation(program, name);
      uniforms.set(name, location);
    }
    return location;
  });
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  let frame = shared.frame;
  if (!frame || frame.width !== width || frame.height !== height) {
    frame = shared.frame = new ImageData(width, height);
  }
  // drawImage of a WebGL canvas copies nothing on ANGLE's SwiftShader Vulkan backend, so read back.
  // Readback row 0 is GL's bottom row, which is why shaders count gl_FragCoord.y from the top.
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, frame.data);
  target.putImageData(frame, 0, 0);
  return true;
}
