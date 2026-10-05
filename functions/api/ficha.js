/**
 * Cloudflare Pages Function — POST /api/ficha
 * Recibe la ficha de instalación en línea, valida Turnstile y los campos
 * obligatorios, y la reenvía a Discord (webhook) y, si está configurado,
 * por correo con Resend.
 *
 * Variables de entorno:
 *   TURNSTILE_SECRET         (obligatoria)
 *   DISCORD_FICHAS_WEBHOOK   (obligatoria)
 *   RESEND_API_KEY           (opcional: sin ella no se envía correo)
 *   FICHA_EMAIL_FROM         (remitente verificado en Resend)
 *   FICHA_EMAIL_TO           (destinatario de la copia por correo)
 *
 * Nunca se registra en logs el contenido de la ficha.
 */

const MAX_BODY = 20 * 1024; // ~20 KB
const ALLOWED_ORIGINS = ["https://pos.globanzer.com"];
const PAGES_DEV = /^https:\/\/([a-z0-9-]+\.)*[a-z0-9-]+\.pages\.dev$/i;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RIF = /^[VEJPGC][-\s.]?\d{5,9}[-\s.]?\d?$/i;

/* Esquema: [clave, etiqueta, largo máximo]. El orden es el de la ficha impresa. */
const SECTIONS = [
  {
    title: "A. El negocio",
    fields: [
      ["razon_social", "1. Razón social", 200],
      ["rif", "2. RIF", 20],
      ["nombre_comercial", "3. Nombre comercial (ticket)", 120],
      ["direccion", "4. Dirección fiscal", 400],
      ["telefono_negocio", "5. Teléfono del negocio", 30],
      ["correo_negocio", "5. Correo del negocio", 120],
      ["logo", "6. Logo para el ticket", 10],
      ["contribuyente_especial", "7. Contribuyente especial SENIAT", 10],
      ["divisas_efectivo", "8. Cobra en divisas en efectivo o fuera del banco", 10],
    ],
  },
  {
    title: "B. Tiendas y cajas",
    fields: [
      ["tiendas", "9. Tiendas", 10],
      ["tiendas_cuantas", "9. ¿Cuántas?", 10],
      ["tienda_adicional_tipo", "10. Inventario de tiendas adicionales", 200],
      ["tiendas_adicionales", "10. Tiendas adicionales (nombre y dirección)", 800],
      ["cajas", "11. Cajas por tienda", 600],
    ],
  },
  {
    title: "C. Personas",
    fields: [
      ["dueno_nombre", "12. Dueño: nombre", 120],
      ["dueno_telefono", "12. Dueño: teléfono", 30],
      ["dueno_correo", "12. Dueño: correo (acceso)", 120],
      ["otra_persona", "13. ¿Otra persona hablará con el asistente?", 10],
      ["otra_nombre_telefono", "13. Nombre y teléfono", 160],
      ["otra_nivel", "13. Nivel", 60],
      ["cajeros", "14. Cajeros", 0],
    ],
  },
  {
    title: "D. Cobros",
    fields: [
      ["recibo_nombre", "15. Recibo de la mensualidad a nombre de", 200],
      ["forma_pago", "15. ¿Cómo pagará?", 60],
    ],
  },
  {
    title: "E. Productos",
    fields: [
      ["productos_cantidad", "16. Cantidad de productos", 30],
      ["catalogo", "17. Catálogo", 60],
      ["catalogo_sistema", "17. Sistema actual", 80],
      ["precios_moneda", "18. Precios en", 20],
      ["exentos_iva", "19. Productos exentos de IVA", 20],
      ["exentos_lista", "19. Lista de exentos", 800],
      ["existencias", "20. Existencias", 60],
      ["conteo_fecha", "20. Fecha del conteo", 10],
    ],
  },
  {
    title: "F. Equipos",
    fields: [
      ["computadoras", "21. Computadoras por caja", 400],
      ["impresora", "22. Impresora de tickets", 10],
      ["impresora_modelo", "22. Marca y modelo", 80],
      ["impresora_papel", "22. Papel", 10],
      ["lector_barras", "23. Lector de códigos de barras", 10],
      ["maquina_fiscal", "24. Máquina fiscal (referencia)", 10],
      ["maquina_fiscal_modelo", "24. Marca y modelo", 80],
    ],
  },
  {
    title: "G. Servicio",
    fields: [
      ["respaldo", "25. Respaldo semanal automático (20 USD/mes)", 10],
      ["respaldo_riesgo", "25. Entiende el riesgo sin respaldo", 0],
      ["horario", "26. Horario del negocio", 160],
      ["uso_asistente", "27. Uso del asistente: entendido", 0],
      ["seguridad", "28. Nunca pedimos contraseñas ni códigos: entendido", 0],
    ],
  },
  {
    title: "Declaración",
    fields: [
      ["fecha", "Fecha", 10],
      ["declarante", "Nombre del dueño", 120],
      ["declaracion", "Declara que los datos son correctos y leyó 25, 27 y 28", 0],
    ],
  },
];

