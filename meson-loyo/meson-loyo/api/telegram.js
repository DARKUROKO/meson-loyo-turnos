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
  const audioRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`);
  const buffer   = await audioRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

// ── Prompt para extraer reserva ───────────────────────────────────────────
function promptReserva(hoy) {
  const manana = fmtFecha(new Date(Date.now() + 86400000));
  return `Hoy es ${hoy}. Extrae datos de reserva de restaurante. Responde SOLO JSON sin texto extra:
{"nombre":"string o null","fecha":"YYYY-MM-DD o null","hora":"HH:MM 24h o null","personas":numero o null,"telefono":"string o null","notas":"string o null","esReserva":true/false}
Fecha: "mañana"=${manana},"hoy"=${hoy},dias semana=próximo. Hora: "2 tarde"=14:00,"9 noche"=21:00,"mediodía"=13:00.`;
}

// ── Parsear texto con Claude Haiku ────────────────────────────────────────
async function parsearTexto(texto) {
  const hoy = fmtFecha(new Date());
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: `${promptReserva(hoy)}\n\nMensaje: "${texto}"` }]
    })
  });
  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { esReserva: false }; }
}

// ── Transcribir audio con Whisper (OpenAI) si hay API key, si no con Claude ──
async function transcribirAudio(audioBase64, mimeType) {
  // Opción 1: OpenAI Whisper (si hay OPENAI_API_KEY)
  if (process.env.OPENAI_API_KEY) {
    try {
      // Convertir base64 a Blob para FormData
      const binaryStr = atob(audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const formData = new FormData();
      formData.append("file", blob, "audio.ogg");
      formData.append("model", "whisper-1");
      formData.append("language", "es");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
        body: formData
      });
      const data = await res.json();
      return data.text || null;
    } catch(e) {
      console.error("Whisper error:", e);
    }
  }

  // Opción 2: Claude con beta de audio (para formatos compatibles)
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "audio-1"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: [
            { type: "audio", source: { type: "base64", media_type: mimeType, data: audioBase64 } },
            { type: "text", text: "Transcribe exactamente lo que dice este audio en español. Solo el texto, nada más." }
          ]
        }]
      })
    });
    const data = await res.json();
    console.log("Claude audio response:", JSON.stringify(data).slice(0, 200));
    if (data.content?.[0]?.text) return data.content[0].text;
  } catch(e) {
    console.error("Claude audio error:", e);
  }

  return null;
}

// ── Parsear audio: transcribir y luego extraer reserva ────────────────────
async function parsearAudio(audioBase64, mimeType) {
  const transcripcion = await transcribirAudio(audioBase64, mimeType);
  if (!transcripcion) return { esReserva: false };
  console.log("Transcripción:", transcripcion);
  return await parsearTexto(transcripcion);
}

// ── Guardar reserva ───────────────────────────────────────────────────────
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
    id, nombre: datos.nombre, fecha: datos.fecha, hora: datos.hora,
    personas: datos.personas, telefono: datos.telefono || "",
    notas: datos.notas || "", creadoPor: "telegram"
  });

  await sendTelegram(chatId,
    `✅ <b>Reserva guardada</b>\n\n` +
    `👤 ${datos.nombre}\n📅 ${fechaLegible(datos.fecha)} a las ${datos.hora}\n` +
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

    if (AUTHORIZED_IDS.length > 0 && !AUTHORIZED_IDS.includes(userId)) {
      await sendTelegram(chatId, "❌ No tienes permiso para usar este bot.");
      return res.status(200).json({ ok: true });
    }

    // Comandos
    if (texto.startsWith("/start") || texto.startsWith("/ayuda")) {
      await sendTelegram(chatId,
        `🍽️ <b>Bot de reservas — Mesón do Loyo</b>\n\nHola ${nombre}! Escríbeme o mándame un 🎤 audio con la reserva:\n\n` +
        `• <i>"Mesa para 4 el domingo a las 13:30, a nombre de José, tel 666123456"</i>\n` +
        `• <i>"El sábado viene una familia de 6 a las 2 de la tarde, García, terraza"</i>\n\n` +
        `Comandos:\n/lista — reservas de hoy\n/reservas YYYY-MM-DD — reservas de un día`
      );
      return res.status(200).json({ ok: true });
    }

    if (texto.startsWith("/lista")) {
      const snap = await get(ref(db, "reservas"));
      const todas = snap.val() ? Object.values(snap.val()) : [];
      const hoyStr = fmtFecha(new Date());
      const hoy = todas.filter(r => r.fecha === hoyStr).sort((a,b) => a.hora > b.hora ? 1 : -1);
      if (hoy.length === 0) {
        await sendTelegram(chatId, "📋 No hay reservas para hoy.");
      } else {
        const lista = hoy.map(r => `• <b>${r.hora}</b> — ${r.nombre}, ${r.personas} pax${r.telefono ? " ("+r.telefono+")" : ""}${r.notas ? "\n  💬 "+r.notas : ""}`).join("\n");
        const total = hoy.reduce((s,r) => s + parseInt(r.personas||0), 0);
        await sendTelegram(chatId, `📋 <b>Reservas de hoy:</b>\n\n${lista}\n\n👥 Total: ${total} personas`);
      }
      return res.status(200).json({ ok: true });
    }

    if (texto.startsWith("/reservas")) {
      const fecha = texto.split(" ")[1] || fmtFecha(new Date());
      const snap = await get(ref(db, "reservas"));
      const todas = snap.val() ? Object.values(snap.val()) : [];
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

    // Audio / voz
    if (message.voice || message.audio) {
      await sendTelegram(chatId, "🎤 Procesando tu mensaje de voz...");
      try {
        const audioObj = message.voice || message.audio;
        const mimeType = message.voice ? "audio/ogg" : (audioObj.mime_type || "audio/ogg");
        const audioB64 = await descargarAudio(audioObj.file_id);
        if (!audioB64) {
          await sendTelegram(chatId, "❌ No he podido descargar el audio. Inténtalo de nuevo.");
          return res.status(200).json({ ok: true });
        }
        const datos = await parsearAudio(audioB64, mimeType);
        if (!datos || !datos.esReserva) {
          await sendTelegram(chatId,
            `🤔 No he entendido el audio como una reserva.\n\nPrueba escribiéndome el mensaje en texto — funciona igual de bien:\n<i>"Mesa para 4 el sábado a las 14:00, María"</i>`
          );
          return res.status(200).json({ ok: true });
        }
        await guardarReserva(chatId, datos);
      } catch(err) {
        console.error("Error audio:", err);
        await sendTelegram(chatId, "❌ Error procesando el audio. Por favor escríbeme la reserva como texto.");
      }
      return res.status(200).json({ ok: true });
    }

    // Texto libre
    if (texto && !texto.startsWith("/")) {
      const datos = await parsearTexto(texto);
      if (!datos || !datos.esReserva) {
        await sendTelegram(chatId,
          `🤔 No he entendido eso como una reserva.\n\nPrueba con:\n<i>"Mesa para 4 el sábado a las 14:00, a nombre de María"</i>\n\nUsa /ayuda para más ejemplos.`
        );
        return res.status(200).json({ ok: true });
      }
      await guardarReserva(chatId, datos);
    }

  } catch (err) {
    console.error("Error webhook:", err);
  }

  return res.status(200).json({ ok: true });
}
