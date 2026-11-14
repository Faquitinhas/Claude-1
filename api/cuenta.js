// POST /api/cuenta  { action: "register" | "login" | "get" | "save" | "delete", ... }
const { act } = require("./_cuenta.js");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Usá POST." });
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const r = await act(body);
  res.status(r.status).json(r.body);
};