const BOOLEAN_KEYS = new Set(["respaldo_riesgo", "uso_asistente", "seguridad", "declaracion"]);
const REQUIRED_TEXT = [
  "razon_social", "rif", "nombre_comercial", "direccion", "telefono_negocio", "correo_negocio",
  "dueno_nombre", "dueno_telefono", "dueno_correo",
];
// Campos que ya no se piden (el usuario de Discord lo gestiona Globanzer POS y los
// permisos de cajero se configuran aparte). Si un cliente viejo los envía, se ignoran.

/* ---------------- utilidades ---------------- */

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function originAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || PAGES_DEV.test(origin);
}

/** Texto limpio: sin caracteres de control, espacios colapsados, recortado al máximo. */
function clean(value, max) {
  if (typeof value !== "string") return "";
  let s = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function normalize(raw) {
  const out = {};
  for (const sec of SECTIONS) {
    for (const [key, , max] of sec.fields) {
      if (key === "cajeros") continue;
      const v = raw[key];
      if (BOOLEAN_KEYS.has(key)) {
        out[key] = v === true;
      } else if (key === "tienda_adicional_tipo") {
        out[key] = Array.isArray(v) ? v.slice(0, 2).map((x) => clean(x, 80)).filter(Boolean) : [];
      } else {
        out[key] = clean(v, max);
      }
    }
  }
  out.rif = out.rif.toUpperCase();
  const cajeros = Array.isArray(raw.cajeros) ? raw.cajeros.slice(0, 6) : [];
  out.cajeros = cajeros
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      nombre: clean(c.nombre, 120),
      correo: clean(c.correo, 120),
      caja: clean(c.caja, 60),
    }))
    .filter((c) => c.nombre || c.correo || c.caja);
  return out;
}

function validate(d) {
  for (const k of REQUIRED_TEXT) {
    if (!d[k]) return "Falta un dato obligatorio de la ficha.";
  }
  if (!RIF.test(d.rif)) return "Revisa el RIF.";
  if (!EMAIL.test(d.correo_negocio) || !EMAIL.test(d.dueno_correo)) return "Revisa los correos de la ficha.";
  if (d.respaldo !== "Sí" && d.respaldo !== "No") return "Falta la respuesta del punto 25 (respaldo).";
  if (d.respaldo === "No" && !d.respaldo_riesgo) return "Falta confirmar el punto 25.";
  if (!d.uso_asistente || !d.seguridad) return "Falta confirmar los puntos 27 y 28.";
  if (!d.declaracion) return "Falta marcar la declaración final.";
  return "";
}

function display(key, value) {
  if (BOOLEAN_KEYS.has(key)) return value ? "Sí" : "";
  if (Array.isArray(value)) return value.join("; ");
  return value || "";
}

function cajeroLine(c, i) {
  return `${i + 1}) ${c.nombre || "(sin nombre)"} · ${c.correo || "(sin correo)"} · caja: ${c.caja || "-"}`;
}

/** Secciones como pares [etiqueta, valor] (solo con valor). */
function rows(d) {
  return SECTIONS.map((sec) => {
    const items = [];
    for (const [key, label] of sec.fields) {
      if (key === "cajeros") {
        if (d.cajeros.length) items.push([label, d.cajeros.map(cajeroLine).join("\n")]);
        continue;
      }
      const v = display(key, d[key]);
      if (v) items.push([label, v]);
    }
    return { title: sec.title, items };
  }).filter((s) => s.items.length);
}

/* ---------------- Discord ---------------- */

