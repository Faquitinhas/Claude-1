// Capa fina sobre WebGL2: programas con reflexión de uniforms, texturas, framebuffers.

export const GLSL_HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
`;

export function initGL(canvas, attrs = {}) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
    desynchronized: false, ...attrs,
  });
  if (!gl) return null;
  const caps = {
    colorFloat: !!gl.getExtension('EXT_color_buffer_float'),
    colorHalfFloat: !!gl.getExtension('EXT_color_buffer_half_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
    maxAniso: 1,
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    renderer: '',
  };
  if (caps.aniso) caps.maxAniso = gl.getParameter(caps.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  caps.renderer = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  gl.caps = caps;
  // VAO vacío para los pases de pantalla completa (gl_VertexID).
  gl.emptyVAO = gl.createVertexArray();
  return gl;
}

function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) || '';
    const lines = src.split('\n');
    const m = /ERROR:\s*\d+:(\d+)/.exec(log);
    let ctx = '';
    if (m) {
      const ln = +m[1];
      for (let i = Math.max(1, ln - 3); i <= Math.min(lines.length, ln + 3); i++) ctx += `${i}: ${lines[i - 1]}\n`;
    }
    throw new Error(`Shader ${name} (${type === gl.VERTEX_SHADER ? 'VS' : 'FS'}):\n${log}\n${ctx}`);
  }
  return s;
}

export const FULLSCREEN_VS = `${GLSL_HEADER}
out vec2 vUV;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 1.0, 1.0);
}`;

export class Program {
  constructor(gl, vsSrc, fsSrc, name = 'prog') {
    this.gl = gl;
    this.name = name;
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc, name);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc, name);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Link ${name}: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.p = p;
    this.u = {};
    let unit = 0;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    gl.useProgram(p);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      if (!info) continue;
      const base = info.name.replace(/\[0\]$/, '');
      const loc = gl.getUniformLocation(p, info.name);
      if (!loc) continue;
      const u = { loc, type: info.type, size: info.size, unit: -1, target: 0 };
      switch (info.type) {
        case gl.SAMPLER_2D: case gl.SAMPLER_2D_SHADOW: case gl.INT_SAMPLER_2D: case gl.UNSIGNED_INT_SAMPLER_2D:
          u.target = gl.TEXTURE_2D; break;
        case gl.SAMPLER_3D: u.target = gl.TEXTURE_3D; break;
        case gl.SAMPLER_CUBE: u.target = gl.TEXTURE_CUBE_MAP; break;
        case gl.SAMPLER_2D_ARRAY: u.target = gl.TEXTURE_2D_ARRAY; break;
        default: break;
      }
      if (u.target) {
        u.unit = unit;
        if (info.size > 1) {
          const units = [];
          for (let k = 0; k < info.size; k++) units.push(unit++);
          gl.uniform1iv(loc, units);
        } else {
          gl.uniform1i(loc, unit++);
        }
      }
      this.u[base] = u;
    }
  }

  use() { this.gl.useProgram(this.p); return this; }

  has(name) { return !!this.u[name]; }

  // Asigna un uniform según su tipo declarado. Para samplers recibe un objeto textura {tex} o WebGLTexture.
  set(name, v, b, c, d) {
    const u = this.u[name];
    if (!u) return this;
    const gl = this.gl;
    switch (u.type) {
      case gl.FLOAT:
        if (u.size > 1) gl.uniform1fv(u.loc, v); else gl.uniform1f(u.loc, v);
        break;
      case gl.FLOAT_VEC2:
        if (typeof v === 'number') gl.uniform2f(u.loc, v, b); else gl.uniform2fv(u.loc, v);
        break;
      case gl.FLOAT_VEC3:
        if (typeof v === 'number') gl.uniform3f(u.loc, v, b, c); else gl.uniform3fv(u.loc, v);
        break;
      case gl.FLOAT_VEC4:
        if (typeof v === 'number') gl.uniform4f(u.loc, v, b, c, d); else gl.uniform4fv(u.loc, v);
        break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(u.loc, false, v); break;
      case gl.INT: case gl.BOOL:
        if (u.size > 1) gl.uniform1iv(u.loc, v); else gl.uniform1i(u.loc, v);
        break;
      case gl.INT_VEC2: gl.uniform2iv(u.loc, v); break;
      default:
        if (u.target) {
          gl.activeTexture(gl.TEXTURE0 + u.unit);
          gl.bindTexture(u.target, v && v.tex ? v.tex : v);
        }
    }
    return this;
  }

  setAll(obj) { for (const k in obj) this.set(k, obj[k]); return this; }
}

// ---------- texturas ----------
const FORMATS = (gl) => ({
  rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
  srgb8a8: [gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE],
  rg8: [gl.RG8, gl.RG, gl.UNSIGNED_BYTE],
  r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE],
  rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
  rg16f: [gl.RG16F, gl.RG, gl.HALF_FLOAT],
  r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT],
  rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT],
  r32f: [gl.R32F, gl.RED, gl.FLOAT],
  r11g11b10f: [gl.R11F_G11F_B10F, gl.RGB, gl.HALF_FLOAT],
  depth24: [gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT],
  depth32f: [gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT],
  depth16: [gl.DEPTH_COMPONENT16, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT],
});

export function createTexture(gl, o) {
  const fm = FORMATS(gl)[o.format || 'rgba8'];
  const target = o.depth ? gl.TEXTURE_3D : gl.TEXTURE_2D;
  const tex = gl.createTexture();
  gl.bindTexture(target, tex);
  const mips = o.mips ? Math.floor(Math.log2(Math.max(o.width, o.height))) + 1 : 1;
  if (o.depth) gl.texStorage3D(target, mips, fm[0], o.width, o.height, o.depth);
  else gl.texStorage2D(target, mips, fm[0], o.width, o.height);
  const filter = o.filter || 'linear';
  const mag = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
  let min = mag;
  if (o.mips) min = filter === 'nearest' ? gl.NEAREST_MIPMAP_NEAREST : gl.LINEAR_MIPMAP_LINEAR;
  gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, mag);
  const wrap = o.wrap === 'repeat' ? gl.REPEAT : o.wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(target, gl.TEXTURE_WRAP_S, o.wrapS ? (o.wrapS === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE) : wrap);
  gl.texParameteri(target, gl.TEXTURE_WRAP_T, o.wrapT ? (o.wrapT === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE) : wrap);
  if (o.depth) gl.texParameteri(target, gl.TEXTURE_WRAP_R, wrap);
  if (o.aniso && gl.caps.aniso) {
    gl.texParameterf(target, gl.caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(o.aniso, gl.caps.maxAniso));
  }
  if (o.compare) {
    gl.texParameteri(target, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  }
  const t = { tex, target, width: o.width, height: o.height, depth: o.depth || 0, fmt: fm, mips, format: o.format || 'rgba8' };
  if (o.data) updateTexture(gl, t, o.data);
  return t;
}

export function updateTexture(gl, t, data, genMips = true) {
  gl.bindTexture(t.target, t.tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  if (t.depth) gl.texSubImage3D(t.target, 0, 0, 0, 0, t.width, t.height, t.depth, t.fmt[1], t.fmt[2], data);
  else if (data instanceof HTMLCanvasElement || (typeof OffscreenCanvas !== 'undefined' && data instanceof OffscreenCanvas) || (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap)) {
    gl.texSubImage2D(t.target, 0, 0, 0, t.fmt[1], t.fmt[2], data);
  } else gl.texSubImage2D(t.target, 0, 0, 0, t.width, t.height, t.fmt[1], t.fmt[2], data);
  if (t.mips > 1 && genMips) gl.generateMipmap(t.target);
}

export function genMips(gl, t) {
  gl.bindTexture(t.target, t.tex);
  gl.generateMipmap(t.target);
}

// Framebuffer con N texturas de color (misma resolución) y profundidad opcional.
export function createFBO(gl, colors, depthTex = null, opts = {}) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const bufs = [];
  colors.forEach((c, i) => {
    if (c.depth) gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, c.tex, opts.level || 0, opts.layer || 0);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, c.tex, opts.level || 0);
    bufs.push(gl.COLOR_ATTACHMENT0 + i);
  });
  if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex.tex, 0);
  if (bufs.length) gl.drawBuffers(bufs); else { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const lvl = opts.level || 0;
  const ref = colors[0] || depthTex;
  return {
    fbo, ok: st === gl.FRAMEBUFFER_COMPLETE, status: st,
    width: Math.max(1, ref.width >> lvl), height: Math.max(1, ref.height >> lvl), colors, depthTex,
  };
}

export function bindFBO(gl, f) {
  if (f) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    gl.viewport(0, 0, f.width, f.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
}

export function drawFullscreen(gl) {
  gl.bindVertexArray(gl.emptyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

// Comprueba si un formato se puede usar como destino de render.
export function isRenderable(gl, format) {
  const t = createTexture(gl, { width: 4, height: 4, format, filter: 'nearest' });
  const f = createFBO(gl, [t]);
  const ok = f.ok;
  gl.deleteFramebuffer(f.fbo);
  gl.deleteTexture(t.tex);
  return ok;
}

// Malla indexada con atributos intercalados. attrs: [{loc, size, type?, normalized?}], data Float32Array.
export function createMesh(gl, { vertices, indices, attrs, stride, instanced = null }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  let off = 0;
  const bytes = stride || attrs.reduce((s, a) => s + a.size * 4, 0);
  for (const a of attrs) {
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, bytes, off);
    off += a.size * 4;
  }
  let ibo = null, count = vertices.byteLength / bytes, indexType = 0;
  if (indices) {
    ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    count = indices.length;
    indexType = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return { vao, vbo, ibo, count, indexType };
}

export function drawMesh(gl, m, mode) {
  gl.bindVertexArray(m.vao);
  if (m.ibo) gl.drawElements(mode ?? gl.TRIANGLES, m.count, m.indexType, 0);
  else gl.drawArrays(mode ?? gl.TRIANGLES, 0, m.count);
}
