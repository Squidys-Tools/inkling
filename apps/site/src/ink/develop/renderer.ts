import { fragmentSource, vertexSource } from "./shader.ts";

export type DevelopFrame = {
  time: number;
  width: number;
  height: number;
  scale: number;
  rect: { x: number; y: number; halfWidth: number; halfHeight: number };
  image: number;
  form: number;
  bloom: number;
  dissolve: number;
};

const uniformNames = [
  "uResolution",
  "uTime",
  "uScale",
  "uRect",
  "uForm",
  "uBloom",
  "uDissolve",
  "uSeed",
  "uReady",
  "uImage",
] as const;

function compile(gl: WebGL2RenderingContext, kind: number, source: string) {
  const shader = gl.createShader(kind);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

/** Draws the ink field onto `canvas`, or returns null where WebGL2 or the shader is unavailable. */
export function createDevelopRenderer(canvas: HTMLCanvasElement, sources: readonly string[]) {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uniforms = Object.fromEntries(
    uniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
  ) as Record<(typeof uniformNames)[number], WebGLUniformLocation | null>;

  const ready = sources.map(() => false);
  const textures = sources.map((src, index) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      ready[index] = true;
    };
    image.src = src;
    return texture;
  });

  return {
    draw(frame: DevelopFrame) {
      const width = Math.round(frame.width * frame.scale);
      const height = Math.round(frame.height * frame.scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[frame.image]);
      const { x, y, halfWidth, halfHeight } = frame.rect;
      gl.uniform2f(uniforms.uResolution, width, height);
      gl.uniform1f(uniforms.uTime, frame.time);
      gl.uniform1f(uniforms.uScale, frame.scale);
      gl.uniform4f(
        uniforms.uRect,
        x * frame.scale,
        y * frame.scale,
        halfWidth * frame.scale,
        halfHeight * frame.scale,
      );
      gl.uniform1f(uniforms.uForm, frame.form);
      gl.uniform1f(uniforms.uBloom, frame.bloom);
      gl.uniform1f(uniforms.uDissolve, frame.dissolve);
      gl.uniform1f(uniforms.uSeed, frame.image * 1.7 + 0.3);
      gl.uniform1f(uniforms.uReady, ready[frame.image] ? 1 : 0);
      gl.uniform1i(uniforms.uImage, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      for (const texture of textures) gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}
