// Asistente del calendario con una IA gratuita (sin cuenta ni clave).
// La IA solo traduce el pedido del usuario a preferencias (qué días, a qué hora, qué fases...);
// la página arma las fechas con esas preferencias y el usuario elige qué agregar.
const PROVIDERS = [
  { name: "llm7", url: "https://api.llm7.io/v1/chat/completions", body: m => ({ model: "default", messages: m, max_tokens: 1200 }), timeout: 25e3 },
  { name: "pollinations", url: "https://text.pollinations.ai/openai", body: m => ({ model: "openai", messages: m, max_tokens: 3000, referrer: "tracker-ucm" }), timeout: 30e3 },
];
const MAX_TURNS = 10, MAX_CHARS = 1200;
const DIAS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const SYSTEM = `Sos el asistente del calendario de "Tracker UCM", una página para seguir el maratón del Universo Cinematográfico de Marvel.
El usuario te cuenta cuándo puede ver y qué quiere priorizar. Vos NO calculás fechas ni armás la lista: solo traducís el pedido a preferencias, y la página arma el calendario con eso. Después el usuario elige qué agregar.

Respondé SOLO con un objeto JSON válido, sin texto antes ni después y sin markdown, con estas claves:
- "mensaje": texto breve para el usuario, en español rioplatense (vos, tenés), sin markdown. Contá qué vas a armar, o hacé UNA pregunta corta si falta algo importante.
- "listo": true si ya se puede armar la propuesta; false si necesitás preguntar algo antes.
- "desde": fecha de inicio AAAA-MM-DD (si no la dice, mañana).
- "hasta": fecha límite AAAA-MM-DD, o null si no hay.
- "horarios": lista de {"dias": lista con algunos de "lun","mar","mie","jue","vie","sab","dom"; "hora": "HH:MM"; "cantidad": cuántas pelis o tandas de serie seguidas ese día}. Entre semana = lun a vie. Finde = sab y dom. "A la noche" = 21:00, "a la tarde" = 16:00, "a la mañana" = 10:00, si no dice hora.
- "fases": fases a incluir, por ejemplo ["Fase 4"], o [] para todas en orden de estreno.
- "titulos": títulos puntuales a incluir, copiados exactos del catálogo, o [].
- "series": true para incluir series, false para solo películas (por defecto true).
- "episodiosPorTanda": episodios por tanda de serie (por defecto 2).
- "xmen": true solo si pide la saga X-Men.
- "revistas": true solo si quiere volver a ver lo que ya vio.
- "fijos": pedidos para un día concreto, como [{"titulo":"WandaVision","dia":"dom","hora":"21:00","episodios":3}] (también podés usar "fecha":"AAAA-MM-DD" en vez de "dia"), o [].

Si el usuario pide un cambio sobre lo anterior, devolvé las preferencias completas actualizadas (no solo el cambio).
Si pregunta algo que no tiene que ver con el calendario o con Marvel, contestá breve en "mensaje" con "listo": false.`;

const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const okDate = s => typeof s === "string" && /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
const okTime = s => typeof s === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(s);
const hhmm = s => okTime(s) ? s.padStart(5, "0") : null;
const int = (v, a, b, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };

function contextText(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const hoy = okDate(c.hoy) ? c.hoy : new Date().toISOString().slice(0, 10);
  const prox = Array.isArray(c.proximos) ? c.proximos.slice(0, 21).map(x => clip(x, 16)).join(", ") : "";
  const fases = Array.isArray(c.fases) ? c.fases.slice(0, 12).map(x => clip(x, 20)).join(", ") : "";
  const tit = Array.isArray(c.titulos) ? c.titulos.slice(0, 120).map(x => clip(x, 90)).join("; ") : "";
  return `Hoy es ${hoy} (${clip(c.diaSemana, 12)}). Próximos días: ${prox}.
Fases: ${fases}.
Catálogo en orden de estreno (las series dicen "serie"): ${tit}.
${c.resumen ? "Situación del usuario: " + clip(c.resumen, 400) : ""}`;
}

