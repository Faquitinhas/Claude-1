// Puntajes y favoritas guardados en Upstash Redis (Vercel Marketplace).
// GET  /api/votos            -> { on:true } si Redis está conectado; 501 si no (la app usa el contador viejo)
// GET  /api/votos?s=<slug>   -> { c:[10 conteos], f:favoritas }
// POST /api/votos { s, k }   -> suma 1 a k: "1".."10" (puntaje), "fav"; con "-x" al final resta 1
// La primera vez que se toca una peli se copian sus números del contador viejo (Abacus), así no se pierde nada.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const AB = "https://abacus.jasoncameron.dev/get/ucm-facas-tracker-v3/";
const F = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "fav"];
const okSlug = s => typeof s === "string" && /^[a-z0-9-]{2,90}$/.test(s);

async function rd(cmds) {
  const r = await fetch(URL_ + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + TOK, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("redis " + r.status);
  const j = await r.json();
  return j.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

async function abGet(k) {
  for (let a = 0; a < 3; a++) {
    try {
      const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
      const r = await fetch(AB + k, { signal: c.signal }).finally(() => clearTimeout(t));
      if (r.status === 404) return 0;
      if (r.ok) return +(await r.json()).value || 0;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 800 * (a + 1)));
  }
  throw new Error("abacus");
}

// Copia los números del contador viejo una sola vez por peli
async function migrate(s) {
  const [done] = await rd([["EXISTS", "m:" + s]]);
  if (done) return;
  let vals = null;
  try {
    const batch = async ks => { const o = []; for (let i = 0; i < ks.length; i += 4) o.push(...await Promise.all(ks.slice(i, i + 4).map(k => k ? abGet(k) : 0))); return o; };
    const base = await batch(F.map(f => s + "-" + f));
    const sub = await batch(F.map((f, i) => base[i] > 0 ? s + "-" + f + "-x" : null));
    vals = F.map((f, i) => Math.max(0, base[i] - sub[i]));
  } catch (e) { vals = null; }
  if (!vals) return; // si el contador viejo no responde, se intenta de nuevo la próxima vez
  const [got] = await rd([["SET", "m:" + s, "1", "NX"]]);
  if (got !== "OK") return; // otro pedido ya lo migró
  const cmds = [];
  F.forEach((f, i) => { if (vals[i]) cmds.push(["HINCRBY", "v:" + s, f, String(vals[i])]); });
  if (cmds.length) await rd(cmds);
}

async function read(s) {
  const [arr] = await rd([["HMGET", "v:" + s, ...F]]);
  const n = (arr || []).map(x => Math.max(0, +x || 0));
  return { c: n.slice(0, 10), f: n[10] || 0 };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOK) return res.status(501).json({ on: false });
  try {
    if (req.method === "GET") {
      const s = req.query && req.query.s;
      if (!s) return res.status(200).json({ on: true });
      if (!okSlug(s)) return res.status(400).json({ error: "peli inválida" });
      await migrate(s);
      return res.status(200).json(await read(s));
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Usá GET o POST." });
    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = null; } }
    const s = b && b.s, k = String((b && b.k) || "");
    const m = /^(10|[1-9]|fav)(-x)?$/.exec(k);
    if (!okSlug(s) || !m) return res.status(400).json({ error: "pedido inválido" });
    await migrate(s);
    await rd([["HINCRBY", "v:" + s, m[1], m[2] ? "-1" : "1"]]);
    return res.status(200).json(await read(s));
  } catch (e) {
    return res.status(503).json({ error: "No se pudo usar la base de puntajes." });
  }
};
