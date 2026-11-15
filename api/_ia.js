// Asistente del calendario: Claude propone qué ver y cuándo; la página muestra la propuesta
// y el usuario elige qué agregar. Nada se guarda en el calendario desde acá.
const AnthropicSDK = require("@anthropic-ai/sdk");
const Anthropic = AnthropicSDK.default || AnthropicSDK;

// A través del AI Gateway de Vercel: en producción se autentica con el token OIDC del proyecto.
const MODELS = ["anthropic/claude-opus-5-5"];
const MAX_TURNS = 12, MAX_CHARS = 1200, MAX_CATALOG = 120;

class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }

const TOOL = {
  name: "proponer_plan",
  description: "Propone al usuario títulos para agregar a su calendario, con día y hora. El usuario revisa la propuesta y elige qué agregar; no se guarda nada solo. Usala cada vez que tengas fechas concretas para sugerir, también al corregir una propuesta anterior (mandá la propuesta completa corregida).",
  input_schema: {
    type: "object",
    properties: {
      mensaje: { type: "string", description: "Explicación breve para el usuario (1 a 3 oraciones, español rioplatense, sin markdown)." },
      items: {
        type: "array",
        description: "Tandas propuestas, en orden cronológico.",
        items: {
          type: "object",
          properties: {
            titulo: { type: "string", description: "Título exacto, copiado del catálogo." },
            fecha: { type: "string", description: "Día en formato AAAA-MM-DD." },
            hora: { type: "string", description: "Hora de inicio en formato HH:MM (24 h)." },
            episodios: { type: "integer", description: "Solo para series: cuántos episodios en esta tanda. Omitir en películas." },
          },
          required: ["titulo", "fecha", "hora"],
          additionalProperties: false,
        },
      },
    },
    required: ["mensaje", "items"],
    additionalProperties: false,
  },
};

const SYSTEM = `Sos el asistente del calendario de "Tracker UCM", una página para seguir el maratón del Universo Cinematográfico de Marvel.
Ayudás a armar el calendario: el usuario te cuenta cuándo puede ver y qué quiere priorizar, y vos le proponés qué ver cada día y a qué hora.

Cómo trabajar:
- Respondé en español rioplatense (vos, tenés), corto y amable. Sin markdown.
- Cuando tengas lo necesario, llamá a la herramienta proponer_plan con fechas y horas concretas. El usuario revisa la propuesta y elige qué agregar; no prometas que ya quedó guardado.
- Si falta algo importante para proponer (por ejemplo, qué días o a qué hora puede), hacé una sola pregunta breve en vez de inventar. Si el pedido es razonablemente claro, proponé directamente con supuestos sensatos y mencionálos en el mensaje.
- Usá solo títulos del catálogo, escritos exactamente igual.
- Respetá el orden de estreno salvo que el usuario pida otra cosa. Salteá lo que ya vio, salvo que pida volver a verlo.
- No propongas títulos marcados como "próximamente" (todavía no se estrenaron).
- Las series se ven por tandas de episodios: usá "episodios" en cada tanda, sin pasarte de los que le quedan por programar. Una serie puede repartirse en varios días.
- No superpongas horarios: cada tanda empieza cuando termina la anterior del mismo día (más unos 15 minutos de pausa). Tené en cuenta lo que ya está en el calendario. Evitá terminar después de las 2 de la mañana salvo que lo pida.
- No propongas fechas anteriores a hoy.
- Como mucho unas 25 tandas por propuesta; si el plan es más largo, proponé la primera parte y ofrecé seguir.
- Si te piden algo que no tiene que ver con el calendario o con Marvel, respondé breve y volvé al tema.`;

const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
const okDate = s => /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
const okTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// Arma el contexto (catálogo, calendario actual, fecha de hoy) que manda la página.
function contextText(ctx) {
  const c = ctx && typeof ctx === "object" ? ctx : {};
  const today = okDate(c.hoy) ? c.hoy : new Date().toISOString().slice(0, 10);
  const cat = Array.isArray(c.catalogo) ? c.catalogo.slice(0, MAX_CATALOG) : [];
  const plan = Array.isArray(c.plan) ? c.plan.slice(0, 200) : [];
  const lines = cat.map(t => {
    const parts = [clip(t.titulo, 80), clip(t.fase, 30), t.anio ? String(+t.anio || "") : ""];
    if (t.serie) parts.push(`serie: ${+t.episodios || 0} episodios de ~${+t.minEp || 0} min, ya programados ${+t.programados || 0}`);
    else parts.push(`película de ${+t.minutos || 0} min`);
    if (t.vista) parts.push("YA VISTA");
    if (t.proximamente) parts.push("próximamente (no estrenada)");
    if (t.enCalendario && !t.serie) parts.push("ya tiene fecha");
    return "- " + parts.filter(Boolean).join(" · ");
  });
  const pl = plan.map(p => `- ${clip(p.fecha, 10)} ${clip(p.hora, 5) || "sin hora"} → ${clip(p.titulo, 80)}${p.episodios ? ` (${+p.episodios} ep)` : ""}, termina ${clip(p.fin, 5)}`);
  return `Hoy es ${today} (${clip(c.diaSemana, 12)}).

Catálogo, en orden de estreno:
${lines.join("\n") || "(vacío)"}

Lo que ya está en el calendario:
${pl.join("\n") || "(nada todavía)"}`;
}