// Evita que el texto del cliente rompa el formato del mensaje.
function mdEscape(s) {
  return String(s).replace(/([\\`*_~|>#\[\]()-])/g, "\\$1"); // las menciones ya quedan desactivadas con allowed_mentions
}

function buildEmbeds(d) {
  const embeds = [];
  for (const sec of rows(d)) {
    let desc = "";
    let part = 1;
    const flush = () => {
      if (!desc) return;
      embeds.push({
        title: part > 1 ? `${sec.title} (cont.)` : sec.title,
        description: desc,
        color: 0x4f7cff,
      });
      part += 1;
      desc = "";
    };
    for (const [label, value] of sec.items) {
      let line = `**${mdEscape(label)}:** ${mdEscape(value)}\n`;
      if (line.length > 3800) line = line.slice(0, 3800) + "…\n";
      if (desc.length + line.length > 3900) flush();
      desc += line;
    }
    flush();
  }
  return embeds;
}

/** Agrupa embeds en mensajes: máx. 10 embeds y ~5.800 caracteres por mensaje. */
function packMessages(embeds, header) {
  const size = (e) => (e.title || "").length + (e.description || "").length;
  const messages = [];
  let current = [];
  let total = 0;
  for (const e of embeds) {
    if (current.length && (current.length >= 10 || total + size(e) > 5800)) {
      messages.push(current);
      current = [];
      total = 0;
    }
    current.push(e);
    total += size(e);
  }
  if (current.length) messages.push(current);
  return messages.map((group, i) => ({
    content: i === 0 ? header : `(continuación ${i + 1}/${messages.length})`,
    embeds: group,
    allowed_mentions: { parse: [] },
  }));
}

async function postDiscord(webhook, payload) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return true;
    if (res.status === 429 && attempt === 0) {
      let wait = 1;
      try { wait = Number((await res.json()).retry_after) || 1; } catch (_) { /* ignore */ }
      await new Promise((r) => setTimeout(r, Math.min(wait, 5) * 1000));
      continue;
    }
    console.error("ficha: Discord webhook respondió", res.status);
    return false;
  }
  return false;
}

async function sendDiscord(env, d) {
  const webhook = env.DISCORD_FICHAS_WEBHOOK;
  if (!webhook) {
    console.error("ficha: falta DISCORD_FICHAS_WEBHOOK");
    return false;
  }
  const header = `Nueva ficha de instalación: ${mdEscape(d.nombre_comercial)} (${mdEscape(d.rif)})`.slice(0, 1900);
  const messages = packMessages(buildEmbeds(d), header);
  for (const m of messages) {
    if (!(await postDiscord(webhook, m))) return false;
  }
  return true;
}

/* ---------------- Correo (Resend) ---------------- */

function htmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function buildEmail(d) {
  const secs = rows(d);
  const text = secs
    .map((s) => `${s.title}\n` + s.items.map(([l, v]) => `- ${l}: ${v}`).join("\n"))
    .join("\n\n");
  const html =
    `<div style="font-family:Arial,sans-serif;color:#111;line-height:1.5">` +
    `<h1 style="font-size:20px">Nueva ficha de instalación</h1>` +
    secs
      .map(
        (s) =>
          `<h2 style="font-size:16px;margin:20px 0 6px;color:#4F46E5">${htmlEscape(s.title)}</h2>` +
          `<table style="border-collapse:collapse;width:100%">` +
          s.items
            .map(
              ([l, v]) =>
                `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee;vertical-align:top;width:40%;color:#555">${htmlEscape(l)}</td>` +
                `<td style="padding:4px 8px;border-bottom:1px solid #eee;white-space:pre-wrap">${htmlEscape(v)}</td></tr>`
            )
            .join("") +
          `</table>`
      )
      .join("") +
    `</div>`;
  return { text, html };
}

async function sendEmail(env, d) {
  if (!env.RESEND_API_KEY) return null; // correo desactivado: se omite en silencio
  if (!env.FICHA_EMAIL_FROM || !env.FICHA_EMAIL_TO) {
    console.error("ficha: falta FICHA_EMAIL_FROM o FICHA_EMAIL_TO");
    return false;
  }
  const { text, html } = buildEmail(d);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FICHA_EMAIL_FROM,
      to: env.FICHA_EMAIL_TO.split(",").map((s) => s.trim()).filter(Boolean),
      reply_to: d.dueno_correo,
      subject: `Ficha de instalación: ${d.nombre_comercial} (${d.rif})`.replace(/[\r\n]+/g, " ").slice(0, 200),
      text,
      html,
    }),
  });
  if (!res.ok) console.error("ficha: Resend respondió", res.status);
  return res.ok;
}

/* ---------------- Turnstile ---------------- */

async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) {
    console.error("ficha: falta TURNSTILE_SECRET");
    return false;
  }
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = await res.json();
    return out && out.success === true;
  } catch (_) {
    console.error("ficha: no se pudo verificar Turnstile");
    return false;
  }
}

/* ---------------- Handler ---------------- */

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (!originAllowed(origin)) {
    return json({ ok: false, error: "Origen no permitido." }, 403);
  }

  const type = request.headers.get("Content-Type") || "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, error: "Formato no válido." }, 415);
  }

  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY) {
    return json({ ok: false, error: "La ficha es demasiado grande." }, 413);
  }

  let raw;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) {
      return json({ ok: false, error: "La ficha es demasiado grande." }, 413);
    }
    raw = JSON.parse(text);
  } catch (_) {
    return json({ ok: false, error: "No pudimos leer la ficha." }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ ok: false, error: "No pudimos leer la ficha." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!(await verifyTurnstile(env, raw.turnstile_token, ip))) {
    return json({ ok: false, error: "No pudimos verificar que eres una persona. Recarga la página e intenta de nuevo." }, 403);
  }

  const data = normalize(raw);
  const problem = validate(data);
  if (problem) {
    return json({ ok: false, error: problem }, 422);
  }

  let discordOk = false;
  let emailOk = null;
  try {
    [discordOk, emailOk] = await Promise.all([
      sendDiscord(env, data).catch(() => false),
      sendEmail(env, data).catch(() => false),
    ]);
  } catch (_) {
    discordOk = false;
  }

  if (discordOk || emailOk === true) {
    return json({ ok: true });
  }
  return json({ ok: false, error: "No pudimos registrar tu ficha en este momento." }, 502);
}

