// Cuentas del Tracker UCM: usuario + contraseña, progreso guardado en Vercel Blob (store privado).
// Cada cuenta es un JSON en u/<hmac(usuario)>.json: { user, salt, hash, data, u, c, f }
const crypto = require("crypto");
const { put, get, del, BlobPreconditionFailedError } = require("@vercel/blob");

const DAY = 864e5, TOKEN_DAYS = 180, MAX_DATA = 40000, MAX_FAILS = 8, LOCK_MS = 10 * 60e3;
const KEYS = ["seen", "sent", "fav", "qt", "plan"];

class Fail extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const secret = () => {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Fail(503, "El guardado de cuentas no está configurado.");
  return crypto.createHash("sha256").update("ucm-cuentas:" + t).digest();
};
const hmac = s => crypto.createHmac("sha256", secret()).update(s).digest("base64url");
const pathOf = user => "u/" + hmac("user:" + user) + ".json";
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hashPass = (pass, salt) => new Promise((ok, no) =>
  crypto.scrypt(pass, salt, 32, (e, k) => e ? no(e) : ok(k.toString("hex"))));

async function read(user) {
  const r = await get(pathOf(user), { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const doc = JSON.parse(await new Response(r.stream).text());
  return { doc, etag: r.blob.etag };
}
const write = (user, doc, opt) => put(pathOf(user), JSON.stringify(doc), {
  access: "private", contentType: "application/json", addRandomSuffix: false, ...opt });

function cleanUser(u) {
  u = String(u || "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,20}$/.test(u)) throw new Fail(400, "El usuario tiene que tener entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.");
  return u;
}
function cleanPass(p) {
  p = String(p == null ? "" : p);
  if (p.length < 6 || p.length > 100) throw new Fail(400, "La contraseña tiene que tener al menos 6 caracteres.");
  return p;
}
function cleanData(d) {
  const out = {};
  if (d && typeof d === "object" && !Array.isArray(d)) for (const k of KEYS) {
    const v = d[k];
    if (k === "fav") { if (typeof v === "string" && v.length <= 120) out.fav = v; }
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = v;
  }
  if (JSON.stringify(out).length > MAX_DATA) throw new Fail(413, "El progreso es demasiado grande para guardarlo.");
  return out;
}

const tokenFor = doc => {
  const exp = Date.now() + TOKEN_DAYS * DAY;
  return doc.user + "~" + exp + "~" + hmac("tok:" + doc.user + "~" + exp + "~" + doc.hash.slice(0, 16));
};
// Devuelve { doc, etag } si el token es válido; cambia la contraseña => el token deja de servir.
async function auth(token) {
  const p = String(token || "").split("~");
  const bad = new Fail(401, "Tu sesión venció. Volvé a iniciar sesión.");
  if (p.length !== 3 || !(+p[1] > Date.now())) throw bad;
  let user; try { user = cleanUser(p[0]); } catch (e) { throw bad; }
  const r = await read(user);
  if (!r || !same(p[2], hmac("tok:" + user + "~" + p[1] + "~" + r.doc.hash.slice(0, 16)))) throw bad;
  return r;
}

const actions = {
  async register(b) {
    const user = cleanUser(b.user), pass = cleanPass(b.pass), data = cleanData(b.data);
    if (await read(user)) throw new Fail(409, "Ese usuario ya existe. Probá con otro nombre o iniciá sesión.");
    const salt = crypto.randomBytes(16).toString("hex"), now = Date.now();
    const doc = { user, salt, hash: await hashPass(pass, salt), data, u: now, c: now };
    try { await write(user, doc, { allowOverwrite: false }); }
    catch (e) {
      if (await read(user).catch(() => null)) throw new Fail(409, "Ese usuario ya existe. Probá con otro nombre o iniciá sesión.");
      throw e;
    }
    return { user, token: tokenFor(doc), u: now };
  },
  async login(b) {
    const wrong = new Fail(401, "Usuario o contraseña incorrectos.");
    let user, pass;
    try { user = cleanUser(b.user); pass = String(b.pass == null ? "" : b.pass).slice(0, 100); } catch (e) { throw wrong; }
    const r = await read(user);
    if (!r) { await hashPass(pass, "0".repeat(32)); throw wrong; }
    const { doc, etag } = r, f = doc.f || { n: 0, t: 0 }, now = Date.now();
    if (f.n >= MAX_FAILS && now - f.t < LOCK_MS) throw new Fail(429, "Demasiados intentos fallidos. Esperá unos minutos y probá de nuevo.");
    if (!same(await hashPass(pass, doc.salt), doc.hash)) {
      doc.f = { n: (now - f.t < LOCK_MS ? f.n : 0) + 1, t: now };
      await write(user, doc, { allowOverwrite: true, ifMatch: etag }).catch(() => {});
      throw wrong;
    }
    if (doc.f) { delete doc.f; await write(user, doc, { allowOverwrite: true, ifMatch: etag }).catch(() => {}); }
    return { user, token: tokenFor(doc), data: doc.data || {}, u: doc.u || 0 };
  },
  async get(b) {
    const { doc } = await auth(b.token);
    return { user: doc.user, data: doc.data || {}, u: doc.u || 0 };
  },
  async save(b) {
    const data = cleanData(b.data);
    for (let i = 0; ; i++) {
      const { doc, etag } = await auth(b.token);
      doc.data = data; doc.u = Math.max(Date.now(), (doc.u || 0) + 1);
      try { await write(doc.user, doc, { allowOverwrite: true, ifMatch: etag }); return { u: doc.u }; }
      catch (e) { if (!(e instanceof BlobPreconditionFailedError) || i >= 2) throw e; }
    }
  },
  async delete(b) {
    const { doc } = await auth(b.token);
    if (!same(await hashPass(String(b.pass == null ? "" : b.pass).slice(0, 100), doc.salt), doc.hash)) throw new Fail(401, "Contraseña incorrecta.");
    await del(pathOf(doc.user));
    return { deleted: true };
  },
};

// Ejecuta una acción y devuelve { status, body } listo para responder.
async function act(body) {
  try {
    const b = body && typeof body === "object" ? body : {};
    const fn = Object.prototype.hasOwnProperty.call(actions, b.action) ? actions[b.action] : null;
    if (!fn) throw new Fail(400, "Acción desconocida.");
    return { status: 200, body: { ok: true, ...(await fn(b)) } };
  } catch (e) {
    if (e instanceof Fail) return { status: e.status, body: { error: e.message } };
    console.error("cuenta:", e);
    return { status: 500, body: { error: "No se pudo completar la operación. Probá de nuevo en un rato." } };
  }
}
module.exports = { act };
