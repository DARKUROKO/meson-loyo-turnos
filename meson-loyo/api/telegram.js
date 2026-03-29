// api/telegram.js — Webhook del bot de Telegram para Mesón do Loyo
// Desplegado automáticamente por Vercel en: https://tu-app.vercel.app/api/telegram

import { initializeApp, getApps } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

const firebaseConfig = {
  apiKey:            "AIzaSyBTVC5mQAW2hmKX5Bo6iFlXDpgtB0cBvUE",
  authDomain:        "meson-loyo.firebaseapp.com",
  databaseURL:       "https://meson-loyo-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "meson-loyo",
  storageBucket:     "meson-loyo.firebasestorage.app",
  messagingSenderId: "1052148784587",
  appId:             "1:1052148784587:web:752862e39c5345660caa4e",
};

// Evitar inicializar Firebase múltiples veces en Vercel
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getDatabase(app);

// Token del bot — ponlo como variable de entorno en Vercel (Settings > Environment Variables)
// Nombre: TELEGRAM_BOT_TOKEN  Valor: el token que te da @BotFather
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// IDs de Telegram autorizados para añadir reservas (pon el tuyo)
// Para saber tu ID escríbele a @userinfobot en Telegram
const AUTHORIZED_IDS = (process.env.TELEGRAM_AUTHORIZED_IDS || "").split(",").map(id => id.trim());

// ── Parsear mensaje de texto a reserva ──────────────────────────────────────
// Formato aceptado (flexible):
//   Mesa 4 domingo 13:30 José 666123456
//   Reserva 2 personas viernes 21:00 María notas: terraza
//   Mesa para 6 el sábado 14 de abril a las 13:30 a nombre de Ramón 600000000
function parsearReserva(texto) {
  const t = texto.toLowerCase();

  // Número de personas
  const personasMatch = texto.match(/(\d+)\s*(?:persona[s]?|pax|comensal[es]?)?/i);
  const personas = personasMatch ? parseInt(personasMatch[1]) : null;

  // Hora
  const horaMatch = texto.match(/\b(\d{1,2})[:.hH](\d{2})\b/);
  const hora = horaMatch ? `${String(horaMatch[1]).padStart(2,"0")}:${horaMatch[2]}` : null;

  // Fecha: buscar día del mes o nombre del día
  const hoy = new Date();
  let fecha = null;

  // Número de día del mes
  const diaNumMatch = texto.match(/\b(el\s+)?(\d{1,2})\s*(?:de\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)?/i);

  // Día de la semana
  const dias = { lunes:1,martes:2,miércoles:3,miercoles:3,jueves:4,viernes:5,sábado:6,sabado:6,domingo:0,hoy:null,mañana:null };
  const meses = { enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11 };

  for(const [nombre, dow] of Object.entries(dias)) {
    if(t.includes(nombre)) {
      const d = new Date();
      if(nombre==="hoy") { fecha = fmtFecha(d); break; }
      if(nombre==="mañana") { d.setDate(d.getDate()+1); fecha=fmtFecha(d); break; }
      // Próximo día de esa semana
      let diff = dow - d.getDay();
      if(diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      fecha = fmtFecha(d);
      break;
    }
  }

  // Mes en texto
  let mesNum = null;
  for(const [nombre, num] of Object.entries(meses)) {
    if(t.includes(nombre)) { mesNum = num; break; }
  }

  // Si hay número de día y mes
  const diaMatch = texto.match(/\b(\d{1,2})\b/g);
  if(!fecha && diaMatch) {
    for(const d of diaMatch) {
      const n = parseInt(d);
      if(n >= 1 && n <= 31 && n !== personas) {
        const f = new Date(hoy.getFullYear(), mesNum!==null?mesNum:hoy.getMonth(), n);
        if(f < hoy) f.setFullYear(f.getFullYear()+1);
        fecha = fmtFecha(f);
        break;
      }
    }
  }

  // Nombre: texto que viene después de "nombre de", "a nombre", o al final sin números
  let nombre = "";
  const nombreMatch = texto.match(/(?:a\s+nombre\s+de|nombre[:\s]+)\s*([A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+)?)/i);
  if(nombreMatch) nombre = nombreMatch[1];
  else {
    // Último bloque de texto sin números y sin palabras clave
    const palabrasClave = ["mesa","reserva","persona","pax","para","el","la","de","a","las","los","del","nombre","domingo","lunes","martes","miércoles","jueves","viernes","sábado","hoy","mañana","enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
    const palabras = texto.split(/\s+/).filter(w=>{
      if(/^\d/.test(w)) return false;
      const wl=w.toLowerCase().replace(/[^a-záéíóúñ]/g,"");
      return wl.length>2 && !palabrasClave.includes(wl);
    });
    if(palabras.length>0) nombre = palabras[palabras.length-1];
  }

  // Teléfono
  const telMatch = texto.match(/(?:6|7|8|9)\d{8}/);
  const telefono = telMatch ? telMatch[0] : "";

  // Notas: todo lo que venga después de "notas:" o "nota:"
  const notasMatch = texto.match(/notas?:\s*(.+)/i);
  const notas = notasMatch ? notasMatch[1].trim() : "";

  return { personas, hora, fecha, nombre: capitalize(nombre), telefono, notas };
}

function fmtFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

async function sendTelegram(chatId, texto) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ chat_id:chatId, text:texto, parse_mode:"HTML" })
  });
}