function cleanTurns(turns) {
  if (!Array.isArray(turns)) throw new Fail(400, "Falta el mensaje.");
  const out = [];
  for (const t of turns.slice(-MAX_TURNS)) {
    if (!t || (t.role !== "user" && t.role !== "assistant")) continue;
    const text = clip(t.text, MAX_CHARS).trim();
    if (!text) continue;
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1].content += "\n" + text;
    else out.push({ role: t.role, content: text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") throw new Fail(400, "Falta el mensaje.");
  return out;
}

function cleanItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).map(i => ({
    titulo: clip(i && i.titulo, 100),
    fecha: clip(i && i.fecha, 10),
    hora: clip(i && i.hora, 5),
    ...(Number.isInteger(i && i.episodios) && i.episodios > 0 ? { episodios: Math.min(i.episodios, 60) } : {}),
  })).filter(i => i.titulo && okDate(i.fecha) && okTime(i.hora));
}

let client = null;
function getClient(oidc) {
  const apiKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || oidc;
  if (!apiKey) throw new Fail(503, "La IA no está configurada en el servidor.");
  if (!client || client._key !== apiKey) { client = new Anthropic({ apiKey, baseURL: "https://ai-gateway.vercel.sh", maxRetries: 1, timeout: 90e3 }); client._key = apiKey; }
  return client;
}

async function ask(body, oidc) {
  try {
    const b = body && typeof body === "object" ? body : {};
    const turns = cleanTurns(b.turnos);
    const ctx = contextText(b.contexto);
    // El contexto va como primer bloque del primer mensaje del usuario (cambia con cada pedido).
    turns[0] = { role: "user", content: [{ type: "text", text: ctx }, { type: "text", text: turns[0].content }] };
    const c = getClient(oidc);
    let res = null, lastErr = null;
    for (const model of MODELS) {
      try {
        res = await c.messages.create({
          model, max_tokens: 12000,
          system: SYSTEM, tools: [TOOL], tool_choice: { type: "auto" },
          messages: turns,
        });
        break;
      } catch (e) {
        lastErr = e;
        if (e instanceof Anthropic.NotFoundError || e instanceof Anthropic.BadRequestError) continue; // probá el siguiente modelo
        throw e;
      }
    }
    if (!res) throw lastErr || new Error("sin respuesta");
    if (res.stop_reason === "refusal") return { status: 200, body: { ok: true, reply: "Eso no lo puedo ayudar a armar. Contame qué días y horarios tenés libres y te propongo un plan.", items: [] } };
    let reply = "", items = [];
    for (const blk of res.content) {
      if (blk.type === "text") reply += (reply ? "\n" : "") + blk.text.trim();
      if (blk.type === "tool_use" && blk.name === "proponer_plan" && blk.input && typeof blk.input === "object") {
        if (blk.input.mensaje) reply = String(blk.input.mensaje).trim() + (reply ? "\n" + reply : "");
        items = cleanItems(blk.input.items);
      }
    }
    if (res.stop_reason === "max_tokens" && !items.length) reply = reply || "Se me hizo muy largo el plan. Probá pedirme una parte (por ejemplo, una fase o una semana).";
    return { status: 200, body: { ok: true, reply: clip(reply, 1500) || "Listo, mirá la propuesta.", items } };
  } catch (e) {
    if (e instanceof Fail) return { status: e.status, body: { error: e.message } };
    if (e instanceof Anthropic.RateLimitError) return { status: 429, body: { error: "La IA está con mucha demanda. Probá de nuevo en un minuto." } };
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) { console.error("ia auth:", e.status, e.message); return { status: 503, body: { error: "La IA no está disponible en este momento." } }; }
    if (e instanceof Anthropic.APIError) { console.error("ia api:", e.status, e.message); return { status: 502, body: { error: "La IA no respondió bien. Probá de nuevo." } }; }
    console.error("ia:", e);
    return { status: 500, body: { error: "No se pudo hablar con la IA. Probá de nuevo en un rato." } };
  }
}
// Chequeo: una consulta mínima para saber si la IA responde con las credenciales del servidor.
async function health(oidc) {
  try {
    const r = await getClient(oidc).messages.create({ model: MODELS[0], max_tokens: 400, messages: [{ role: "user", content: "Respondé solo: ok" }] });
    return { status: 200, body: { ok: true, model: r.model, stop: r.stop_reason } };
  } catch (e) {
    return { status: 502, body: { ok: false, type: e && e.constructor && e.constructor.name, status: e && e.status, error: String(e && e.message || e).slice(0, 300) } };
  }
}
module.exports = { ask, health, contextText, cleanTurns, cleanItems };
