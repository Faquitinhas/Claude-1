// POST /api/ia  { turnos: [{role, text}], contexto: {...} } -> { reply, items }
const { ask, health } = require("./_ia.js");

// Freno simple contra abusos: pocas consultas por minuto por conexión (por instancia).
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60e3);
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();
  return h.length > 8;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "?";
  if (req.method === "GET" && req.query && req.query.health !== undefined) {
    if (limited(ip)) return res.status(429).json({ error: "Esperá un minuto." });
    const h = await health(req.headers["x-vercel-oidc-token"]); return res.status(h.status).json(h.body);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Usá POST." });
  if (limited(ip)) return res.status(429).json({ error: "Muchas consultas seguidas. Esperá un minuto." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const r = await ask(body, req.headers["x-vercel-oidc-token"]);
  res.status(r.status).json(r.body);
};