// ── Handler principal ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if(req.method !== "POST") return res.status(200).json({ ok:true });

  try {
    const { message } = req.body;
    if(!message) return res.status(200).json({ ok:true });

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const texto  = message.text || "";

    // Comprobar autorización
    if(AUTHORIZED_IDS.length > 0 && !AUTHORIZED_IDS.includes(userId)) {
      await sendTelegram(chatId, "❌ No tienes permiso para usar este bot.");
      return res.status(200).json({ ok:true });
    }

    // Comando /start o /ayuda
    if(texto.startsWith("/start") || texto.startsWith("/ayuda")) {
      await sendTelegram(chatId, `🍽️ <b>Bot de reservas — Mesón do Loyo</b>\n\nEscríbeme la reserva en lenguaje natural:\n\n<b>Ejemplos:</b>\n• <code>Mesa 4 domingo 13:30 José 666123456</code>\n• <code>Reserva 2 personas mañana 21:00 María</code>\n• <code>Mesa 6 sábado 3 de mayo 14:00 Ramón 600000001 notas: terraza</code>\n\nTambién puedes usar /lista para ver las reservas de hoy.`);
      return res.status(200).json({ ok:true });
    }

    // Comando /lista — reservas de hoy
    if(texto.startsWith("/lista")) {
      const { ref: dbRef, get } = await import("firebase/database");
      const snap = await get(ref(db, "reservas"));
      const todas = snap.val() ? Object.values(snap.val()) : [];
      const hoyStr = fmtFecha(new Date());
      const hoy = todas.filter(r=>r.fecha===hoyStr).sort((a,b)=>a.hora>b.hora?1:-1);
      if(hoy.length===0) { await sendTelegram(chatId, "📋 No hay reservas para hoy."); }
      else {
        const lista = hoy.map(r=>`• <b>${r.hora}</b> — ${r.nombre}, ${r.personas} pax${r.telefono?" ("+r.telefono+")":""}${r.notas?" — "+r.notas:""}`).join("\n");
        await sendTelegram(chatId, `📋 <b>Reservas de hoy (${hoyStr}):</b>\n${lista}\n\nTotal: ${hoy.reduce((s,r)=>s+parseInt(r.personas||0),0)} personas`);
      }
      return res.status(200).json({ ok:true });
    }

    // Parsear reserva del mensaje
    const r = parsearReserva(texto);

    if(!r.nombre || !r.fecha || !r.hora || !r.personas) {
      await sendTelegram(chatId, `⚠️ No he podido entender la reserva. Inténtalo así:\n\n<code>Mesa 4 domingo 13:30 José 666123456</code>\n\nUsa /ayuda para más ejemplos.`);
      return res.status(200).json({ ok:true });
    }

    // Guardar en Firebase
    const id = Date.now();
    await set(ref(db, `reservas/${id}`), { id, ...r, creadoPor:"telegram" });

    const dias = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
    const fechaObj = new Date(r.fecha+"T12:00:00");
    const fechaLeg = `${dias[fechaObj.getDay()]} ${fechaObj.getDate()}/${fechaObj.getMonth()+1}`;

    await sendTelegram(chatId,
      `✅ <b>Reserva guardada</b>\n\n👤 ${r.nombre}\n📅 ${fechaLeg} a las ${r.hora}\n👥 ${r.personas} personas${r.telefono?"\n📞 "+r.telefono:""}${r.notas?"\n💬 "+r.notas:""}`
    );

  } catch(err) {
    console.error("Error en webhook Telegram:", err);
  }

  return res.status(200).json({ ok:true });
}