function cleanTurns(turns) {
  if (!Array.isArray(turns)) throw new Fail(400, "Falta el mensaje.");
  const out = [];
  for (const t of turns.slice(-MAX_TURNS)) {
    if (!t || (t.role !== "user" && t.role !== "assistant")) continue;
    const text = clip(t.text, t.role === "assistant" ? 2500 : MAX_CHARS).trim();
    if (!text) continue;
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1].content += "\n" + text;
    else out.push({ role: t.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") throw new Fail(400, "Falta el mensaje.");
  return out;
}

// Saca el primer objeto JSON de la respuesta (algunas IAs lo envuelven en ```json)
function parseJSON(text) {
  const s = String(text || "").replace(/```(?:json)?/gi, "");
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}

// Deja solo valores con sentido; la página vuelve a validar todo
function cleanSpec(j) {
  const o = j && typeof j === "object" ? j : {};
  const dias = a => (Array.isArray(a) ? a : [a]).map(x => clip(x, 4).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(0, 3)).filter(x => DIAS.includes(x));
  const horarios = (Array.isArray(o.horarios) ? o.horarios : []).slice(0, 14).map(h => ({ dias: [...new Set(dias(h && h.dias))], hora: hhmm(h && h.hora) || "21:00", cantidad: int(h && h.cantidad, 1, 6, 1) })).filter(h => h.dias.length);
  const fijos = (Array.isArray(o.fijos) ? o.fijos : []).slice(0, 20).map(f => ({
    titulo: clip(f && f.titulo, 100), ...(okDate(f && f.fecha) ? { fecha: f.fecha } : {}), ...(dias(f && f.dia)[0] ? { dia: dias(f.dia)[0] } : {}),
    ...(hhmm(f && f.hora) ? { hora: hhmm(f.hora) } : {}), ...(f && f.episodios ? { episodios: int(f.episodios, 1, 20, 2) } : {}),
  })).filter(f => f.titulo);
  return {
    listo: o.listo !== false && (horarios.length > 0 || fijos.length > 0),
    desde: okDate(o.desde) ? o.desde : null,
    hasta: okDate(o.hasta) ? o.hasta : null,
    horarios, fijos,
    fases: (Array.isArray(o.fases) ? o.fases : []).slice(0, 12).map(x => clip(x, 20)),
    titulos: (Array.isArray(o.titulos) ? o.titulos : []).slice(0, 60).map(x => clip(x, 100)),
    series: o.series !== false,
    episodiosPorTanda: int(o.episodiosPorTanda, 1, 12, 2),
    xmen: o.xmen === true,
    revistas: o.revistas === true,
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function callProvider(p, messages) {
  for (let i = 0; i < 2; i++) {
    const r = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.body(messages)), signal: AbortSignal.timeout(p.timeout) });
    const text = await r.text();
    if (r.status === 429 && i === 0) { // límite por conexión: esperar un poco y reintentar una vez
      let s = 4; try { s = +JSON.parse(text).error.retry_after || 4; } catch (e) {}
      await wait(Math.min(8, Math.max(1, s)) * 1000); continue;
    }
    if (!r.ok) throw new Error(`${p.name} ${r.status}: ${text.slice(0, 200)}`);
    const j = JSON.parse(text), content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error(`${p.name}: respuesta vacía`);
    return content;
  }
  throw new Error(`${p.name}: sin turno`);
}

async function ask(body) {
  try {
    const b = body && typeof body === "object" ? body : {};
    const turns = cleanTurns(b.turnos);
    const messages = [{ role: "system", content: SYSTEM + "\n\n" + contextText(b.contexto) }, ...turns];
    let spec = null, raw = "", errs = [];
    for (const p of PROVIDERS) {
      try {
        raw = await callProvider(p, messages);
        const j = parseJSON(raw);
        if (j) { spec = { mensaje: clip(j.mensaje, 800).trim(), ...cleanSpec(j) }; break; }
        errs.push(p.name + ": no devolvió JSON");
      } catch (e) { errs.push(String(e && e.message || e).slice(0, 200)); }
    }
    if (!spec) {
      console.error("ia:", errs.join(" | "));
      return { status: 502, body: { error: "La IA gratuita no respondió. Probá de nuevo en unos segundos." } };
    }
    return { status: 200, body: { ok: true, reply: spec.mensaje || (spec.listo ? "Te armé una propuesta." : "¿Me contás qué días y a qué hora podés?"), spec } };
  } catch (e) {
    if (e instanceof Fail) return { status: e.status, body: { error: e.message } };
    console.error("ia:", e);
    return { status: 500, body: { error: "No se pudo hablar con la IA. Probá de nuevo en un rato." } };
  }
}

// Chequeo: pregunta algo mínimo para saber si la IA gratuita responde
async function health() {
  const out = {};
  for (const p of PROVIDERS.slice(0, 1)) {
    const t = Date.now();
    try { const c = await callProvider(p, [{ role: "user", content: 'Respondé solo con este JSON: {"ok":true}' }]); out[p.name] = { ok: !!parseJSON(c), ms: Date.now() - t }; }
    catch (e) { out[p.name] = { ok: false, ms: Date.now() - t, error: String(e && e.message || e).slice(0, 200) }; }
  }
  return { status: 200, body: out };
}
module.exports = { ask, health, contextText, cleanTurns, cleanSpec, parseJSON };
