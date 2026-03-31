// api/telegram.js — Bot de Telegram con IA y audio para Mesón do Loyo

import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set, get } from "firebase/database";

const firebaseConfig = {
  apiKey:            "AIzaSyBTVC5mQAW2hmKX5Bo6iFlXDpgtB0cBvUE",
  authDomain:        "meson-loyo.firebaseapp.com",
  databaseURL:       "https://meson-loyo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "meson-loyo",
  storageBucket:     "meson-loyo.firebasestorage.app",
  messagingSenderId: "1052148784587",
  appId:             "1:1052148784587:web:752862e39c5345660caa4e",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getDatabase(app);

const BOT_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const AUTHORIZED_IDS = (process.env.TELEGRAM_AUTHORIZED_IDS || "").split(",").map(id => id.trim());

async function sendTelegram(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text: texto, parse_mode: "HTML" })
  });
}

function fmtFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fechaLegible(fechaStr) {
  if (!fechaStr) return "sin fecha";
  const dias  = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const meses = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const d = new Date(fechaStr + "T12:00:00");
  return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]}`;
}

// ── Descargar audio de Telegram ───────────────────────────────────────────
async function descargarAudio(fileId) {
  const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const info    = await infoRes.json();
  if (!info.ok) return null;
  const filePath = info.result.file_path;
  const audioRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
  const buffer   = await audioRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ── Prompt común para extraer reserva ────────────────────────────────────
function promptReserva(hoy) {
  const manana = fmtFecha(new Date(Date.now() + 86400000));
  return `Hoy es ${hoy}. Extrae los datos de reserva de restaurante. Responde SOLO con JSON válido sin texto adicional:
{
  "nombre": "nombre del cliente o null",
  "fecha": "YYYY-MM-DD o null",
  "hora": "HH:MM en 24h o null",
  "personas": numero entero o null,
  "telefono": "numero sin espacios o null",
  "notas": "notas adicionales o null",
  "esReserva": true o false
}
Reglas fecha: "mañana"=${manana}, "hoy"=${hoy}, "domingo/lunes/etc"=próximo ese día de semana, "el 15"=próximo día 15.
Reglas hora: "2 de la tarde"=14:00, "9 de la noche"=21:00, "mediodía"=13:00, "1 y media"=13:30.`;
}

// ── Parsear texto con IA ──────────────────────────────────────────────────
async function parsearTexto(texto) {
  const hoy = fmtFecha(new Date());
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages:   [{ role: "user", content: `${promptReserva(hoy)}\n\nMensaje de texto: "${texto}"` }]
    })
  });
  const data = await res.json();
  const raw  = data.content?.[0]?.text || "{}";
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { esReserva: false }; }
}

// ── Parsear audio con IA ──────────────────────────────────────────────────
async function parsearAudio(audioBase64, mimeType = "audio/ogg") {
  const hoy = fmtFecha(new Date());
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          {
            type:   "document",
            source: { type: "base64", media_type: mimeType, data: audioBase64 }
          },
          {
            type: "text",
            text: `${promptReserva(hoy)}\n\nEscucha el audio y extrae los datos de la reserva.`
          }
        ]
      }]
    })
  });
  const data = await res.json();
  const raw  = data.content?.[0]?.text || "{}";
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { esReserva: false }; }
}

// ── Confirmar y guardar reserva ───────────────────────────────────────────
async function guardarReserva(chatId, datos) {
  const faltantes = [];
  if (!datos.nombre)   faltantes.push("nombre del cliente");
  if (!datos.fecha)    faltantes.push("fecha");
  if (!datos.hora)     faltantes.push("hora");
  if (!datos.personas) faltantes.push("número de personas");

  if (faltantes.length > 0) {
    await sendTelegram(chatId,
      `⚠️ Casi lo tengo, pero me falta: <b>${faltantes.join(", ")}</b>.\n\nRepítemelo añadiendo esa información.`
    );
    return;
  }

  const id = Date.now();
  await set(ref(db, `reservas/${id}`), {
    id,
    nombre:    datos.nombre,
    fecha:     datos.fecha,
    hora:      datos.hora,
    personas:  datos.personas,
    telefono:  datos.telefono || "",
    notas:     datos.notas   || "",
    creadoPor: "telegram"
  });

  await sendTelegram(chatId,
    `✅ <b>Reserva guardada</b>\n\n` +
    `👤 ${datos.nombre}\n` +
    `📅 ${fechaLegible(datos.fecha)} a las ${datos.hora}\n` +
    `👥 ${datos.personas} persona${datos.personas !== 1 ? "s" : ""}` +
    `${datos.telefono ? "\n📞 " + datos.telefono : ""}` +
    `${datos.notas    ? "\n💬 " + datos.notas    : ""}`
  );
}

// ── Handler principal ─────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  try {
    const { message } = req.body;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const nombre = message.from.first_name || "";
    const texto  = message.text || "";

    // Autorización
    if (AUTHORIZED_IDS.length > 0 && !AUTHORIZED_IDS.includes(userId)) {
      await sendTelegram(chatId, "❌ No tienes permiso para usar este bot.");
      return res.status(200).json({ ok: true });
    }

    // /start o /ayuda
    if (texto.startsWith("/start") || texto.startsWith("/ayuda")) {
      await sendTelegram(chatId,
        `🍽️ <b>Bot de reservas — Mesón do Loyo</b>\n\nHola ${nombre}! Puedes escribirme o mandarme un <b>audio</b> con la reserva como quieras:\n\n` +
        `• <i>"Mesa para 4 el domingo a las 13:30, a nombre de José, tel 666123456"</i>\n` +
        `• <i>"El sábado viene una familia de 6 a las 2 de la tarde, García, terraza"</i>\n` +
        `• 🎤 <i>O simplemente mándame un audio diciéndomelo</i>\n\n` +
        `Comandos:\n/lista — reservas de hoy\n/reservas YYYY-MM-DD — reservas de un día`
      );
      return res.status(200).json({ ok: true });
    }

    // /lista
    if (texto.startsWith("/lista")) {
      const snap = await get(ref(db, "reservas"));
      const todas = snap.val() ? Object.values(snap.val()) : [];
      const hoyStr = fmtFecha(new Date());
      const hoy = todas.filter(r => r.fecha === hoyStr).sort((a,b) => a.hora > b.hora ? 1 : -1);
      if (hoy.length === 0) {
        await sendTelegram(chatId, "📋 No hay reservas para hoy.");
      } else {
        const lista  = hoy.map(r => `• <b>${r.hora}</b> — ${r.nombre}, ${r.personas} pax${r.telefono ? " ("+r.telefono+")" : ""}${r.notas ? "\n  💬 "+r.notas : ""}`).join("\n");
        const total  = hoy.reduce((s,r) => s + parseInt(r.personas||0), 0);
        await sendTelegram(chatId, `📋 <b>Reservas de hoy:</b>\n\n${lista}\n\n👥 Total: ${total} personas`);
      }
      return res.status(200).json({ ok: true });
    }

    // /reservas YYYY-MM-DD
    if (texto.startsWith("/reservas")) {
      const fecha  = texto.split(" ")[1] || fmtFecha(new Date());
      const snap   = await get(ref(db, "reservas"));
      const todas  = snap.val() ? Object.values(snap.val()) : [];
      const delDia = todas.filter(r => r.fecha === fecha).sort((a,b) => a.hora > b.hora ? 1 : -1);
      if (delDia.length === 0) {
        await sendTelegram(chatId, `📋 No hay reservas para el ${fechaLegible(fecha)}.`);
      } else {
        const lista = delDia.map(r => `• <b>${r.hora}</b> — ${r.nombre}, ${r.personas} pax${r.telefono ? " ("+r.telefono+")" : ""}${r.notas ? "\n  💬 "+r.notas : ""}`).join("\n");
        const total = delDia.reduce((s,r) => s + parseInt(r.personas||0), 0);
        await sendTelegram(chatId, `📋 <b>Reservas del ${fechaLegible(fecha)}:</b>\n\n${lista}\n\n👥 Total: ${total} personas`);
      }
      return res.status(200).json({ ok: true });
    }

    // ── Audio / voz ───────────────────────────────────────────────────────
    const esAudio = message.voice || message.audio;
    if (esAudio) {
      await sendTelegram(chatId, "🎤 Escuchando tu mensaje de voz...");
      const fileId    = (message.voice || message.audio).file_id;
      const mimeType  = (message.voice || message.audio).mime_type || "audio/ogg";
      const audioB64  = await descargarAudio(fileId);
      if (!audioB64) {
        await sendTelegram(chatId, "❌ No he podido descargar el audio. Inténtalo de nuevo.");
        return res.status(200).json({ ok: true });
      }
      const datos = await parsearAudio(audioB64, mimeType);
      if (!datos.esReserva) {
        await sendTelegram(chatId, `🤔 No he entendido eso como una reserva en el audio.\n\nPrueba diciendo algo como:\n<i>"Mesa para cuatro el sábado a las dos de la tarde, a nombre de María"</i>`);
        return res.status(200).json({ ok: true });
      }
      await guardarReserva(chatId, datos);
      return res.status(200).json({ ok: true });
    }

    // ── Texto libre ───────────────────────────────────────────────────────
    if (texto && !texto.startsWith("/")) {
      const datos = await parsearTexto(texto);
      if (!datos.esReserva) {
        await sendTelegram(chatId,
          `🤔 No he entendido eso como una reserva.\n\nPrueba con algo como:\n<i>"Mesa para 4 el sábado a las 14:00, a nombre de María"</i>\n\nO mándame un 🎤 audio.\nUsa /ayuda para más ejemplos.`
        );
        return res.status(200).json({ ok: true });
      }
      await guardarReserva(chatId, datos);
    }

  } catch (err) {
    console.error("Error en webhook Telegram:", err);
  }

  return res.status(200).json({ ok: true });
}
